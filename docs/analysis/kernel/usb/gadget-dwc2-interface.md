---
homeTag: USB · Gadget
homeTitle: DWC2 Gadget 三层接口总览
homeDesc: gadget_ops、ep_ops 与 usb_gadget_driver 交付边界
sidebarOrder: 55
sidebarTitle: DWC2 接口总览
date: 2026-06-15
---

# DWC2 Gadget 三层接口总览

> **层**：L1 UDC（`drivers/usb/dwc2/gadget.c`）  
> **内核**：Linux 5.4 源码（dwc2 dual-role 平台对照）；路径与 Linux 6.8 同源，差异处另行注明  
> **配置**：Buffer DMA（`g_dma=1`，`g_dma_desc=0`）  
> **关联**：[Gadget 子系统概览](/analysis/kernel/usb/gadget-subsystem) · [UDC bind 分析](/analysis/kernel/usb/gadget-udc-core-bind) · [DWC2 USBTRDTIM 选值](/analysis/kernel/usb/gadget-dwc2-turnaround-time) · [Composite EP0 枚举](/analysis/kernel/usb/gadget-composite-ep0) · [ACM Function 路径](/analysis/kernel/usb/gadget-function-acm)  
> **说明**：本文「三层」指硬件↔dwc2↔框架的交付边界，与 [Gadget 子系统概览](/analysis/kernel/usb/gadget-subsystem) 的 L0–L4 分层编号不同

---

## 目录

