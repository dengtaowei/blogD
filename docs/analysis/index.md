# 代码分析

对开源驱动、协议栈和嵌入式项目进行逐段阅读与分析。

## USB 协议与内核（Linux 6.8）

推荐阅读顺序：

1. [USB 2.0 枚举流程](/analysis/usb/usb-enumeration) — 协议层 Token / DATA0 / DATA1 / ACK
2. [hub_port_init 调用链](/analysis/usb/hub-port-init) — 插盘到地址分配、读设备描述符
3. [usb_get_descriptor 调用链](/analysis/usb/get-descriptor-trace) — core 到 xHCI 的 URB 路径
4. [枚举与两轮 Probe](/analysis/usb/enumeration-and-probe) — `usb_new_device` 与驱动绑定

## 内核子系统

- [STM32 Pinctrl 分析](/analysis/kernel/stm32-pinctrl) — 设备树 pinmux 到 `set_mux` 写寄存器

## 驱动分析

- [UVC 驱动分析](/analysis/uvc-driver) — USB Video Class 驱动结构初探
