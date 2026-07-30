---
home: false
---

# BPF / kprobe

eBPF 经 kprobe / ftrace 挂到内核函数入口的路径分析，以及插桩改码实测。

对照内核以 **Ubuntu HWE Linux 5.15** 为主（与本站多数 6.8 文章不同，各文文首已注明）。

## 阅读顺序

1. [eBPF kprobe：load / attach / 命中](/analysis/kernel/bpf/ebpf-kprobe-load-attach) — `bpf(PROG_LOAD)` → `perf_event_open` → `BPF_LINK_CREATE` → 命中执行；同函数多 BPF 的 `aggr` 分发
2. [kprobe-on-ftrace 插桩实测](/analysis/kernel/bpf/kprobe-on-ftrace-lab) — 入口 NOP↔CALL、trampoline → `kprobe_ftrace_handler`、handler 上下文

配套源码：[code/kprobe-bytes-demo](https://github.com/dengtaowei/blogD/tree/main/code/kprobe-bytes-demo)。

材料源自 [usbtrace](https://github.com/dengtaowei/usbtrace) 的学习笔记与教学模块。
