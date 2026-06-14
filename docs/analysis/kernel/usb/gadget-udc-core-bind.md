---
homeTag: USB · Gadget
homeTitle: Gadget UDC bind 与 connect
homeDesc: udc/core 配对、bind 链、pending 与 pullup
sidebarOrder: 55
sidebarTitle: UDC bind 分析
---

# Gadget UDC bind 与 connect

> **层**：UDC core（`drivers/usb/gadget/udc/core.c`）  
> **内核**：Linux 5.4 源码（dwc2 dual-role 平台对照）；路径与 Linux 6.8 同源，差异处另行注明  
> **关联**：[Gadget 子系统概览](/analysis/kernel/usb/gadget-subsystem) · [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) · [Gadget 内核参考](/analysis/kernel/usb/gadget-kernel-reference) · [Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm)  
> **说明**：硬件寄存器细节见 dwc2 soft_connect（待迁入）；configfs 组装内容见 [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) §5

---

## 目录

- [1. 本文要回答](#1-本文要回答)
- [2. 关键对象](#2-关键对象l3-专用)
- [3. boot：注册 UDC](#3-boot注册-udc无功能通常无-pullup)
- [4. echo UDC 完整调用链](#4-echo-udc-完整调用链)
- [5. probe 顺序无关](#5-probe-顺序无关pending-列表)
- [6. 解绑](#6-解绑echo---udc)
- [7. 多个 pullup 入口](#7-多个-pullup--connect-入口勿混)
- [8. gadget_driver 运行时回调](#8-gadget_driver-运行时回调bind-之后)
- [9. 与锚点的对应](#9-与锚点的对应)
- [10. 源码索引](#10-源码索引)
- [11. 关联文档](#11-关联文档)

---

## 1. 本文要回答

UDC 核心层是 **硬件控制器**（`usb_gadget`）与 **功能驱动**（`usb_gadget_driver`）之间的 **唯一官方配对点**：

- boot 时 `usb_add_gadget_udc()` 做了什么？
- `echo UDC` 如何触发 `udc_bind_to_driver()`？
- bind 链上 **四步** 各自职责？
- **probe 顺序无关** 如何实现？
- configfs pullup 与 role-switch / `soft_connect` 如何叠加？

## 2. 关键对象（L3 专用）

| 对象 | 谁创建 | 回答的问题 |
|------|--------|------------|
| `struct usb_gadget` | UDC 驱动（dwc2 `dwc2_gadget_init`） | 这块硬件有哪些 EP、速度？ |
| `struct usb_udc` | `usb_add_gadget_udc()` | 内核如何管理、sysfs 暴露、绑定 driver？ |
| `struct usb_gadget_driver` | configfs / legacy | 这块硬件 **扮演什么 USB 设备**？ |
| `get_gadget_data(gadget)` | bind 时 `set_gadget_data` | 指向 `usb_composite_dev`（在 configfs bind 里设置） |

关系：

```text
usb_udc  ──1:1──► usb_gadget
usb_gadget_driver  ──绑定到──► usb_udc（同时 udc->driver = driver）
configfs bind 后：get_gadget_data(gadget) → &gi->cdev
```

`struct usb_udc` 定义于 `drivers/usb/gadget/udc/core.c`（非公开头文件）；用户可见为 `/sys/class/udc/<name>`。

## 3. boot：注册 UDC（无功能、通常无 pullup）

`dwc2_gadget_init()` 末尾调用 `usb_add_gadget_udc(dev, &hsotg->gadget)`（dwc2 probe 路径见 [Gadget 子系统概览](/analysis/kernel/usb/gadget-subsystem) §4.1）。

`usb_add_gadget_udc_release()`（`udc/core.c`）核心动作：

| 步骤 | 动作 |
|------|------|
| 1 | 初始化 `gadget->dev`，`INIT_WORK(&gadget->work, usb_gadget_state_work)` |
| 2 | `kzalloc(usb_udc)`，`udc->gadget = gadget`，`gadget->udc = udc` |
| 3 | `dev_set_name(&udc->dev, "%s", kobject_name(&parent->kobj))` → UDC 名（如 `xxxx.usb-otg`） |
| 4 | `list_add_tail(&udc->list, &udc_list)` |
| 5 | `device_add(&udc->dev)` → `/sys/class/udc/` 出现 |
| 6 | `usb_gadget_set_state(NOTATTACHED)`；`udc->vbus = true` |
| 7 | **`check_pending_gadget_drivers(udc)`** — 若已有 pending 驱动则立即 bind |

此时：**有 UDC sysfs 节点，无 composite 内容，无 configfs bind**。

## 4. `echo UDC` 完整调用链

### 4.1 configfs 入口

写 `/sys/kernel/config/usb_gadget/.../UDC` → `gadget_dev_desc_UDC_store()`（`configfs.c`）：

```c
gi->composite.gadget_driver.udc_name = name;   /* kstrdup */
ret = usb_gadget_probe_driver(&gi->composite.gadget_driver);
```

`gi->composite.gadget_driver` 来自模板 `configfs_driver_template`（`bind = configfs_composite_bind`，`setup = configfs_composite_setup`）。

### 4.2 `usb_gadget_probe_driver()`

| 条件 | 行为 |
|------|------|
| `driver->udc_name` 匹配且该 UDC 空闲 | `udc_bind_to_driver(udc, driver)` |
| 指定 UDC 已被占用 | `-EBUSY` |
| 无匹配 UDC | 加入 **`gadget_driver_pending_list`**，返回 0 |

configfs 总是设置 `udc_name`，故走 **按名匹配** 路径。

### 4.3 `udc_bind_to_driver()` — 框架层 bind 链

```c
udc->driver = driver;
udc->dev.driver = &driver->driver;
udc->gadget->dev.driver = &driver->driver;

usb_gadget_udc_set_speed(udc, driver->max_speed);

ret = driver->bind(udc->gadget, driver);      /* ① configfs_composite_bind */
if (ret) goto err;

ret = usb_gadget_udc_start(udc);              /* ② dwc2 udc_start */
if (ret) { driver->unbind(...); goto err; }

usb_udc_connect_control(udc);                /* ③ pullup 决策 */
```

| 步骤 | 函数 | L3 语义 | 下层 |
|------|------|---------|------|
| ① | `gadget_driver->bind` | 装配 `cdev`、字符串、function | [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) §5 |
| ② | `usb_gadget_udc_start` | 启动 UDC 硬件侧 gadget 模式 | dwc2 `dwc2_hsotg_udc_start`（待迁入） |
| ③ | `usb_udc_connect_control` | 若 `udc->vbus` 则 pullup | `usb_gadget_connect` → dwc2 soft_connect（待迁入） |

**注意**：`composite->bind`（`usb_composite_driver` 层）在 configfs 下为 **`configfs_do_nothing`**，不被调用；组装全在 ① 完成。两层 `bind` 对比见 [Gadget 内核参考](/analysis/kernel/usb/gadget-kernel-reference) §3。

### 4.4 `usb_udc_connect_control()`

```c
if (udc->vbus)
    usb_gadget_connect(udc->gadget);
else
    usb_gadget_disconnect(udc->gadget);
```

`usb_add_gadget_udc` 时默认 **`udc->vbus = true`**，故 bind 成功后会 **`usb_gadget_connect()`** → `gadget->ops->pullup(gadget, 1)`（dwc2 清 `DCTL.SFTDISCON`）。

## 5. probe 顺序无关：pending 列表

全局链表：`gadget_driver_pending_list`（`udc/core.c`）。

| 谁先 | 行为 |
|------|------|
| **驱动先**（`echo UDC` 时 UDC 未注册） | `usb_gadget_probe_driver` → `list_add_tail(&driver->pending, ...)` |
| **UDC 后**（`usb_add_gadget_udc`） | `check_pending_gadget_drivers(udc)` → 匹配 `udc_name` → `udc_bind_to_driver` |
| **UDC 删除** 且仍有 driver | `usb_del_gadget_udc` → unbind 后 driver **重新入 pending** |

`check_pending_gadget_drivers()` 逻辑：遍历 pending，若 `!driver->udc_name` 或名字匹配当前 UDC，则 bind 并从 pending 删除。

## 6. 解绑：`echo "" > UDC`

`gadget_dev_desc_UDC_store` 空字符串 → `unregister_gadget(gi)` → `usb_gadget_unregister_driver()`：

- 在 `udc_list` 中找到 `udc->driver == driver`
- `usb_gadget_remove_driver(udc)`：disconnect → unbind → `udc_stop`
- 状态置 `USB_STATE_NOTATTACHED`
- 可能 **`check_pending_gadget_drivers`** 让其他 pending 驱动绑定空闲 UDC

## 7. 多个 pullup / connect 入口（勿混）

| 入口 | 触发 | 层次 | 典型场景 |
|------|------|------|----------|
| **`udc_bind_to_driver` 末尾** | `echo UDC` | L3 → dwc2 pullup | configfs 启用 gadget |
| **`soft_connect` sysfs** | `echo connect > .../soft_connect` | L3 直接 `usb_gadget_connect` | 调试；dwc2 soft_connect（待迁入） |
| **role-switch** | Type-C UFP | `drd.c` → `dwc2_hsotg_core_connect` | OTG 会话（待迁入） |
| **`usb_udc_vbus_handler`** | PHY/VBUS 变化 | 更新 `udc->vbus` 再 connect_control | 部分平台 |

它们 **可叠加**：例如 Type-C 已 DEVICE + configfs bind，pullup 可能已由 role-switch 建立；`udc_bind_to_driver` 仍会再调 `usb_udc_connect_control`。

**框架语义**：L3 只认 `usb_gadget_connect/disconnect`；寄存器细节在 UDC 驱动层。

## 8. `gadget_driver` 运行时回调（bind 之后）

| 回调 | configfs 实现 | 何时 |
|------|---------------|------|
| `setup` | `configfs_composite_setup` → `composite_setup` | Host EP0；composite EP0 枚举（待迁入） |
| `disconnect` / `reset` | `configfs_composite_disconnect` | 拔线、总线复位 |
| `suspend` / `resume` | `configfs_composite_*` | USB 挂起/恢复 |
| `unbind` | `configfs_composite_unbind` | `echo "" > UDC` |

dwc2 EP0 中断最终调 **`hsotg->driver->setup()`**（dwc2 EP0 控制传输，待迁入）。回调表见 [Gadget 内核参考](/analysis/kernel/usb/gadget-kernel-reference) §4。

## 9. 与锚点的对应

| 锚点 | L3 层发生的事 |
|------|----------------|
| **T0** | 无 UDC bind；仅 configfs 填 `gi->cdev` |
| **T1** | `usb_gadget_probe_driver` → **`udc_bind_to_driver` 完整链** → pullup |
| **T2** | 不在 L3；Host `SET_CONFIGURATION` 在 composite 层 |

T1 之后 Host **可以** 开始枚举（读描述符）；T2 之后 ACM **数据面** 才通（见 [Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm)）。

## 10. 源码索引

| 函数 | 文件 | 行号约 |
|------|------|--------|
| `usb_add_gadget_udc_release` | `udc/core.c` | 1174 |
| `check_pending_gadget_drivers` | `udc/core.c` | 1147 |
| `udc_bind_to_driver` | `udc/core.c` | 1345 |
| `usb_gadget_probe_driver` | `udc/core.c` | 1380 |
| `usb_gadget_unregister_driver` | `udc/core.c` | 1425 |
| `usb_udc_connect_control` | `udc/core.c` | 1022 |
| `usb_gadget_connect` | `udc/core.c` | 667 |
| `soft_connect_store` | `udc/core.c` | 1474 |
| `gadget_dev_desc_UDC_store` | `configfs.c` | 256 |
| `configfs_composite_bind` | `configfs.c` | 1236 |

## 11. 关联文档

| 文档 | 内容 |
|------|------|
| [Gadget 子系统概览](/analysis/kernel/usb/gadget-subsystem) | 四层架构、两阶段生命周期、pending 列表 |
| [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) | `echo UDC` 时 `configfs_composite_bind` 焊合内容 |
| [Gadget 内核参考](/analysis/kernel/usb/gadget-kernel-reference) | 结构体、两层 bind、回调速查 |
| [Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm) | 脚本实操与 Host 侧验证 |
| composite EP0 枚举（待迁入） | `composite_setup` 与 Host 标准请求 |
| dwc2 soft_connect / role-switch（待迁入） | pullup 寄存器与 OTG 切换 |
