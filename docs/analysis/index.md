# 代码分析

对 Linux 内核子系统与驱动源码的逐段阅读与分析。

## Linux 内核

详见 [Linux 内核分析](/analysis/kernel/) 目录。

### USB 子系统

1. [USB 2.0 枚举流程](/analysis/kernel/usb/usb-enumeration) — 协议层 Token / DATA0 / DATA1 / ACK
2. [hub_port_init 调用链](/analysis/kernel/usb/hub-port-init) — 插盘到地址分配、读设备描述符
3. [usb_get_descriptor 调用链](/analysis/kernel/usb/get-descriptor-trace) — core 到 xHCI 的 URB 路径
4. [枚举与两轮 Probe](/analysis/kernel/usb/enumeration-and-probe) — `usb_new_device` 与驱动绑定
5. [UVC 驱动分析](/analysis/kernel/usb/uvc-driver) — USB Video Class 类驱动结构

### Pinctrl / GPIO 子系统

- [STM32 Pinctrl 分析](/analysis/kernel/pinctrl/stm32-pinctrl) — 设备树 pinmux 到 `set_mux` 写寄存器
- [STM32 GPIO 分析](/analysis/kernel/gpio/stm32-gpio) — 设备树 gpiochip 注册到外设 `led-gpios` 消费
