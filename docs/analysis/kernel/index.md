---
home: false
---

# Linux 内核

Linux 内核子系统源码分析（Linux 6.8）。

## USB 子系统

1. [USB 2.0 枚举流程](/analysis/kernel/usb/usb-enumeration)
2. [hub_port_init 调用链](/analysis/kernel/usb/hub-port-init)
3. [usb_get_descriptor 调用链](/analysis/kernel/usb/get-descriptor-trace)
4. [枚举与两轮 Probe](/analysis/kernel/usb/enumeration-and-probe)
5. [UVC 驱动分析](/analysis/kernel/usb/uvc-driver)
6. [Gadget 子系统概览](/analysis/kernel/usb/gadget-subsystem) — UDC / composite / configfs 四层架构
7. [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) — `gadget_info` / `cdev` 脚本拼装与 bind
8. [UDC bind 分析](/analysis/kernel/usb/gadget-udc-core-bind) — `udc_bind_to_driver`、pending、pullup
9. [Composite EP0 枚举](/analysis/kernel/usb/gadget-composite-ep0) — `composite_setup`、`SET_CONFIGURATION`
10. [ACM Function 路径](/analysis/kernel/usb/gadget-function-acm) — `f_acm.c`、`gserial_connect` 与 ttyGS
11. [Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm) — configfs + `ttyGS0` / Host `cdc_acm`

## Media / V4L2 子系统

- [V4L2 设备注册与 video 节点](/analysis/kernel/media/v4l2-device-registration)
- [V4L2 ioctl 分发](/analysis/kernel/media/v4l2-ioctl-dispatch)
- [videobuffer2：Buffer 状态机与双链表](/analysis/kernel/media/v4l2-vb2-queue)

## Pinctrl / GPIO 子系统

- [STM32 Pinctrl 分析](/analysis/kernel/pinctrl/stm32-pinctrl)
- [STM32 GPIO 分析](/analysis/kernel/gpio/stm32-gpio)

## SPI 子系统

- [STM32MP157 SPI 子系统](/analysis/kernel/spi/spi-sync-trace)

## 调试与实践

针对具体问题的排查记录与实验笔记（与上方流程分析互补）。

- [概览与写作说明](/analysis/kernel/debug/)
- [USB 调试记录](/analysis/kernel/debug/usb/)
- [Pinctrl / GPIO 调试记录](/analysis/kernel/debug/gpio/)
- [写作模板](/analysis/kernel/debug/template)
