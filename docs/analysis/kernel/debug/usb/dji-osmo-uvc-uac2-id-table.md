---
homeTag: 调试 · USB
homeTitle: DJI Osmo Action 6 在 eCos 上 UVC 枚举
homeDesc: 2ca3:8004 的 id_table 匹配与 UAC2 probe 阻塞导致 UVC 接口无法继续 probe
sidebarOrder: 10
sidebarTitle: DJI UVC/UAC2 id_table 与枚举
---

# DJI `2ca3:8004` — id_table 匹配与枚举路径

> **环境**：eCos USB Host（CSKY）· 大疆 Osmo Action 6（`VID:PID = 0x2ca3:0x8004`）· 参考 Linux `uvcvideo` / `snd-usb-audio` 的 id_table  
> **关联**：[USB 2.0 枚举流程](/analysis/kernel/usb/usb-enumeration) · [枚举与 Probe](/analysis/kernel/usb/enumeration-and-probe)  
> **附件**：[USB 描述符 dump](/files/dji_descriptor.txt)（Linux `lsusb -v`，`2ca3:8004`）  
> **状态**：进行中（根因：UAC2 AC HEADER 按 UAC1 解析）

---

## 现象

- 目标：主机侧正常枚举并出现 **`/dev/video0`**（UVC）
- 参考：绿联 `1d6b:0102` 等 UVC 设备在 eCos 上已可用
- 实际：`8004` 模式下接口描述符可读，但 **`1-2:1.1` 绑定 `snd-usb-audio` 后报 `invalid HEADER`**（按 UAC1 解析 UAC2 AC 头）
- 影响：`usb_set_configuration` 按 If0→If4 顺序 `device_add`；**`1.1` 的 probe 阻塞或失败后，`1.2`～`1.4` 可能无法继续**，UVC（`1.3`/`1.4`）起不来

---

## 问题背景

在 eCos USB Host（CSKY）上接入大疆 Osmo Action 6，配置为 **UVC + UAC2** 复合设备（`DIAG_UAC2_UVC`，5 个接口）。

| 对比项 | 说明 |
|--------|------|
| 参考设备 | 绿联 `1d6b:0102` 等 UVC 设备在 eCos 上已可用 |
| 现象 | 见上 |
| 本文目的 | 对照 `uvc_ids[]` / `usb_audio_ids[]` 说明各接口**能否 match**；结合日志与调用栈区分「描述符已解析」与「驱动未 probe」 |

标准描述符（`2ca3:8004`）见 [dji_descriptor.txt](/files/dji_descriptor.txt)；下文 eCos 实测与 `2ca3:0025` vendor 模式对比来自板端 probe 日志整理。

---

## 设备概要

| 项 | 值 |
|----|-----|
| VID:PID | `0x2ca3:0x8004` |
| 产品 | OsmoAction6 |
| 配置 | `DIAG_UAC2_UVC`，5 个接口（`1.0`～`1.4`） |
| 整机 `bDeviceClass` | 239（Misc），非 `0xFF` → 可按接口类正常 match |

**说明**：两张表里都**没有** `2ca3:8004` 专用条目，靠**通用类匹配**项。

---

## 接口一览（与 bus_id 对应）

| bus_id | If | Class | SubClass | Protocol | 标准含义 |
|--------|-----|-------|----------|----------|----------|
| `1-2:1.0` | 0 | 255 | 255 | 48 | 厂商 DIAG（bulk） |
| `1-2:1.1` | 1 | 1 | **1** | 32 | **UAC2 Audio Control**（`bcdADC 2.00`） |
| `1-2:1.2` | 2 | 1 | **2** | 32 | UAC2 Audio Streaming |
| `1-2:1.3` | 3 | 14 | **1** | 0 | **UVC Video Control**（`bcdUVC 1.50`） |
| `1-2:1.4` | 4 | 14 | **2** | 0 | UVC Video Streaming |

---

## 接口描述符：预期 vs eCos 实测

| bus_id | 预期 (Class/Sub/Proto) | eCos #1 (addr 2) | eCos #2 (addr 3) |
|--------|------------------------|------------------|------------------|
| `1-2:1.0` | 255 / 255 / 48 | 255 / 255 / 48 | 255 / 255 / 48 |
| `1-2:1.1` | 1 / 1 / 32 | 255 / 67 / 1 | 1 / 1 / 32 |
| `1-2:1.2` | 1 / 2 / 32 | 255 / 67 / 1 | — |
| `1-2:1.3` | 14 / 1 / 0 | 255 / 67 / 1 | — |
| `1-2:1.4` | 14 / 2 / 0 | 255 / 67 / 1 | — |

---

## 一、视频：`uvc_ids[]`（`uvcvideo`）

### 表内相关通用项（表尾）

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

### 按接口是否 match

| 接口 | 描述符 | 是否 match `uvc_ids` | 命中表项（`usb_match_id` 从前向后） |
|------|--------|----------------------|-------------------------------------|
| **1.3** | 14 / 1 / **0** | **是** | **`USB_INTERFACE_INFO(14, 1, 0)`**（`UVC_PC_PROTOCOL_UNDEFINED`） |
| **1.4** | 14 / 2 / 0 | **否** | 表项要求 SubClass=1；流接口为 SubClass=2 |
| 1.0 / 1.1 / 1.2 | 非 Video | 否 | — |

