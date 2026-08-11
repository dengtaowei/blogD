---
home: false
---

# USB · 调试与实践

USB 子系统相关的具体问题排查与实验记录。

**流程分析**（成体系阅读）：[USB 子系统概览](/analysis/kernel/) · 建议从 [USB 2.0 枚举流程](/analysis/kernel/usb/usb-enumeration) 起按序阅读。

---

## 记录

- [DJI `2ca3:8004` id_table 与 UVC 枚举](/analysis/kernel/debug/usb/dji-osmo-uvc-uac2-id-table) — eCos 上 UAC2 probe 报 `invalid HEADER`，阻塞 UVC 接口继续 probe
- [USB Device 公头悬空误报 Suspend](/analysis/kernel/debug/usb/floating-male-false-suspend) — 未插入却 soft-connect 时，悬空 D± 线态触发 `USBSUSP`；修法是会话门控而非 D− 下拉

---

## 常用手段（备忘）

| 手段 | 典型用途 |
|------|----------|
| `dmesg` / `journalctl -k` | 内核报错、probe 失败 |
| `lsusb -t` / Wireshark | 拓扑与协议层抓包 |
| `trace-cmd` / ftrace | 函数调用链、事件时序 |
| `/sys/kernel/debug/usb/` | 调试节点（需 `CONFIG_DEBUG_FS`） |
| 源码 + GDB / `printk` | 定点验证假设 |

相关流程文：[trace-cmd 跟踪](/analysis/kernel/usb/enumeration-and-probe#4-trace-cmd-跟踪) · [usb_get_descriptor 调用链](/analysis/kernel/usb/get-descriptor-trace)
