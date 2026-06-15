# Gadget CDC ACM 串口（configfs）

配套文章：[USB Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm) · [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) · [UDC bind 分析](/analysis/kernel/usb/gadget-udc-core-bind) · [DWC2 接口总览](/analysis/kernel/usb/gadget-dwc2-interface) · [Composite EP0 枚举](/analysis/kernel/usb/gadget-composite-ep0) · [ACM Function 路径](/analysis/kernel/usb/gadget-function-acm)

```bash
chmod +x deferred_fb_serial.sh
./deferred_fb_serial.sh up    # 启用 gadget，板子侧 /dev/ttyGS0
./deferred_fb_serial.sh down  # 解绑并删除 configfs 节点
```