- [1. 概述](#1-概述)
- [2. 三条交付线](#2-三条交付线)
- [3. dwc2 → 框架](#3-dwc2--框架硬件能力的抽象)
- [4. 框架 → dwc2](#4-框架--dwc2上层意图的下发)
- [5. 与 echo UDC 时间线](#5-与-echo-udc-时间线)
- [6. 关联文档](#6-关联文档)
- [7. 源码索引](#7-源码索引)

---

## 1. 概述

硬件向 dwc2 提供的核心是 **寄存器接口** 与 **中断**：驱动写寄存器配置端点，收中断得知传输完成、SETUP 与复位/挂起；外加 **端点通道**（`GHWCFG2`）与 **Buffer DMA**（`DxEPDMA` / `DIEPDMA`）。链路上 token、ACK/NAK 由 **MAC** 自动完成。

dwc2 向 Gadget 框架提供的核心是 **两套 ops**：**`gadget_ops`** 管整机（启停、上拉连总线），**`ep_ops`** 管端点（配置、提交传输、完成交还）；外加 **端点清单**（各 `usb_ep` 的名称与能力）。控制面走 **`setup`**，数据面走 **`queue` → `giveback`**。

框架向 dwc2 提供的核心是 **一套 `usb_gadget_driver` 回调**：**`setup`** 管 EP0 控制，**disconnect / suspend / resume** 管总线事件；数据面提供 **`usb_request`**。

probe 与 `usb_add_gadget_udc` 见 [Gadget 子系统概览](/analysis/kernel/usb/gadget-subsystem) §4.1；`echo UDC` 后 `udc_bind_to_driver` 四步见 [UDC bind 分析](/analysis/kernel/usb/gadget-udc-core-bind) §4。

---

## 2. 三条交付线

```mermaid
flowchart LR
  HW[硬件寄存器 / 中断 / DMA]
  DWC2[dwc2 gadget.c]
  FW[Gadget 框架 + composite]

  HW -->|寄存器 中断 端点通道| DWC2
  DWC2 -->|usb_gadget usb_ep ops| FW
  FW -->|gadget_driver usb_request| DWC2
```

| 交付方向 | 交付物 |
|----------|--------|
| **硬件 → dwc2** | 寄存器、中断、端点通道、Buffer DMA |
| **dwc2 → 框架** | `usb_gadget`、`usb_ep` 列表、两套 `ops` |
| **框架 → dwc2** | `usb_gadget_driver`、描述符、`usb_request` |

---

## 3. dwc2 → 框架：硬件能力的抽象

probe 阶段 dwc2 读 `GHWCFG2` 得知有几路端点，再包装成框架认识的 `usb_gadget` + 多个 `usb_ep`，挂上两套 ops。

### 3.1 整机：`struct usb_gadget`

| 字段 | 注册时（`dwc2_gadget_init`） | 运行中 dwc2 维护 |
|------|------------------------------|------------------|
| `ops` | `&dwc2_hsotg_gadget_ops` | — |
| `name` | `dev_name(dev)`（如 `49000000.usb-otg`） | — |
| `max_speed` | `USB_SPEED_HIGH` | — |
| `ep0` | `&eps_out[0]->ep` | — |
| `ep_list` | 各非零 ep `list_add_tail`（`initep`） | — |
| `is_otg` | `dr_mode == OTG` 时为 1 | — |
| `lpm_capable` | `params.lpm` 时 true | — |
| `sg_supported` | — | `udc_start`：Descriptor DMA 时 true |
| `speed` | — | `ENUMDONE` 后 LS/FS/HS |
| `state` | — | `usb_gadget_set_state()` |

`ep_list` 是上层 `usb_ep_autoconfig()` 遍历的入口；**EP0 单独走 `gadget.ep0`，不进链表**。

### 3.2 整机 ops：`dwc2_hsotg_gadget_ops`（6 项）

框架通过 `gadget->ops` 控制 UDC 生命周期与连接，不直接碰寄存器。与 [UDC bind 分析](/analysis/kernel/usb/gadget-udc-core-bind) 的对应：

| 回调 | 作用 | bind 链中的位置 |
|------|------|-----------------|
| `get_frame` | 读 USB 帧号 | — |
| `udc_start` | 保存 `hsotg->driver`，初始化硬件 | `usb_gadget_udc_start()` → ② |
| `udc_stop` | 停 UDC，清 `hsotg->driver` | `echo "" > UDC` / unbind |
| `pullup` | 软连接 / 断开（`DCTL.SFTDISCON`） | `usb_gadget_connect()` → ③ |
| `vbus_session` | VBUS 会话通知 | OTG / role-switch |
| `vbus_draw` | 总线供电电流（mA） | — |

### 3.3 端点：`struct usb_ep`（`dwc2_hsotg_initep`）

每个硬件通道对应一个 `dwc2_hsotg_ep`，其中的 `ep` 成员交给框架。

| 字段 | 内容 |
|------|------|
| `name` | `ep0` / `ep1in` / `ep1out` / … |
| `ops` | `&dwc2_hsotg_ep_ops` |
| `ep_list` | 非零 ep 挂入 `gadget.ep_list` |
| `caps` | 类型（control / bulk / int / iso）、方向（`dir_in` / `dir_out`） |
| `maxpacket_limit` | ep0: `EP0_MPS_LIMIT`；其它: 1024（LS 为 8） |

**硬件对象从哪来**：`dwc2_hsotg_hw_cfg()` 读 `GHWCFG2` 的 `num_dev_ep`、`dev_ep_dirs`，按端点号创建 `eps_in[]` / `eps_out[]`；EP0 为 `eps_in[0] == eps_out[0]`，方向在控制传输中动态切换。

### 3.4 端点 ops：`dwc2_hsotg_ep_ops`（7 项）

框架经 `ep->ops` 驱动具体传输；每条 `usb_ep_queue()` 最终落到 `queue` → `start_req()`。[ACM Function 路径](/analysis/kernel/usb/gadget-function-acm) 中 bulk 数据面经此路径。

| 回调 | 作用 |
|------|------|
| `enable` | 配 `DxEPCTL`（类型、MPS、方向） |
| `disable` | 关闭端点 |
| `alloc_request` / `free_request` | 分配 `dwc2_hsotg_req` |
| `queue` | DMA map + `start_req()`（`DxEPTSIZ` / `DxEPDMA` / `EPENA`） |
| `dequeue` | 取消请求 |
| `set_halt` | STALL / 清 STALL |

未实现：`fifo_status`、`fifo_flush`、`set_wedge`。`queue` 与 `DxEPDMA` 详读见 dwc2 Buffer DMA（待迁入）。

---

## 4. 框架 → dwc2：上层意图的下发

bind 之后，框架把 **「谁在用这块 UDC」** 和 **「传什么数据」** 交给 dwc2；dwc2 不解析业务，只执行 enable / queue 并回报完成。

### 4.1 框架 API（dwc2 主动调用）

| API | 调用时机 | 用途 |
|-----|----------|------|
| `usb_add_gadget_udc()` / `usb_del_gadget_udc()` | probe / remove | 注册 / 注销 UDC |
| `usb_ep_set_maxpacket_limit()` | `initep` | 设 ep MPS 上限 |
| `usb_gadget_map_request()` | `queue` 前 | DMA map → `req->dma` |
| `usb_gadget_unmap_request()` | 完成时 | unmap / cache 一致性 |
| `usb_gadget_giveback_request()` | `complete_request` | 触发 `req->complete` |
| `usb_gadget_set_state()` | disconnect 等 | 更新 `gadget.state` |

### 4.2 控制面：`usb_gadget_driver` 回调（4 个）

`udc_start()` 收到 `struct usb_gadget_driver *` 后存入 `hsotg->driver`。**`setup` 必须非空**。

| 回调 | dwc2 调用位置 | 用途 |
|------|---------------|------|
| `setup` | `dwc2_hsotg_process_control()` | EP0 非 dwc2 自处理请求（描述符、SET_CONFIGURATION 等） |
| `disconnect` | `dwc2_hsotg_disconnect()` | 拔线、复位、软断开 |
| `suspend` | `core_intr.c` `call_gadget` | 总线挂起 |
| `resume` | `core_intr.c` `call_gadget` | 唤醒 |

`setup` 上游到 `composite_setup` 见 [Composite EP0 枚举](/analysis/kernel/usb/gadget-composite-ep0) §2；EP0 硬件阶段机见 dwc2 EP0 控制传输（待迁入）。

---

## 5. 与 echo UDC 时间线

```text
T0  boot — dwc2_gadget_init → usb_add_gadget_udc
      └─ 本文 §3：gadget / ep_list / ops 就绪；无 driver、无 pullup

T1  echo UDC — udc_bind_to_driver
      └─ gadget_driver->bind（composite 装配）
      └─ gadget_ops.udc_start → hsotg->driver = composite 的 gadget_driver
      └─ gadget_ops.pullup → DCTL.SFTDISCON 清位

T2  Host 枚举 — driver->setup（EP0）→ composite_setup
T2+ 数据面 — ep_ops.queue → bulk/int 传输（ACM 见 Function 路径文）
```

---

## 6. 关联文档

| 文档 | 内容 |
|------|------|
| [Gadget 子系统概览](/analysis/kernel/usb/gadget-subsystem) | L0–L4 四层、probe 与 bind 生命周期 |
| [UDC bind 分析](/analysis/kernel/usb/gadget-udc-core-bind) | `udc_bind_to_driver`、pending、pullup 触发 |
| [Composite EP0 枚举](/analysis/kernel/usb/gadget-composite-ep0) | `setup` → `composite_setup` |
| [ACM Function 路径](/analysis/kernel/usb/gadget-function-acm) | `usb_ep_enable` / `usb_ep_queue` 数据面 |
| dwc2 EP0 控制传输（待迁入） | Setup/Data/Status 阶段机 |
| dwc2 Buffer DMA（待迁入） | `DxEPDMA`、`start_req` 详读 |
| dwc2 probe / DRD（待迁入） | `platform.c`、`drd.c`、role-switch |

---

## 7. 源码索引

| 主题 | 文件 |
|------|------|
| `dwc2_gadget_init`、`dwc2_hsotg_gadget_ops` | `drivers/usb/dwc2/gadget.c` |
| `dwc2_hsotg_ep_ops`、`dwc2_hsotg_initep` | 同上 |
| `dwc2_hsotg_process_control`、`dwc2_hsotg_disconnect` | 同上 |
| `usb_add_gadget_udc`、`udc_bind_to_driver` | `drivers/usb/gadget/udc/core.c` |
| `struct usb_gadget`、`struct usb_ep` | `include/linux/usb/gadget.h` |
