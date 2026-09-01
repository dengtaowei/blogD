---
home: false
---

# 中断 / softirq

硬中断、softirq、arm64 异常入口与加锁配对。默认对照 Linux 6.8。

## 文章

- [硬中断、softirq 与 arm64 路径](/analysis/kernel/irq/hardirq-softirq-arm64) — 栈与上下文、`irq_exit`、`local_bh_disable`、加锁
- [ARM64 异常路径上的栈切换](/analysis/kernel/irq/arm64-stack-switch) — 硬件换 `SP_EL1`、劫持 `SP_EL0`、IRQ 栈与 `cpu_switch_to`
