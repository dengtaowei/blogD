---
homeTag: USB · Gadget
homeTitle: Gadget composite EP0 与枚举
homeDesc: composite_setup、GET_DESCRIPTOR 与 SET_CONFIGURATION
sidebarOrder: 57
sidebarTitle: Composite EP0 枚举
date: 2026-06-14
---

# Gadget composite EP0 与枚举

> **层**：Composite（`drivers/usb/gadget/composite.c`）  
> **内核**：Linux 5.4 源码（dwc2 dual-role 平台对照）；路径与 Linux 6.8 同源，差异处另行注明  
> **关联**：[UDC bind 分析](/analysis/kernel/usb/gadget-udc-core-bind) · [DWC2 接口总览](/analysis/kernel/usb/gadget-dwc2-interface) · [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) · [ACM Function 路径](/analysis/kernel/usb/gadget-function-acm) · [Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm)  
> **说明**：dwc2 EP0 硬件阶段机见 dwc2 EP0 控制传输（待迁入）；`setup` 下发见 [DWC2 接口总览](/analysis/kernel/usb/gadget-dwc2-interface) §4.2

---

## 目录

- [1. 本文要回答](#1-本文要回答)
- [2. 调用路径](#2-调用路径l2-视角)
- [3. composite_setup 概览](#3-composite_setup-概览)
- [4. set_config](#4-set_config-做了什么)
- [5. SET_INTERFACE](#5-interface-级请求set_interface)
- [6. Class-specific setup](#6-class-specific-setupacm-预览)
- [7. T1 / T2 分界](#7-t1--t2-分界实践)
- [8. 与 configfs 的衔接](#8-与-configfs-的衔接)
- [9. 示例：deferred_fb_serial + ACM](#9-示例deferred_fb_serial--acm)
- [10. 源码索引](#10-源码索引)
- [11. 关联文档](#11-关联文档)

---

## 1. 本文要回答

T1（pullup）之后 Host 通过 **EP0 控制传输** 读描述符、选配置。Composite 框架统一处理标准请求，再分发给各 function：

- EP0 请求从 dwc2 到 `composite_setup` 的路径？
- **GET_DESCRIPTOR** 返回什么、数据从哪来？
- **SET_CONFIGURATION** 如何触发各 function 的 **`set_alt`**？
- T1 与 T2 在软件上的 **分界** 是什么？

## 2. 调用路径（L2 视角）

```text
Host 标准请求 (EP0)
    dwc2 gadget EP0 中断/队列完成
        hsotg->driver->setup(gadget, ctrl)
            configfs_composite_setup()          [configfs.c]
                composite_setup()               [composite.c]
                    GET_DESCRIPTOR → 填 ep0 req → usb_ep_queue(ep0)
                    SET_CONFIGURATION → set_config()
                        对每个 function: f->set_alt(f, intf, 0)
```

dwc2 侧 `setup` 下发见 [DWC2 接口总览](/analysis/kernel/usb/gadget-dwc2-interface) §4.2。

`configfs_composite_setup` 在持 `gi->spinlock` 下调用 `composite_setup`，防止 unbind 竞态（`gi->unbind` 时直接返回 0）。

## 3. `composite_setup()` 概览

入口：`composite_setup(struct usb_gadget *gadget, const struct usb_ctrlrequest *ctrl)`（约 1579 行）。

### 3.1 解析控制请求

```c
w_value = le16_to_cpu(ctrl->wValue);
w_index = le16_to_cpu(ctrl->wIndex);
w_length = le16_to_cpu(ctrl->wLength);
```

根据 `ctrl->bRequestType` 分支：

| 类型 | 典型请求 | 处理 |
|------|----------|------|
| `USB_DIR_IN \| USB_TYPE_STANDARD \| USB_RECIP_DEVICE` | GET_DESCRIPTOR | 设备/配置/字符串/OS 描述符 |
| `USB_DIR_OUT \| ... \| USB_RECIP_DEVICE` | SET_CONFIGURATION | **`set_config(cdev, number)`** |
| `USB_RECIP_INTERFACE` | GET/SET_INTERFACE | 调 `f->get_alt` / `f->set_alt` |
| `USB_TYPE_CLASS` | CDC 等 | 先 `config_desc` 内 function 的 `setup`，再 `f->setup` |

未识别请求 → `stall`（返回负 errno，由 UDC 发 STALL）。

### 3.2 GET_DESCRIPTOR（枚举阶段核心）

**Device descriptor**（`wValue >> 8 == USB_DT_DEVICE`）：

- 从 `cdev->desc` 拷贝（configfs 在 T0 已填 `idVendor/idProduct/...`）
- 经 `config_ep_by_speed` 等保证与当前速度一致

**Configuration descriptor**（`USB_DT_CONFIG`）：

- 遍历 `cdev->configs`，匹配 `bConfigurationValue`
- 调用 `config_buf()`：把 **configuration + interface + endpoint + class-specific** 拼进 EP0 buffer
- 各 function 在 bind 时已通过 `usb_assign_descriptors` 挂好 FS/HS/SS 描述符表

**String descriptor**（`USB_DT_STRING`）：

- `usb_gadget_get_string(cdev, index, buf)` → configfs 绑定的 `usb_string` 表

此阶段 **不** 调用 `set_alt`；bulk/interrupt EP 多数尚未 `usb_ep_enable`。

### 3.3 SET_CONFIGURATION — **T2 起点**

Host 发送 `SET_CONFIGURATION`，`wValue` 为配置号（如 `1`）：

```c
value = set_config(cdev, ctrl->wValue);
```

成功则 `usb_gadget_set_state(CONFIGURED)`；失败 STALL。

## 4. `set_config()` 做了什么

`set_config(struct usb_composite_dev *cdev, unsigned number)`（约 768 行）：

| 步骤 | 动作 |
|------|------|
| 1 | 若已有配置，`reset_config(cdev)`：对每个 function `f->disable(f)` |
| 2 | 在 `cdev->configs` 中找 `c->bConfigurationValue == number` |
| 3 | `cdev->config = c` |
| 4 | **`list_for_each_entry(f, &c->functions, list)`** |
| 5 | 对每个 function：`f->set_alt(f, tmp, 0)` — `tmp` 从 0 递增（interface 序号） |

**关键**：ACM 的 bulk IN/OUT 在 **`acm_set_alt`（data interface）** 里 `usb_ep_enable` + `gserial_connect`（详读见 [ACM Function 路径](/analysis/kernel/usb/gadget-function-acm) §5）。

若任一 `set_alt` 失败 → `reset_config` 回滚。

### 4.1 `reset_config` / `composite_disconnect`

- **`reset_config`**：`f->disable(f)`，清 `cdev->config`
- **总线 disconnect**（拔线）：`composite_disconnect` → `reset_config` + 状态 `ADDRESS`

## 5. Interface 级请求（SET_INTERFACE）

Host 也可能对某 interface 发 **SET_INTERFACE(alt=0)**（尤其复用/Alt setting）：

- `composite_setup` 找到 owning function
- 直接 `f->set_alt(f, interface, alt)`

逻辑与 `set_config` 内批量 `set_alt` 相同，只是针对单个 interface。

## 6. Class-specific setup（ACM 预览）

标准枚举完成后，Host 对 CDC 控制 interface 发 **SET_LINE_CODING** 等：

- `composite_setup` → `f->setup` → **`acm_setup`**（`f_acm.c`）
- 仍走 EP0，与 ACM bulk 数据面分离

## 7. T1 / T2 分界（实践）

| 时刻 | USB 状态 | 软件标志 | 用户可见 |
|------|----------|----------|----------|
| **T1** pullup 后 | DEFAULT → ADDRESS | bind 完成，`setup` 可用 | `lsusb` 可见 VID/PID，可能 **Configuration 0** |
| **GET_DESCRIPTOR** | ADDRESS | 描述符从 `cdev`/function 读出 | `lsusb -v` 完整描述符 |
| **T2** SET_CONFIGURATION | **CONFIGURED** | `f->set_alt` / `gserial_connect` | **`/dev/ttyGS0`** 可通信（若 host 打开端口） |

**T1 无 T2**：能枚举、能读描述符，但 bulk 未 enable → 无串口数据。

**T2 依赖 T1**：无 bind/pullup 则 Host 发不到 SET_CONFIGURATION。

Host 侧协议对照见 [USB 2.0 枚举流程](/analysis/kernel/usb/usb-enumeration)。

## 8. 与 configfs 的衔接

| T0 写入 | T1 bind 使用 | T2 EP0 使用 |
|---------|--------------|-------------|
| `idVendor/idProduct/...` | `cdev->desc` | GET_DESCRIPTOR device |
| `configs/c.1` + functions | `usb_add_function` → `f->bind` | GET_DESCRIPTOR config |
| strings | `usb_gstrings_attach` | GET_DESCRIPTOR string |
| `echo UDC` | `configfs_composite_bind` 完成上述 | — |

组装过程见 [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly)；本文按 **EP0 请求类型** 对照。

## 9. 示例：`deferred_fb_serial` + ACM

1. Host 读 device → `1d6b:0104`（Linux Foundation / Multifunction Composite Gadget）
2. 读 config → 1 个 configuration，IAD + ACM control + ACM data
3. `SET_CONFIGURATION 1` → `acm_set_alt(ctrl)` enable notify EP → `acm_set_alt(data)` → **`gserial_connect`**
4. Host 打开 `/dev/ttyACM0`（或类似），发 CDC 类请求 → `acm_setup`

完整 `lsusb -v` dump 见 [Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm) §5.5。

## 10. 源码索引

| 函数 | 文件 | 行号约 |
|------|------|--------|
| `configfs_composite_setup` | `configfs.c` | 1403 |
| `composite_setup` | `composite.c` | 1579 |
| `set_config` | `composite.c` | 768 |
| `reset_config` | `composite.c` | 718 |
| `composite_disconnect` | `composite.c` | 2269 |
| `config_buf` | `composite.c` | （拼 config 描述符） |
| `usb_add_function` | `composite.c` | bind 时挂 function |

## 11. 关联文档

| 文档 | 内容 |
|------|------|
| [UDC bind 分析](/analysis/kernel/usb/gadget-udc-core-bind) | bind 后 `setup` 挂接、pullup |
| [DWC2 接口总览](/analysis/kernel/usb/gadget-dwc2-interface) | dwc2 `setup` 与 `gadget_driver` 回调 |
| [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) | T0 描述符、`gadget_driver.setup` |
| [ACM Function 路径](/analysis/kernel/usb/gadget-function-acm) | `acm_set_alt`、`gserial_connect` 详读 |
| [Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm) | lsusb 实测、`ttyGS0` / `cdc_acm` |
| dwc2 EP0 控制传输（待迁入） | dwc2 EP0 硬件阶段机 |
