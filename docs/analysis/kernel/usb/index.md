---
home: false
---

# USB 子系统

Host 侧枚举、Probe，以及 Gadget。默认对照 Linux 6.8，个别文章文首另有说明。

## Host

1. [USB 2.0 枚举流程](/analysis/kernel/usb/usb-enumeration)
2. [hub_port_init 调用链](/analysis/kernel/usb/hub-port-init)
3. [usb_get_descriptor 调用链](/analysis/kernel/usb/get-descriptor-trace)
4. [枚举与两轮 Probe](/analysis/kernel/usb/enumeration-and-probe)
5. [UVC 驱动分析](/analysis/kernel/usb/uvc-driver)

## Gadget

6. [Gadget 子系统概览](/analysis/kernel/usb/gadget-subsystem) — UDC / composite / configfs
7. [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) — `gadget_info`、`cdev`、bind
8. [UDC bind 分析](/analysis/kernel/usb/gadget-udc-core-bind) — `udc_bind_to_driver`、pending、pullup
9. [DWC2 接口总览](/analysis/kernel/usb/gadget-dwc2-interface) — `gadget_ops` / `ep_ops`
10. [Composite EP0 枚举](/analysis/kernel/usb/gadget-composite-ep0) — `composite_setup`、`SET_CONFIGURATION`
11. [ACM Function 路径](/analysis/kernel/usb/gadget-function-acm) — `f_acm.c`、`gserial_connect`、ttyGS
12. [Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm) — configfs、`ttyGS0`、Host `cdc_acm`

具体踩坑记录：[USB 调试笔记](/analysis/kernel/debug/usb/)。
