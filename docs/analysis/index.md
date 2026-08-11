---
home: false
---

# 内核分析

Linux 内核子系统与驱动源码阅读。详细目录在 [Linux 内核](/analysis/kernel/)。

## 子系统

| 专题 | 说明 |
|------|------|
| [USB](/analysis/kernel/usb/) | Host 枚举 / Probe、Gadget |
| [Pinctrl / GPIO](/analysis/kernel/pinctrl/) | 引脚复用、GPIO |
| [SPI](/analysis/kernel/spi/) | SPI 同步传输 |
| [Media / V4L2](/analysis/kernel/media/) | 摄像头、V4L2、PXP |
| [Sound / ALSA](/analysis/kernel/sound/) | ASoC、i.MX6ULL + WM8960 |
| [BPF / kprobe](/analysis/kernel/bpf/) | eBPF kprobe、ftrace 插桩 |

## 调试与实践

具体问题的排查记录，见 [调试与实践](/analysis/kernel/debug/)。

- [USB](/analysis/kernel/debug/usb/)
- [Pinctrl / GPIO](/analysis/kernel/debug/gpio/)
- [写作模板](/analysis/kernel/debug/template)
