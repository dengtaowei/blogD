---
homeTag: 调试 · USB
homeTitle: DJI Osmo Action 6 在 eCos 上 UVC 枚举
homeDesc: 2ca3:8004 的 id_table 匹配与 UAC2 probe 阻塞导致 UVC 接口无法继续 probe
sidebarOrder: 10
sidebarTitle: DJI UVC/UAC2 id_table 与枚举
date: 2026-06-02
---

# DJI `2ca3:8004` — id_table 匹配与枚举路径

> **环境**：eCos USB Host（CSKY）· 大疆 Osmo Action 6（`VID:PID = 0x2ca3:0x8004`）· 对照 Linux `uvcvideo` / `snd-usb-audio` 的 id_table（非同一运行环境）  
> **关联**：[USB 2.0 枚举流程](/analysis/kernel/usb/usb-enumeration) · [枚举与 Probe](/analysis/kernel/usb/enumeration-and-probe) · [UVC 驱动分析](/analysis/kernel/usb/uvc-driver)  
> **附件**：[USB 描述符 dump](/files/dji_descriptor.txt)（Linux `lsusb -v`，`2ca3:8004`）  
> **状态**：进行中（根因：UAC2 AC HEADER 按 UAC1 解析）

---

## 目录

- [1. 现象与背景](#1-现象与背景)
- [2. 设备概要](#2-设备概要)
- [3. 接口描述符：标准预期与 eCos 两轮实测](#3-接口描述符标准预期与-ecos-两轮实测)
- [4. 视频：uvc_ids 与 uvcvideo](#4-视频uvc_ids-与-uvcvideo)
- [5. 音频：usb_audio_ids 与 snd-usb-audio](#5-音频usb_audio_ids-与-snd-usb-audio)
- [6. 调用栈：配置描述符解析](#6-调用栈配置描述符解析)
- [7. 调用栈：接口 device_add 与驱动 probe](#7-调用栈接口-device_add-与驱动-probe)
- [8. 排查备忘](#8-排查备忘)

---

## 1. 现象与背景

在 eCos USB Host（CSKY）上接入大疆 Osmo Action 6（`VID:PID = 0x2ca3:0x8004`），配置为 **UVC + UAC2** 复合设备（`DIAG_UAC2_UVC`，5 个接口）。目标是主机侧正常枚举并出现 **`/dev/video0`**（UVC）；绿联 `1d6b:0102` 等 UVC 设备在 eCos 上已可用，可作对照。

**实际**：`8004` 模式下接口描述符可读，但 **`1-2:1.1` 绑定 `snd-usb-audio` 后报 `invalid HEADER`**（按 UAC1 解析 UAC2 AC 头）。`usb_set_configuration` 按 If0→If4 顺序 `device_add`；**`1.1` 的 probe 阻塞或失败后，`1.2`～`1.4` 可能无法继续**，UVC（`1.3`/`1.4`）起不来。

本文对照 Linux `uvc_ids[]` / `usb_audio_ids[]` 说明各接口**能否 match**，并结合 eCos 日志与调用栈区分「描述符已解析」与「驱动未 probe」。标准描述符见 [dji_descriptor.txt](/files/dji_descriptor.txt)；下文含 `2ca3:0025` vendor 模式与 `8004` 正常模式两轮实测摘要。

---

## 2. 设备概要

| 项 | 值 |
|----|-----|
| VID:PID | `0x2ca3:0x8004` |
| 产品 | OsmoAction6 |
| 配置 | `DIAG_UAC2_UVC`，5 个接口（`1.0`～`1.4`） |
| 整机 `bDeviceClass` | 239（Misc），非 `0xFF` → 可按接口类正常 match |

**说明**：两张表里都**没有** `2ca3:8004` 专用条目，靠**通用类匹配**项。

---

## 3. 接口描述符：标准预期与 eCos 两轮实测

接入后 eCos 上会先枚举 **`2ca3:0025`**（vendor，`wTotalLength=124`），断开再以 **`2ca3:8004`** 进入 `DIAG_UAC2_UVC`（`wTotalLength=639`）。Linux 侧标准值见 [dji_descriptor.txt](/files/dji_descriptor.txt)。

| 轮次 | VID:PID | 配置 | 类码（If0～If4，Class/Sub/Proto） |
|------|---------|------|--------------------------------|
| 第 1 次 | `2ca3:0025` | 124 B，5 接口 | `255/255/48`；`255/67/1`×4 |
| 第 2 次 | `2ca3:8004` | 639 B，5 接口 | `255/255/48`；`1/1/32`；`1/2/32`；`14/1/0`；`14/2/0` |

各接口 `bInterfaceClass / SubClass / Protocol`（`ifdesc raw`）：

| bus_id | 预期 (Linux) | 标准含义 | 第 1 轮 `0025` | 第 2 轮 `8004` |
|--------|--------------|----------|----------------|----------------|
| `1-2:1.0` | 255 / 255 / 48 | 厂商 DIAG（bulk） | 255 / 255 / 48 | 255 / 255 / 48 |
| `1-2:1.1` | 1 / 1 / 32 | **UAC2 Audio Control**（`bcdADC 2.00`） | 255 / 67 / 1 | 1 / 1 / 32 |
| `1-2:1.2` | 1 / 2 / 32 | UAC2 Audio Streaming | 255 / 67 / 1 | 1 / 2 / 32 |
| `1-2:1.3` | 14 / 1 / 0 | **UVC Video Control**（`bcdUVC 1.50`） | 255 / 67 / 1 | 14 / 1 / 0 |
| `1-2:1.4` | 14 / 2 / 0 | UVC Video Streaming | 255 / 67 / 1 | 14 / 2 / 0 |

---

## 4. 视频：uvc_ids 与 uvcvideo

### 4.1 表内相关通用项（表尾）

```c
/* Generic USB Video Class */
{ USB_INTERFACE_INFO(USB_CLASS_VIDEO, 1, UVC_PC_PROTOCOL_UNDEFINED) },  /* pr=0 */
{ USB_INTERFACE_INFO(USB_CLASS_VIDEO, 1, UVC_PC_PROTOCOL_15) },         /* pr=1 */
```

`USB_INTERFACE_INFO(USB_CLASS_VIDEO, 1, UVC_PC_PROTOCOL_UNDEFINED)` 展开为：

```c
#define USB_DEVICE_ID_MATCH_INT_INFO \
	(USB_DEVICE_ID_MATCH_INT_CLASS | USB_DEVICE_ID_MATCH_INT_SUBCLASS | \
	 USB_DEVICE_ID_MATCH_INT_PROTOCOL)   /* 0x0080 | 0x0100 | 0x0200 = 0x0300 */

{
	.match_flags        = USB_DEVICE_ID_MATCH_INT_INFO,  /* 0x0300 */
	.bInterfaceClass    = 0x0e,
	.bInterfaceSubClass = 0x01,
	.bInterfaceProtocol = 0x00,
},
```

等价条件：

| 字段 | 值 |
|------|-----|
| `bInterfaceClass` | 14（`USB_CLASS_VIDEO`） |
| `bInterfaceSubClass` | 1（Video Control） |
| `bInterfaceProtocol` | 见下表 |

### 4.2 接口是否 match

| 接口 | 描述符 | 是否 match `uvc_ids` | 命中表项（`usb_match_id` 从前向后） |
|------|--------|----------------------|-------------------------------------|
| **1.3** | 14 / 1 / **0** | **是** | **`USB_INTERFACE_INFO(14, 1, 0)`**（`UVC_PC_PROTOCOL_UNDEFINED`） |
| **1.4** | 14 / 2 / 0 | **否** | 表项要求 SubClass=1；流接口为 SubClass=2 |
| 1.0 / 1.1 / 1.2 | 非 Video | 否 | — |

---

## 5. 音频：usb_audio_ids 与 snd-usb-audio

### 5.1 表内唯一有效项

```c
static struct usb_device_id usb_audio_ids[] = {
	{ .match_flags = (USB_DEVICE_ID_MATCH_INT_CLASS | USB_DEVICE_ID_MATCH_INT_SUBCLASS),
	  .bInterfaceClass = USB_CLASS_AUDIO,              /* 1 */
	  .bInterfaceSubClass = USB_SUBCLASS_AUDIO_CONTROL }, /* 1 */
	{ }  /* 结束 */
};
```

**不检查** `bInterfaceProtocol`，故 Protocol=32（UAC2）**不影响 match**。

### 5.2 接口是否 match

| 接口 | 描述符 | 是否 match `usb_audio_ids` | 说明 |
|------|--------|--------------------------|------|
| **1.1** | 1 / **1** / 32 | **是** | 唯一会绑 `snd-usb-audio` 的接口 |
| **1.2** | 1 / **2** / 32 | **否** | SubClass=2（Streaming），表项要求 SubClass=1 |
| 1.0 / 1.3 / 1.4 | 非 Audio Control | 否 | — |

---

## 6. 调用栈：配置描述符解析


```text
hub 端口枚举完成
  └─ usb_new_device(udev)                         [hub.c]
       ├─ usb_get_configuration(udev)              [config.c]
       │    ├─ usb_get_descriptor(USB_DT_CONFIG)  // 读 wTotalLength 整包配置描述符
       │    └─ usb_parse_configuration()           [config.c]
       │         ├─ 扫描 USB_DT_INTERFACE，统计各 interface 的 alt 数
       │         └─ while (size > 0)
       │              └─ usb_parse_interface()     [config.c]
       │                   └─ memcpy → alt->desc     // bInterfaceClass/SubClass/Protocol
       │                        （日志 ifdesc raw 在此打印）
       │                   // 结果缓存在 dev->config[cfg].intf_cache[]
       │
       └─ device_add(&udev->dev)                   [hub.c] → [core.c]
            └─ bus_attach_device()                 [bus.c]
                 └─ device_attach()                [dd.c]
                      └─ bus_for_each_drv → driver_probe_device
                           └─ usb_device_match → really_probe
                                └─ usb_probe_device()      [driver.c] 设备级
                                     └─ generic_probe()    [generic.c]
                                          ├─ choose_configuration(udev)
                                          └─ usb_set_configuration(udev, c)  [message.c]
                                               ├─ usb_control_msg(SET_CONFIGURATION)
                                               ├─ 从 actconfig->intf_cache[] 填
                                               │    intf->cur_altsetting（已解析的 ifdesc）
                                               ├─ usb_enable_interface()
                                               └─ for (i = 0; i < nintf; i++)
                                                    ├─ dev_dbg("adding %s")   // 日志 adding 1.x
                                                    └─ device_add(&intf->dev) [message.c]
                                                         └─ bus_attach_device() …（见 §7）
```

要点：

- **接口 Class/SubClass/Protocol 在第一次 `usb_get_configuration` 里解析**，写入 `alt->desc`；与后面是否 `uvc_probe` 无关。
- **`adding 1.x` 出现在 `usb_set_configuration` 的接口 `device_add`**，之前还有一次 **整机** `device_add(&udev->dev)` 触发 `generic_probe` → `set_configuration`。
- `intf->cur_altsetting->desc` 即 `usb_match_id` / `uvc_ids` / `usb_audio_ids` 所用字段。

---

## 7. 调用栈：接口 device_add 与驱动 probe

```text
device_add(&intf->dev)                            [message.c] → [core.c]
  └─ bus_attach_device()                          [bus.c]
       └─ device_attach()                         [dd.c]
            └─ bus_for_each_drv(usb_bus_type)
                 └─ __driver_attach()
                      ├─ down(parent->sem)
                      ├─ if (!dev->driver)
                      │     └─ driver_probe_device(drv, dev)   [dd.c]
                      │          ├─ usb_device_match(dev, drv)   [driver.c]
                      │          │    └─ usb_match_id() → usb_match_one_id()
                      │          └─ really_probe()               // match 成功才进
                      │               └─ usb_probe_interface()   [driver.c]
                      │                    └─ driver->probe()    // uvc_probe / usb_audio_probe
                      └─ up(parent->sem)
```

---

## 8. 排查备忘

Osmo Action 6 在 eCos 上会先以 **`2ca3:0025`**（`wTotalLength=124`，全 vendor 类码）枚举一轮并断开，再以 **`2ca3:8004`**（639 B，`DIAG_UAC2_UVC`）进入正常类码；第 2 轮描述符与 [§3](#3-接口描述符标准预期与-ecos-两轮实测) 一致，但 **`1.1` 的 `usb_audio_probe` 报 `invalid HEADER`**（UAC2 头按 UAC1 解析），可能阻塞后续接口 probe，导致 `1.3` 走不到 `uvc_probe`。日志里务必用 **VID:PID / `wTotalLength`** 区分两轮。沿 [§6](#6-调用栈配置描述符解析)、[§7](#7-调用栈接口-device_add-与驱动-probe) 建议在下列函数加打印：

| 函数 | 文件 | 建议打印 |
|------|------|----------|
| `usb_new_device` | `hub.c` | `idVendor:idProduct`、`devnum` |
| `usb_get_descriptor`（CONFIG） | `config.c` | `wTotalLength` |
| `usb_parse_interface` | `config.c` | `ifnum`、Class/Sub/Proto（`ifdesc raw`） |
| `choose_configuration` | `generic.c` | 选中的 `bConfigurationValue` |
| `usb_set_configuration` | `message.c` | `adding %s`、各接口 `bus_id` |
| `device_add`（接口） | `message.c` | `bus_id` 进入/返回 |
| `usb_match_one_id` | `driver.c` | 类码、命中的 `driver->name` |
| `usb_probe_interface` | `driver.c` | `driver->name`、`intf`、返回值 |
| `usb_audio_probe` / `uvc_probe` | 驱动 | `invalid HEADER` 前后、返回码 |