## 二、音频：`usb_audio_ids[]`（`snd-usb-audio`）

### 表内唯一有效项

```c
static struct usb_device_id usb_audio_ids[] = {
	{ .match_flags = (USB_DEVICE_ID_MATCH_INT_CLASS | USB_DEVICE_ID_MATCH_INT_SUBCLASS),
	  .bInterfaceClass = USB_CLASS_AUDIO,              /* 1 */
	  .bInterfaceSubClass = USB_SUBCLASS_AUDIO_CONTROL }, /* 1 */
	{ }  /* 结束 */
};
```

**不检查** `bInterfaceProtocol`，故 Protocol=32（UAC2）**不影响 match**。

### 按接口是否 match

| 接口 | 描述符 | 是否 match `usb_audio_ids` | 说明 |
|------|--------|--------------------------|------|
| **1.1** | 1 / **1** / 32 | **是** | 唯一会绑 `snd-usb-audio` 的接口 |
| **1.2** | 1 / **2** / 32 | **否** | SubClass=2（Streaming），表项要求 SubClass=1 |
| 1.0 / 1.3 / 1.4 | 非 Audio Control | 否 | — |

## 三、`usb_set_configuration` 枚举顺序（message.c）

`device_add` 按接口号 **0 → 1 → 2 → 3 → 4** 顺序执行：

```text
adding 1.0 → device_add  → 通常无 class 驱动
adding 1.1 → device_add  → snd-usb-audio match → usb_audio_probe（可能卡住）
adding 1.2 → device_add  → 仅当 1.1 的 device_add 返回后才执行
adding 1.3 → device_add  → uvcvideo match → uvc_probe
adding 1.4 → device_add  → 通常无单独 match
```

## 四、调用栈：获取接口描述符 → `device_add`

eCos 路径：`gx/core/v3_0/src/`（config / hub / message / generic）、`gx/base/v3_0/src/`（core / bus / dd）。

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
                                                         └─ bus_attach_device() …（见下节）
```

要点：

- **接口 Class/SubClass/Protocol 在第一次 `usb_get_configuration` 里解析**，写入 `alt->desc`；与后面是否 `uvc_probe` 无关。
- **`adding 1.x` 出现在 `usb_set_configuration` 的接口 `device_add`**，之前还有一次 **整机** `device_add(&udev->dev)` 触发 `generic_probe` → `set_configuration`。
- `intf->cur_altsetting->desc` 即 `usb_match_id` / `uvc_ids` / `usb_audio_ids` 所用字段。

## 五、调用栈：`device_add`（接口）→ 驱动 probe

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

## 六、DJI 两次枚举（eCos 实测）

`2ca3:8004` 标准描述符见 [dji_descriptor.txt](/files/dji_descriptor.txt)；下表含 `2ca3:0025` vendor 模式与 `8004` 正常模式两轮 eCos 枚举摘要。

| 枚举轮次 | VID:PID | 配置描述符 | 接口描述符摘要 | 当前支持结论 | 实际结果 |
|---|---|---|---|---|---|
| 第 1 次 | `2ca3:0025` | `wTotalLength=124`，5 接口 | If0=`ff/ff/30`，If1~If4=`ff/43/01` | 非标准 UVC/UAC，属于 vendor 模式 | 仅完成枚举与 `adding`，随后断开重枚举 |
| 第 2 次 | `2ca3:8004` | `wTotalLength=639`，5 接口 | If0=`ff/ff/30`，If1=`01/01/20`，If2=`01/02/20`，If3=`0e/01/00`，If4=`0e/02/00` | 描述符解析与 UVC 条件均正常；UAC2 解析不完整 | `1.1` 命中 `snd-usb-audio` 后 `invalid HEADER`，阻塞后续接口 probe |

## 七、支持矩阵（按描述符类型）

| 项目 | `2ca3:0025` | `2ca3:8004` | 结论 |
|---|---|---|---|
| Device Descriptor | 正常 | 正常 | 支持 |
| Config 读取 (`wTotalLength`) | 正常（124） | 正常（639） | 支持 |
| Interface 解析 (`ifdesc raw`) | 正常（但全 vendor） | 正常（UAC2/UVC 都读对） | 支持 |
| UVC 接口（14/1/0, 14/2/0） | 无 | 有 | 具备匹配条件 |
| UAC1 | 无 | 无 | 不适用 |
| UAC2 AC HEADER 解析 | 无 | 有 | 当前实现不完整（`invalid HEADER`） |

---

## 结论与备忘

**当前结论**：主阻塞点是 `snd-usb-audio` 对 UAC2 AC HEADER 的解析失败（`invalid HEADER`），不是 `config.c` 的接口描述符读取失败。UVC 接口 `1.3` 在 id_table 上可 match，但若 `1.1` probe 阻塞，可能永远走不到 `uvc_probe`。

**待试方向**：

- 在 eCos 侧补齐 UAC2 AC HEADER 解析，或临时跳过/延迟 `1.1` 的 audio probe
- 对照 Linux 主线 `sound/usb` UAC2 路径与当前移植差异
