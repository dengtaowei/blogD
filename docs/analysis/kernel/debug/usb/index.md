---
home: false
---

# USB · 调试与实践

USB 子系统相关的具体问题排查与实验记录。

**流程分析**（成体系阅读）：[USB 子系统概览](/analysis/kernel/) · 建议从 [USB 2.0 枚举流程](/analysis/kernel/usb/usb-enumeration) 起按序阅读。

---

## 记录

<!-- 有新文章时在下方追加，按时间倒序或主题分组 -->

_暂无条目。可参考 [写作模板](/analysis/kernel/debug/template) 新增。_

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
