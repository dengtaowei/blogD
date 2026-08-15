---
homeTag: USB · Gadget
homeTitle: Gadget ACM Function 路径
homeDesc: f_acm.c 与 u_serial.c 的 bind、set_alt 与 ttyGS 数据面
sidebarOrder: 58
sidebarTitle: ACM Function 路径
date: 2026-06-14
---

# Gadget ACM Function 路径

> **层**：Function（`f_acm.c` + `u_serial.c`）  
> **深度**：T2 专深（`SET_CONFIGURATION` 之后数据面）  
> **内核**：Linux 5.4 源码（dwc2 dual-role 平台对照）；路径与 Linux 6.8 同源，差异处另行注明  
> **关联**：[Composite EP0 枚举](/analysis/kernel/usb/gadget-composite-ep0) · [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) · [DWC2 接口总览](/analysis/kernel/usb/gadget-dwc2-interface) · [UDC bind 分析](/analysis/kernel/usb/gadget-udc-core-bind) · [Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm)  
> **说明**：bulk `usb_ep_queue` 见 [DWC2 接口总览](/analysis/kernel/usb/gadget-dwc2-interface) §3.4；实践脚本见 [Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm)

---

## 目录

- [1. 本文要回答](#1-本文要回答)
- [2. 文件分工](#2-文件分工)
- [3. 阶段 A：T0 — mkdir acm.0](#3-阶段-at0--mkdir-acm0)
- [4. 阶段 B：T1 bind — acm_bind](#4-阶段-bt1-bind--acm_bind)
- [5. 阶段 C：T2 — acm_set_alt 与 gserial_connect](#5-阶段-ct2--acm_set_alt-与-gserial_connect)
- [6. 阶段 D：数据 I/O](#6-阶段-d数据-io)
- [7. 阶段 E：去激活](#7-阶段-e去激活--acm_disable--disconnect)
- [8. 时间线总览](#8-时间线总览acm-专用)
- [9. 调试提示](#9-调试提示)
- [10. 源码索引](#10-源码索引)
- [11. 关联文档](#11-关联文档)

---

## 1. 本文要回答

以 **`acm.0` → `/dev/ttyGS0`** 为例，从 configfs 创建 function 到 Host 能读写串口，L4 层经历哪些阶段：

| 阶段 | 何时 | 关键函数 |
|------|------|----------|
| **实例化** | `mkdir acm.0` | `acm_alloc_inst` → **`gserial_alloc_line`** |
| **bind** | T1 `configfs_composite_bind` | **`acm_bind`**：interface ID、EP autoconfig |
| **激活** | T2 `SET_CONFIGURATION` | **`acm_set_alt`** → **`gserial_connect`** |
| **I/O** | Host open + 数据 | **`gs_start_io`**、bulk 完成回调 |
| **关闭** | reset config / disconnect | **`acm_disable`** → **`gserial_disconnect`** |

前置：`set_alt` 触发点见 [Composite EP0 枚举](/analysis/kernel/usb/gadget-composite-ep0) §4；configfs `mkdir acm.0` 见 [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) §4。

---

## 2. 文件分工

| 文件 | 职责 |
|------|------|
| **`f_acm.c`** | USB 描述符、CDC class、`acm_bind/set_alt/setup`、notify EP |
| **`u_serial.c`** | **`gserial_*`** glue：TTY 驱动、`ttyGS*`、`gs_port`、bulk 请求池 |
| **`configfs.c`** | `usb_function_instance` 注册、`acm.0` 属性 |

`struct gserial` 是 **USB 端点 ↔ TTY 端口** 的桥梁；`struct f_acm` 内嵌 `struct gserial port`。

---

## 3. 阶段 A：T0 — `mkdir acm.0`

configfs 创建 `acm.0` → `acm_alloc()` → **`gserial_alloc_line(&acm->port_num)`**（`u_serial.c`）：

1. 找空闲 `port_num`（0 … `MAX_U_SERIAL_PORTS-1`）
2. `gs_port_alloc()` — 分配 `gs_port`、默认 line coding 9600 8N1
3. **`tty_port_register_device(..., gs_tty_driver, port_num, ...)`** → 预创 **`/dev/ttyGS0`**
4. `gserial_console_init()`（若启用 console）

此时尚 **未** bind 到 gadget，**无** USB EP；TTY 节点存在但无 carrier。

---

## 4. 阶段 B：T1 bind — `acm_bind()`

在 `configfs_composite_bind` 里对每个 function 调用 `usb_add_function(c, f)` → **`acm_bind(c, f)`**：

| 步骤 | 代码要点 |
|------|----------|
| 字符串 | `usb_gstrings_attach(acm_strings, ...)` → interface 字符串 ID |
| Interface | 两次 **`usb_interface_id`** → `acm->ctrl_id`、`acm->data_id`；写 IAD、union、call-mgmt 描述符 |
| 端点 | 三次 **`usb_ep_autoconfig`**：bulk IN、bulk OUT、interrupt notify |
| 描述符表 | `usb_assign_descriptors(f, acm_fs_function, acm_hs_function, acm_ss_function, NULL)` |
| notify | `gs_alloc_req(notify_ep, ...)` + `acm_cdc_notify_complete` |

**bind 不 enable EP**，也不 `gserial_connect`。EP 地址在 autoconfig 时分配，描述符挂到 `f->fs_descriptors` 等供 EP0 GET_DESCRIPTOR。

---

## 5. 阶段 C：T2 — `acm_set_alt()` 与 `gserial_connect()`

Host **`SET_CONFIGURATION`** → composite **`set_config`** → 对每个 function 调 **`acm_set_alt(f, intf, 0)`**。

ACM 有两个 interface（control + data），`set_alt` 按 **`intf`** 分支：

### 5.1 Control interface（`intf == acm->ctrl_id`）

```c
usb_ep_disable(acm->notify);
config_ep_by_speed(..., acm->notify);
usb_ep_enable(acm->notify);
```

启用 **CDC notification**（SerialState 等），**不**走 `gserial_connect`。

### 5.2 Data interface（`intf == acm->data_id`）

```c
if (acm->notify->enabled) {
    gserial_disconnect(&acm->port);   /* 复配时先断 */
}
config_ep_by_speed(..., acm->port.in/out);
gserial_connect(&acm->port, acm->port_num);
```

**`gserial_connect`**（`u_serial.c`）：

| 步骤 | 动作 |
|------|------|
| 1 | `usb_ep_enable(gser->in/out)`，`driver_data = port` |
| 2 | `port->port_usb = gser`，`gser->ioport = port` |
| 3 | 若 TTY 已 open（`port->port.count > 0`）→ **`gs_start_io(port)`** |
| 4 | 可选 `gser->connect()` 回调（ACM 用于 DTR 等） |

**T2 完成标志**：bulk IN/OUT 已 enable，TTY 层认为 USB link active（类似 carrier detect）。

---

## 6. 阶段 D：数据 I/O

Host 侧打开 `/dev/ttyACM0` 并配置 line coding；Device 侧若已 `gserial_connect`：

### 6.1 TTY open → 启动 USB I/O

用户 `open("/dev/ttyGS0")` → TTY core → 若 `port->port_usb` 非空 → **`gs_start_io(port)`**：

- 在 bulk OUT 上挂 **`gs_read_complete`** 请求池（收 Host 数据 → 放入 TTY flip buffer）
- 在 bulk IN 上准备 **`gs_write_complete`** 池（TTY write → USB IN）

### 6.2 方向对照

| 方向 | USB | TTY 用户态 |
|------|-----|------------|
| Host → Device | bulk **OUT** | read `ttyGS0` |
| Device → Host | bulk **IN** | write `ttyGS0` |

底层 **`usb_ep_queue`** 由 UDC（dwc2）完成，经 `ep_ops.queue`（[DWC2 接口总览](/analysis/kernel/usb/gadget-dwc2-interface) §3.4）；`DxEPDMA` 详读见 dwc2 Buffer DMA（待迁入）。

### 6.3 CDC class EP0（并行）

Host **`SET_LINE_CODING`** / **`SET_CONTROL_LINE_STATE`** → **`acm_setup`** → 更新 `port_line_coding`、DTR/RTS 通知。与 bulk 数据面正交，仍走 EP0（[Composite EP0 枚举](/analysis/kernel/usb/gadget-composite-ep0) §6）。

---

## 7. 阶段 E：去激活 — `acm_disable()` / disconnect

| 触发 | 路径 |
|------|------|
| `SET_CONFIGURATION 0` / 换配置 | `reset_config` → **`acm_disable`** |
| USB disconnect | `composite_disconnect` → disable functions |

**`acm_disable`**：

```c
gserial_disconnect(&acm->port);
usb_ep_disable(acm->notify);
```

**`gserial_disconnect`**：清 `port_usb`、TTY hangup、`usb_ep_disable` in/out、释放 request 池。

---

## 8. 时间线总览（ACM 专用）

```
T0  mkdir acm.0
      └─ gserial_alloc_line → /dev/ttyGS0 出现（无 USB）

T1  echo UDC → configfs_composite_bind
      └─ acm_bind：EP 号、描述符进 composite
      └─ pullup → Host 枚举（Composite EP0）

T2  Host SET_CONFIGURATION
      └─ acm_set_alt(notify) + acm_set_alt(data)
      └─ gserial_connect → bulk enable

T2+ Host open ttyACM + 用户 open/write ttyGS0
      └─ gs_start_io ↔ bulk DMA

Teardown  echo "" > UDC / disconnect
      └─ acm_disable / gserial_disconnect
```

---

## 9. 调试提示

| 现象 | 可能 L4 原因 |
|------|----------------|
| 有 `ttyGS0` 但无法读写 | T2 未到：`gserial_connect` 未执行（未 SET_CONFIGURATION） |
| `lsusb` 无 ACM | T0/T1：function 未挂进 config 或 bind 失败 |
| 一端 open 无数据 | 仅 Host 或仅 Device open；需 **`gs_start_io`** 两侧至少 Device open |
| 拔线 hangup | 正常：`gserial_disconnect` → `tty_hangup` |

`dmesg` 关键字：`activate acm ttyGS0`、`gserial_connect: start ttyGS0`、`acm ttyGS0 deactivated`。

---

## 10. 源码索引

| 函数 | 文件 | 行号约 |
|------|------|--------|
| `acm_alloc` / `acm_free_inst` | `f_acm.c` | 719+ |
| `acm_bind` / `acm_unbind` | `f_acm.c` | 606 / 709 |
| `acm_set_alt` / `acm_disable` | `f_acm.c` | 420 / 464 |
| `acm_setup` | `f_acm.c` | ~330 |
| `gserial_alloc_line` | `u_serial.c` | 1220 |
| `gserial_connect` / `gserial_disconnect` | `u_serial.c` | 1288 / 1364 |
| `gs_start_io` | `u_serial.c` | 536 |
| `gs_read_complete` / `gs_write_complete` | `u_serial.c` | 450 / 461 |

---

## 11. 关联文档

| 文档 | 内容 |
|------|------|
| [Composite EP0 枚举](/analysis/kernel/usb/gadget-composite-ep0) | EP0、`SET_CONFIGURATION`、`set_alt` 触发 |
| [UDC bind 分析](/analysis/kernel/usb/gadget-udc-core-bind) | `echo UDC`、pullup 与 T1 |
| [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) | `mkdir acm.0`、`gadget_info` 拼装 |
| [Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm) | 脚本实操、`lsusb` 与 Host `cdc_acm` |
| [DWC2 接口总览](/analysis/kernel/usb/gadget-dwc2-interface) | `ep_ops.queue` 与 bulk 硬件路径 |
| dwc2 Buffer DMA（待迁入） | `DxEPDMA`、`start_req` 详读 |
