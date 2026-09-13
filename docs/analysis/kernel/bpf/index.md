---
home: false
---

# BPF / kprobe

eBPF 挂到内核函数入口（kprobe / ftrace）的路径，以及插桩改码的实测。

内核以 Ubuntu HWE **Linux 5.15** 为主（和站里多数 6.8 文不一样，各篇文首有写）。

## 阅读顺序

1. [eBPF kprobe：load / attach / 命中](/analysis/kernel/bpf/ebpf-kprobe-load-attach) — `bpf(PROG_LOAD)` → `perf_event_open` → `BPF_LINK_CREATE` → 命中；同函数多个 BPF 时的 `aggr` 分发
2. [kprobe-on-ftrace 插桩实测](/analysis/kernel/bpf/kprobe-on-ftrace-lab) — x86 Ubuntu：入口 NOP↔CALL、trampoline → `kprobe_ftrace_handler`
3. [经典 kprobe 插桩实测](/analysis/kernel/bpf/kprobe-breakpoint-lab) — STM32MP157 ARM32：undef 断点 `0xe7f001f8`（非 ftrace）

配套代码：

- [code/kprobe-bytes-demo](https://github.com/dengtaowei/blogD/tree/main/code/kprobe-bytes-demo)（ftrace 路径）
- [code/kprobe-brk-demo](https://github.com/dengtaowei/blogD/tree/main/code/kprobe-brk-demo)（ARM 经典断点）

材料整理自 [usbtrace](https://github.com/dengtaowei/usbtrace) / 板端联调笔记。
