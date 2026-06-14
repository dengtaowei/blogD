---
homeTag: USB · Gadget
homeTitle: Gadget 内核结构体与回调参考
homeDesc: gadget_info、cdev、回调与脚本映射速查
sidebarOrder: 54
sidebarTitle: Gadget 内核参考
date: 2026-06-14
---

# Gadget 内核结构体与回调参考

> **内核**：Linux 5.4 源码（dwc2 dual-role 平台对照）；路径与 Linux 6.8 同源，差异处另行注明  
> **示例**：`deferred_fb_serial` + `functions/acm.0`  
> **用途**：结构体、回调、映射表（调试时查阅）  
> **关联**：[Gadget 子系统概览](/analysis/kernel/usb/gadget-subsystem) · [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) · [Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm)

---

## 目录

- [1. 与子系统概览的关系](#1-与子系统概览的关系)
- [2. 核心结构体](#2-核心结构体)
- [3. 两层 bind](#3-两层-bindconfigfs)
- [4. 回调函数一览](#4-回调函数一览)
- [5. configfs 脚本映射](#5-configfs-脚本--结构体映射)
- [6. 生命周期](#6-生命周期)
- [7. 关系总图](#7-关系总图)
- [8. 源码索引](#8-源码索引)
- [9. 关联文档](#9-关联文档)

---

## 1. 与子系统概览的关系

全栈四层模型见 [Gadget 子系统概览](/analysis/kernel/usb/gadget-subsystem) §2。  
组装过程见 [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly)。

本文 **configfs 视角** 的数据流（从脚本到 ttyGS）：

```text
create() 脚本 → gadget_info → cdev + composite → UDC bind
  → composite_setup (EP0) → acm → ttyGS0 ⟷ Host ttyACM/COM
```

以下各节为 **结构体 / 回调字典**，不再重复架构叙述。

## 2. 核心结构体

### 2.1 `struct gadget_info` — configfs 总容器

**文件：** `drivers/usb/gadget/configfs.c`

```c
struct gadget_info {
    struct config_group group;           /* configfs 根：deferred_fb_serial */
    struct config_group functions_group; /* mkdir functions/acm.0 */
    struct config_group configs_group;   /* mkdir configs/c.1 */
    struct config_group strings_group;   /* mkdir strings/0x409 */
    struct config_group os_desc_group;

    struct mutex lock;
    struct list_head string_list;      /* gadget_strings 链表 */
    struct list_head available_func;     /* usb_function_instance 链表 */

    struct usb_composite_driver composite;  /* 驱动壳 */
    struct usb_composite_dev    cdev;       /* 设备体 */
    ...
};
```

| 成员 | 作用 |
|------|------|
| `cdev` | Host 看到的「整台 USB 设备」 |
| `composite` | 管理 cdev、挂 UDC 的驱动框架 |
| `string_list` | 设备级字符串（manufacturer/product/serial） |
| `available_func` | 已创建的 function 实例（acm.0），待链入 config |

**创建：** `mkdir deferred_fb_serial` → `gadgets_make()` → `kzalloc(gadget_info)`。

### 2.2 `struct usb_composite_dev` — 设备体（cdev）

**文件：** `include/linux/usb/composite.h`（注释名 `usb_composite_device`，代码名 `usb_composite_dev`）

**含义：** 内核里 **一台 composite USB 从机** 的运行时实例——不是 dwc2 本身，也不是单个 acm，而是把控制器 + 描述符 + 多个 configuration/function 捆在一起的总控。

```c
struct usb_composite_dev {
    struct usb_gadget          *gadget;   /* 绑定的 UDC（dwc2） */
    struct usb_request         *req;      /* EP0 控制传输缓冲 */
    struct usb_configuration   *config;   /* Host 当前选中的 configuration */
    struct usb_device_descriptor desc;     /* Device Descriptor（VID/PID…） */
    struct list_head           configs;   /* 所有 configuration */
    struct list_head           gstrings;
    struct usb_composite_driver *driver;  /* 指回 composite 驱动 */
    ...
};
```

| 字段 | 脚本 / 时机 |
|------|-------------|
| `desc` | `echo idVendor/idProduct/…` |
| `configs` | `mkdir configs/c.1` |
| `config` | Host `SET_CONFIGURATION` 后指向 `c.1` |
| `gadget` | `echo UDC` bind 时 = dwc2 |
| `req` | bind 时 `composite_dev_prepare()` 分配 |

### 2.3 `struct usb_composite_driver` — 驱动壳

**含义：** **怎么管** cdev——回调、速度、内嵌的 `gadget_driver`（真正注册 UDC）。

```c
struct usb_composite_driver {
    const char *name;

    int  (*bind)(struct usb_composite_dev *cdev);
    int  (*unbind)(struct usb_composite_dev *);
    void (*disconnect)(struct usb_composite_dev *);
    void (*suspend)(struct usb_composite_dev *);
    void (*resume)(struct usb_composite_dev *);

    struct usb_gadget_driver gadget_driver;     /* 嵌套：UDC 只认这一层 */
};
```

configfs 下 `gi->composite.bind/unbind` 设为 **`configfs_do_nothing`**，设备组装由用户脚本 + **`gadget_driver->bind`**（`configfs_composite_bind`）完成。

| 对比 | cdev | composite driver |
|------|------|------------------|
| 角色 | **是什么**（状态、描述符） | **怎么管**（回调、注册） |
| Host | 间接可见（描述符来自 cdev） | 不可见 |

### 2.4 零件结构体（汇入 cdev）

| 结构体 | configfs 操作 | 作用 |
|--------|---------------|------|
| `gadget_strings` | `strings/0x409` + echo | 设备字符串；bind 时 → `cdev.desc.i*` |
| `config_usb_cfg` | `configs/c.1` | 含 `usb_configuration c` + `func_list` |
| `gadget_config_name` | `configs/c.1/strings/0x409` | 配置字符串 → `iConfiguration` |
| `usb_function_instance` | `functions/acm.0` | 实例；`gserial_alloc_line` → ttyGS 端口号 |
| `usb_function` | `ln acm.0 configs/c.1/` | bind 时 `usb_add_function`；生成 interface/endpoint |

### 2.5 `struct usb_gadget` / `struct usb_gadget_driver`

**`usb_gadget`：** UDC 硬件抽象（端点、速度、pullup）。UDC 名见 `/sys/class/udc/`。

**`usb_gadget_driver`：** UDC 核心 **唯一直接调用** 的驱动接口：

```c
struct usb_gadget_driver {
    char *function;
    enum usb_device_speed max_speed;
    int  (*bind)(struct usb_gadget *, struct usb_gadget_driver *);
    void (*unbind)(struct usb_gadget *);
    int  (*setup)(struct usb_gadget *, const struct usb_ctrlrequest *);
    void (*disconnect)(struct usb_gadget *);
    void (*suspend)(struct usb_gadget *);
    void (*resume)(struct usb_gadget *);
    void (*reset)(struct usb_gadget *);
    char *udc_name;
    ...
};
```

## 3. 两层 `bind`（configfs）

UDC 只调用 **`gadget_driver->bind`**。configfs 路径下，设备组装 **全部在 `configfs_composite_bind` 里完成**；`composite->bind` 为 **`configfs_do_nothing`**，不会被用到。

```text
echo UDC
  → udc_bind_to_driver()
       → gadget_driver->bind  = configfs_composite_bind
            → cdev->gadget = dwc2
            → composite_dev_prepare()
            → usb_gstrings_attach()、usb_add_function(acm) …
            （不调用 composite->bind）
       → usb_gadget_udc_start()
       → pullup
```

| | `gadget_driver->bind` | `composite_driver->bind` |
|--|----------------------|--------------------------|
| configfs 实现 | `configfs_composite_bind` | `configfs_do_nothing` |
| 调用者 | UDC core | 不调用 |
| 参数 | `gadget` + `driver` | — |
| 干什么 | 关联 cdev↔硬件；attach 字符串；`usb_add_function` | 空操作 |

用户脚本在 bind **之前** 往 `cdev` 填好 `desc`、`configs`、`func_list`；bind 时 **焊合** 并 pullup。

## 4. 回调函数一览

### 4.1 `configfs_driver_template`（`gadget_driver` 层）

**文件：** `drivers/usb/gadget/configfs.c`  
**赋值：** `gi->composite.gadget_driver = configfs_driver_template`（`gadgets_make`）

| 回调 | 实现 | 何时 | 做什么 |
|------|------|------|--------|
| **bind** | `configfs_composite_bind` | `echo UDC > UDC` | 关联 cdev↔gadget；字符串 attach；`usb_add_function(acm)`；生成完整描述符 |
| **unbind** | `configfs_composite_unbind` | `echo "" > UDC` / 删除 gadget | `purge_configs_funcs`；`composite_dev_cleanup`；清 gadget_data |
| **setup** | `configfs_composite_setup` | Host EP0 控制传输 | 加锁 → `composite_setup()`：GET_DESCRIPTOR、SET_CONFIGURATION 等 |
| **reset** | `configfs_composite_disconnect` | 总线复位 | → `composite_disconnect()`：reset_config |
| **disconnect** | `configfs_composite_disconnect` | 拔线 / session 结束 | → `composite_disconnect()`：disable function、`gserial_disconnect` |
| **suspend** | `configfs_composite_suspend` | USB 挂起 | → `composite_suspend()`：function suspend、降 VBUS 电流 |
| **resume** | `configfs_composite_resume` | USB 恢复 | → `composite_resume()` |

### 4.2 `usb_composite_driver` 层（configfs 下未使用）

`gadgets_make()` 里设置：

```c
gi->composite.bind    = configfs_do_nothing;
gi->composite.unbind  = configfs_do_nothing;
gi->composite.suspend = NULL;
gi->composite.resume  = NULL;
```

| 回调 | configfs |
|------|----------|
| `bind(cdev)` / `unbind(cdev)` | `configfs_do_nothing` |
| `disconnect` / `suspend` / `resume` | NULL |

实际逻辑在 **`gadget_driver`** 的 `setup` / `disconnect` / `suspend` / `resume` 中。

### 4.3 `composite_setup()` 处理的 Host 请求（经 `gadget_driver->setup`）

| 请求 | 效果 |
|------|------|
| `GET_DESCRIPTOR(DEVICE)` | 从 `cdev.desc` 回复 VID/PID 等 |
| `GET_DESCRIPTOR(CONFIG)` | configuration + interfaces（acm 2 接口 + IAD） |
| `GET_DESCRIPTOR(STRING)` | manufacturer/product/serial |
| `SET_CONFIGURATION` | `cdev.config = c.1`；acm enable；**`gserial_connect` → ttyGS0 通** |
| CDC 类请求 | 转 acm `setup`（如 SET_LINE_CODING） |

### 4.4 ACM function 回调（`f_acm.c`，简要）

| 回调 | 作用 |
|------|------|
| `bind` | 注册 CDC Communication + Data 描述符 |
| `set_alt` / `enable` | 使能端点 |
| `setup` | CDC 管理请求（波特率、DTR/RTS） |
| `disable` | 关端点；`gserial_disconnect` |
| （经 `gserial_connect`） | USB bulk 与 **ttyGS** 数据路径联通 |

## 5. configfs 脚本 → 结构体映射

| 脚本命令 | 内核动作 | 主要写入 |
|----------|----------|----------|
| `modprobe libcomposite` | 注册 `usb_gadget` configfs 子系统 | — |
| `mkdir deferred_fb_serial` | `gadgets_make()` | `gadget_info`；初始化 `cdev`、`composite.gadget_driver` |
| `echo … > idVendor` 等 | `gadget_dev_desc_*_store` | `cdev.desc` |
| `mkdir strings/0x409` + echo | `gadget_strings` + `kstrdup` | `string_list` |
| `mkdir configs/c.1` | `config_desc_make` | `cdev.configs` |
| `echo MaxPower / configuration` | config 属性 store | `cfg->c.MaxPower`、配置字符串 |
| `mkdir functions/acm.0` | `function_make` → `acm_alloc_instance` | `available_func`；`port_num` |
| `ln acm.0 configs/c.1/` | `config_usb_cfg_link` | `cfg->func_list` |
| `echo UDC` | `gadget_dev_desc_UDC_store` → **bind** | `cdev.gadget`；描述符树完整；pullup |

## 6. 生命周期

```text
[配置阶段]  mkdir / echo / ln     cdev 在内存中逐渐填满，USB 不可见
[绑定阶段]  echo UDC              gadget_driver.bind → pullup
[枚举阶段]  Host EP0              setup → GET_DESCRIPTOR / SET_ADDRESS
[激活阶段]  SET_CONFIGURATION     gserial_connect → ttyGS0 可收发
[断开阶段]  拔线 / reset          disconnect → reset_config
[解绑阶段]  echo "" > UDC         unbind → 释放 function、EP0
```

## 7. 关系总图

```text
                    gadget_info
         ┌──────────────────────────────────┐
         │  usb_composite_dev cdev          │
         │    desc ← idVendor/Product       │
         │    configs ← c.1 ← acm function    │
         │    gadget ← dwc2 (bind 后)       │
         │    config ← Host SET_CONFIG 后   │
         ├──────────────────────────────────┤
         │  usb_composite_driver composite  │
         │    gadget_driver ────────────────┼──→ UDC core
         │      .bind  = configfs_composite_bind
         │      .setup = configfs_composite_setup
         │      .disconnect / suspend / resume
         │    .bind = do_nothing (configfs) │
         └──────────────────────────────────┘
                          │
              composite_setup(cdev, ctrl)
                          │
                    Host 枚举 / ttyACM0
```

## 8. 源码索引

| 主题 | 路径 |
|------|------|
| `gadget_info`、configfs 回调模板 | `drivers/usb/gadget/configfs.c` |
| `usb_composite_dev` / `usb_composite_driver` | `include/linux/usb/composite.h` |
| `composite_setup`、EP0 处理 | `drivers/usb/gadget/composite.c` |
| ACM function | `drivers/usb/gadget/function/f_acm.c` |
| ttyGS | `drivers/usb/gadget/function/u_serial.c` |
| UDC bind | `drivers/usb/gadget/udc/core.c` |
| dwc2 gadget | `drivers/usb/dwc2/gadget.c` |
| configfs mkdir | `fs/configfs/dir.c` |
| 字符串宏 | `include/linux/usb/gadget_configfs.h` |

## 9. 关联文档

| 文档 | 内容 |
|------|------|
| [Gadget 子系统概览](/analysis/kernel/usb/gadget-subsystem) | 四层架构、两阶段生命周期 |
| [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) | 脚本逐步拼装 `cdev` / `composite` |
| [Gadget 内核参考](/analysis/kernel/usb/gadget-kernel-reference) | 结构体、两层 bind、回调速查 |
| [UDC bind 分析](/analysis/kernel/usb/gadget-udc-core-bind) | `udc/core` 配对、bind 链与 pullup |
| [Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm) | 脚本实操、`ttyGS0` 与 Host `cdc_acm` |
| composite EP0 枚举（待迁入） | `composite_setup` 与 Host 标准请求 |
