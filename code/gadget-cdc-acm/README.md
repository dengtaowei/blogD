# Gadget CDC ACM 串口（configfs）

配套文章：[USB Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm) · [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly)

```bash
chmod +x deferred_fb_serial.sh
./deferred_fb_serial.sh up    # 启用 gadget，板子侧 /dev/ttyGS0
./deferred_fb_serial.sh down  # 解绑并删除 configfs 节点
```
