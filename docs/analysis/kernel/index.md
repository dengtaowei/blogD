# Linux 内核

Linux 内核子系统源码分析（Linux 6.8）。

## USB 子系统

1. [USB 2.0 枚举流程](/analysis/kernel/usb/usb-enumeration)
2. [hub_port_init 调用链](/analysis/kernel/usb/hub-port-init)
3. [usb_get_descriptor 调用链](/analysis/kernel/usb/get-descriptor-trace)
4. [枚举与两轮 Probe](/analysis/kernel/usb/enumeration-and-probe)
5. [UVC 驱动分析](/analysis/kernel/usb/uvc-driver)

## Pinctrl / GPIO 子系统

- [STM32 Pinctrl 分析](/analysis/kernel/pinctrl/stm32-pinctrl)
- [STM32 GPIO 分析](/analysis/kernel/gpio/stm32-gpio)

## 调试与实践

针对具体问题的排查记录与实验笔记（与上方流程分析互补）。

- [概览与写作说明](/analysis/kernel/debug/)
- [USB 调试记录](/analysis/kernel/debug/usb/)
- [写作模板](/analysis/kernel/debug/template)
