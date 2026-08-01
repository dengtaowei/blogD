---
home: false
---

# 内核分析

对 Linux 内核子系统与驱动源码的逐段阅读与分析。

## Linux 内核

详见 [Linux 内核分析](/analysis/kernel/) 目录。

### USB 子系统

1. [USB 2.0 枚举流程](/analysis/kernel/usb/usb-enumeration) — 协议层 Token / DATA0 / DATA1 / ACK
2. [hub_port_init 调用链](/analysis/kernel/usb/hub-port-init) — 插盘到地址分配、读设备描述符
3. [usb_get_descriptor 调用链](/analysis/kernel/usb/get-descriptor-trace) — core 到 xHCI 的 URB 路径
4. [枚举与两轮 Probe](/analysis/kernel/usb/enumeration-and-probe) — `usb_new_device` 与驱动绑定
5. [UVC 驱动分析](/analysis/kernel/usb/uvc-driver) — USB Video Class 类驱动结构
6. [Gadget 子系统概览](/analysis/kernel/usb/gadget-subsystem) — Device 侧 UDC / composite / configfs
7. [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) — `gadget_info` / `cdev` 拼装与 bind
8. [UDC bind 分析](/analysis/kernel/usb/gadget-udc-core-bind) — `udc/core` 配对与 pullup
9. [DWC2 接口总览](/analysis/kernel/usb/gadget-dwc2-interface) — `gadget_ops`、`ep_ops` 交付边界
10. [Composite EP0 枚举](/analysis/kernel/usb/gadget-composite-ep0) — `composite_setup`、SET_CONFIGURATION
11. [ACM Function 路径](/analysis/kernel/usb/gadget-function-acm) — bind、`set_alt` 与 ttyGS 数据面
12. [Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm) — configfs + `ttyGS0`

### Pinctrl / GPIO 子系统

- [STM32 Pinctrl 分析](/analysis/kernel/pinctrl/stm32-pinctrl) — 设备树 pinmux 到 `set_mux` 写寄存器
- [STM32 GPIO 分析](/analysis/kernel/gpio/stm32-gpio) — 设备树 gpiochip 注册到外设 `led-gpios` 消费

### Sound / ALSA

- [系列概览](/analysis/kernel/sound/)
- [i.MX6ULL `/dev/snd` 设备节点](/analysis/kernel/sound/imx6ull-snd-devices) — Linux 4.9.88 BSP
- [i.MX6ULL 声卡播放路径](/analysis/kernel/sound/imx6ull-audio-playback-flow) — 播放分层与调用栈

### BPF / kprobe

- [系列概览](/analysis/kernel/bpf/)
- [eBPF kprobe：load / attach / 命中](/analysis/kernel/bpf/ebpf-kprobe-load-attach) — 5.15 源码路径
- [kprobe-on-ftrace 插桩实测](/analysis/kernel/bpf/kprobe-on-ftrace-lab) — NOP↔CALL 实验

### 调试与实践

针对具体问题的排查与实验记录（非成体系流程文）。

- [概览](/analysis/kernel/debug/) · [USB](/analysis/kernel/debug/usb/) · [写作模板](/analysis/kernel/debug/template)
- [DJI Osmo UVC/UAC2 枚举排查](/analysis/kernel/debug/usb/dji-osmo-uvc-uac2-id-table) — eCos 上 `2ca3:8004` id_table 与 UAC2 probe 阻塞
