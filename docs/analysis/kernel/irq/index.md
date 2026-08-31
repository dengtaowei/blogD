---
home: false
---

# 中断 / softirq

硬中断、softirq、arm64 异常入口与加锁配对。默认对照 Linux 6.8。

## 文章

- [硬中断、softirq 与 arm64 路径](/analysis/kernel/irq/hardirq-softirq-arm64) — 栈与上下文、`irq_exit`、`local_bh_disable`、加锁
