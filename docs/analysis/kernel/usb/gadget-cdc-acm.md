---
homeTag: USB · Gadget
homeTitle: USB Gadget CDC ACM 串口实践
homeDesc: configfs 配置 ACM，板子 ttyGS0 与 PC cdc_acm 对接
sidebarOrder: 55
sidebarTitle: Gadget CDC ACM 串口实践
date: 2026-06-13
---

# USB Gadget 模拟串口（CDC ACM）实践

> **环境**：Linux 内核 · dwc2 dual-role · configfs composite  
> **关联**：[Gadget 子系统概览](/analysis/kernel/usb/gadget-subsystem) · [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) · [Gadget 内核参考](/analysis/kernel/usb/gadget-kernel-reference) · [USB 2.0 枚举流程](/analysis/kernel/usb/usb-enumeration)（Host 侧对照）· [枚举与两轮 Probe](/analysis/kernel/usb/enumeration-and-probe)  
> **脚本**：[code/gadget-cdc-acm/deferred_fb_serial.sh](https://github.com/dengtaowei/blogD/blob/main/code/gadget-cdc-acm/deferred_fb_serial.sh)  
> **状态**：已在板子 + Host PC 验证 `ttyGS0` / `cdc_acm`

---

## 目录

- [1. 要做什么](#1-要做什么)
- [2. 数据路径](#2-数据路径)
- [3. 内核配置](#3-内核配置)
- [4. 前提条件](#4-前提条件)
- [5. configfs + ACM](#5-configfs--acm)
- [6. 源码与文档索引](#6-源码与文档索引)

---

## 1. 要做什么

让开发板作为 **USB 从机（Device）** 连接 PC（Host）时，在 PC 上呈现一个 **USB 串口**；板子本地用 **`/dev/ttyGS0`** 读写，与应用程序对接。

协议：**CDC ACM**（Communication Device Class, Abstract Control Model）—— PC 上 Linux/macOS 通常免驱（`cdc_acm`），Windows 内置 CDC 驱动。

---

## 2. 数据路径

```text
板子用户程序
    ↔ /dev/ttyGS0          （Gadget Serial，GS = Gadget Serial）
    ↔ u_serial.c           （TTY 层 glue，drivers/usb/gadget/function/u_serial.c）
    ↔ f_acm.c              （CDC ACM USB function）
    ↔ dwc2 gadget          （端点 bulk/int）
    ↔ USB 线缆
    ↔ PC Host cdc_acm
    ↔ /dev/ttyACM0（Linux）或 COMx（Windows）
```

| 节点 | 所在侧 | 含义 |
|------|--------|------|
| `/dev/ttyGS<n>` | Device（板子） | **G**adget **S**erial，内核 `gs_tty_driver->name = "ttyGS"` |
| `/dev/ttyACM<n>` | Host（PC Linux） | CDC **A**bstract **C**ontrol **M**odel |

ACM 为虚拟串口，**波特率多为形式参数**（应用可设 115200，实际走 USB bulk，不依赖物理波特率）。

---

## 3. 内核配置

| 配置项 | 说明 |
|--------|------|
| `CONFIG_USB_GADGET=y` | Gadget 框架 |
| `CONFIG_USB_DWC2_DUAL_ROLE=y` | dwc2 双角色 |
| `CONFIG_USB_CONFIGFS=y` | configfs 配置 gadget |
| `CONFIG_USB_CONFIGFS_ACM=y` | configfs 下 acm function |
| `CONFIG_USB_F_ACM=y` | `f_acm.c` 编译进内核 |
| `CONFIG_USB_U_SERIAL=y` | `u_serial.c`（ttyGS） |

若自行裁剪内核，需至少保留上表各项。

---

## 4. 前提条件

### 4.1 USB Device 角色

```bash
ls /sys/class/udc/
# 期望出现本机 UDC 名（如 dwc2 平台常为 `xxxx.usb-otg`，以 `ls /sys/class/udc/` 为准）
```

### 4.2 configfs 挂载

```bash
mount | grep configfs
# 若无：
mount -t configfs none /sys/kernel/config
```

### 4.3 同一 UDC 独占

一个 UDC 同时只能绑一个 configfs gadget。切换前先解绑：

```bash
echo "" > /sys/kernel/config/usb_gadget/<name>/UDC
```

---

## 5. configfs + ACM

### 5.1 完整脚本

仓库副本：`code/gadget-cdc-acm/deferred_fb_serial.sh`。`gadget_info` 与 bind 对应关系见 [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly)。

```bash
#!/bin/sh
set -e

G=/sys/kernel/config/usb_gadget/deferred_fb_serial
UDC=$(ls /sys/class/udc | head -n 1)

create() {
    modprobe libcomposite
    mkdir -p "$G"
    cd "$G"

    echo 0x1d6b > idVendor
    echo 0x0104 > idProduct
    echo 0x0100 > bcdDevice
    echo 0x0200 > bcdUSB

    mkdir -p strings/0x409
    echo "DEMO0002" > strings/0x409/serialnumber
    echo "DemoVendor" > strings/0x409/manufacturer
    echo "DeferredFB Serial" > strings/0x409/product

    mkdir -p configs/c.1/strings/0x409
    echo "CDC ACM Config" > configs/c.1/strings/0x409/configuration
    echo 250 > configs/c.1/MaxPower

    mkdir -p functions/acm.0
    ln -sf functions/acm.0 configs/c.1/acm.0

    echo "$UDC" > UDC
    echo "Serial gadget enabled on $UDC"
}

destroy() {
    if [ ! -d "$G" ]; then
        echo "not created"
        return
    fi

    cd "$G"
    echo "" > UDC || true
    rm -f configs/c.1/acm.0
    rmdir functions/acm.0 || true
    rmdir configs/c.1/strings/0x409 || true
    rmdir configs/c.1 || true
    rmdir strings/0x409 || true
    cd /
    rmdir "$G" || true
    echo "Serial gadget disabled"
}

case "${1:-up}" in
    up) create ;;
    down) destroy ;;
    *) echo "usage: $0 [up|down]"; exit 1 ;;
esac
```

### 5.2 逐行说明

| 命令 | 作用 | 内核侧 |
|------|------|--------|
| `G=.../deferred_fb_serial` | gadget 路径变量 | — |
| `UDC=$(ls /sys/class/udc \| head -1)` | 取本机 UDC 名 | `usb_add_gadget_udc()` 注册的设备 |
| `modprobe libcomposite` | 加载 composite 模块（若未编进内核） | configfs gadget 依赖 |
| `mkdir -p $G` | 创建 gadget | `gadgets_make()` → 分配 `gadget_info` |
| `echo 0x1d6b > idVendor` | 厂商 ID | `gi->cdev.desc.idVendor` |
| `echo 0x0104 > idProduct` | 产品 ID | `gi->cdev.desc.idProduct` |
| `echo 0x0100 > bcdDevice` | 设备版本 BCD（1.00） | `gi->cdev.desc.bcdDevice` |
| `echo 0x0200 > bcdUSB` | USB 2.0 | `gi->cdev.desc.bcdUSB` |
| `mkdir strings/0x409` | 英语字符串组 | en-US，langid 0x409 |
| `echo DEMO0002 > …/serialnumber` 等 | 设备序列号 | bind 时 `usb_gstrings_attach()` |
| `mkdir functions/acm.0` | ACM 实例 | `usb_get_function_instance("acm")`；`f_acm.c` |
| `mkdir configs/c.1/strings/0x409` | 配置 1 + 配置字符串 | `config_desc_make()` |
| `echo "CDC ACM Config" > …/configuration` | 配置描述文字 | Host 显示的配置名 |
| `echo 250 > …/MaxPower` | 500mA | 配置描述符 MaxPower |
| `ln -sf functions/acm.0 configs/c.1/acm.0` | function 编入 config | `config_usb_cfg_link()` → `func_list` |
| `echo $UDC > UDC` | **启用 gadget** | bind + pullup |
| `destroy` / `down` | 解绑 UDC 并删除 configfs 节点 | 与 `create` 逆序 |

```text
usb_gadget_probe_driver
  → udc_bind_to_driver
  → configfs_composite_bind → usb_add_function(acm)
  → usb_gadget_udc_start (dwc2)
  → usb_gadget_connect (pullup)
```

### 5.3 验证

```bash
G=/sys/kernel/config/usb_gadget/deferred_fb_serial
UDC=$(ls /sys/class/udc | head -n 1)

cat $G/functions/acm.0/port_num    # 只读，多为 0
ls -l /dev/ttyGS0

cat /sys/class/udc/$UDC/state     # 连接 PC 并枚举后常为 configured
lsusb -d 1d6b:0104               # Host 侧确认 VID/PID；完整 dump 见 §5.5
```

### 5.4 停止与删除

```bash
./deferred_fb_serial.sh down
# 或：
echo "" > /sys/kernel/config/usb_gadget/deferred_fb_serial/UDC
```

### 5.5 Host 侧 lsusb 实测

以下摘自 Host（Linux PC）上对脚本的 **`lsusb` / `lsusb -v`**。  
VID/PID **`1d6b:0104`** 在 lsusb 中会显示为 *Linux Foundation Multifunction Composite Gadget*，这是 Linux 基金会为 composite gadget 预留的测试 ID。

#### 5.5.1 设备 listing

```text
Bus 001 Device 002: ID 1d6b:0104 Linux Foundation Multifunction Composite Gadget
```

#### 5.5.2 与脚本的字段对应

| `lsusb -v` 字段 | 实测值 | 脚本 / configfs |
|-----------------|--------|-----------------|
| `idVendor` / `idProduct` | `0x1d6b` / `0x0104` | `idVendor` / `idProduct` |
| `bcdUSB` | 2.00 | `0x0200` |
| `bcdDevice` | 1.00 | `0x0100` |
| `bDeviceClass` | 0（接口级定义） | 未设，默认 0 |
| `bNumConfigurations` | 1 | 单个 `configs/c.1` |
| `bNumInterfaces` | 2 | `functions/acm.0` 标准 CDC ACM |
| 端点 | INT `0x82` + Bulk `0x81`/`0x01` | HS bulk 512 字节，符合 ACM |

#### 5.5.3 描述符结构（符合 CDC ACM）

```text
Configuration (1)
├── Interface Association (IAD)     ← 2 个接口绑成「一个串口功能」
├── Interface 0  CDC Communication  ← 控制：波特率、DTR/RTS；Interrupt IN 0x82
└── Interface 1  CDC Data         ← 数据：Bulk IN 0x81 + Bulk OUT 0x01
```

Host 加载 **一个** `cdc_acm` 驱动 → **一个** `/dev/ttyACM0`（Windows 为一个 COM 口）。  
ACM 规范本就要求 Communication + Data 两个接口。

#### 5.5.4 完整 `lsusb -v -d 1d6b:0104` dump

```text
Bus 001 Device 002: ID 1d6b:0104 Linux Foundation Multifunction Composite Gadget
Device Descriptor:
  bLength                18
  bDescriptorType         1
  bcdUSB               2.00
  bDeviceClass            0 (Defined at Interface level)
  bDeviceSubClass         0
  bDeviceProtocol         0
  bMaxPacketSize0        64
  idVendor           0x1d6b Linux Foundation
  idProduct          0x0104 Multifunction Composite Gadget
  bcdDevice            1.00
  iManufacturer           1 (error)
  iProduct                2 (error)
  iSerial                 3 (error)
  bNumConfigurations      1
OTG Descriptor:
  bLength                 3
  bDescriptorType         9
  bmAttributes         0x03
    SRP (Session Request Protocol)
    HNP (Host Negotiation Protocol)
  Configuration Descriptor:
    bLength                 9
    bDescriptorType         2
    wTotalLength           78
    bNumInterfaces          2
    bConfigurationValue     1
    iConfiguration          4 (error)
    bmAttributes         0x80
      (Bus Powered)
    MaxPower                2mA
    Interface Association:
      bLength                 8
      bDescriptorType        11
      bFirstInterface         0
      bInterfaceCount         2
      bFunctionClass          2 Communications
      bFunctionSubClass       2 Abstract (modem)
      bFunctionProtocol       1 AT-commands (v.25ter)
      iFunction               7 (error)
    Interface Descriptor:
      bLength                 9
      bDescriptorType         4
      bInterfaceNumber        0
      bAlternateSetting       0
      bNumEndpoints           1
      bInterfaceClass         2 Communications
      bInterfaceSubClass      2 Abstract (modem)
      bInterfaceProtocol      1 AT-commands (v.25ter)
      iInterface              5 (error)
      CDC Header:
        bcdCDC               1.10
      CDC Call Management:
        bmCapabilities       0x00
        bDataInterface          1
      CDC ACM:
        bmCapabilities       0x02
          line coding and serial state
      CDC Union:
        bMasterInterface        0
        bSlaveInterface         1
      Endpoint Descriptor:
        bEndpointAddress     0x82  EP 2 IN
        bmAttributes            3  Interrupt
        wMaxPacketSize     0x000a  1x 10 bytes
        bInterval               9
    Interface Descriptor:
      bLength                 9
      bDescriptorType         4
      bInterfaceNumber        1
      bAlternateSetting       0
      bNumEndpoints           2
      bInterfaceClass        10 CDC Data
      bInterfaceSubClass      0 Unused
      bInterfaceProtocol      0
      iInterface              6 (error)
      Endpoint Descriptor:
        bEndpointAddress     0x81  EP 1 IN
        bmAttributes            2  Bulk
        wMaxPacketSize     0x0200  1x 512 bytes
      Endpoint Descriptor:
        bEndpointAddress     0x01  EP 1 OUT
        bmAttributes            2  Bulk
        wMaxPacketSize     0x0200  1x 512 bytes
Device Status:     0xeeb0
  (Bus Powered)
  HNP Capable
  ALT port is HNP Capable
```

#### 5.5.5 字符串 `(error)` 的说明

`iManufacturer` / `iProduct` / `iSerial` 显示 `(error)` 时，多为 **libusb 读 STRING 描述符失败**，不一定表示 gadget 未写字符串。

**Host 侧更可靠的读法（Linux）：**

```bash
for d in /sys/bus/usb/devices/*-*; do
  [ "$(cat $d/idVendor 2>/dev/null)" = "1d6b" ] || continue
  [ "$(cat $d/idProduct 2>/dev/null)" = "0104" ] || continue
  echo "=== $d ==="
  cat $d/manufacturer $d/product $d/serial
done
```

---

## 6. 源码与文档索引

| 内容 | 路径 |
|------|------|
| CDC ACM function | `drivers/usb/gadget/function/f_acm.c` |
| ttyGS / gserial API | `drivers/usb/gadget/function/u_serial.c` |
| configfs gadget | `drivers/usb/gadget/configfs.c` |
| configfs 通用流程 | `Documentation/usb/gadget_configfs.rst` |
| ACM port_num ABI | `Documentation/ABI/testing/configfs-usb-gadget-acm` |
| Gadget Serial 说明 | `Documentation/usb/gadget_serial.rst` |

### `f_acm` 与 ttyGS 的衔接

创建 `functions/acm.<name>` 时调用 `gserial_alloc_line()` 分配 port 号；  
Host **SET_CONFIGURATION** 后 `gserial_connect()` 将 USB 数据路径与 tty 联通（`f_acm.c`）。

configfs 只读属性：

```text
/sys/kernel/config/usb_gadget/.../functions/acm.0/port_num
```
