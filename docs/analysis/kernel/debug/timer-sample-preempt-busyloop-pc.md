---
date: 2026-09-11
homeTag: 内核 · 调试
homeTitle: 定时器采样抓关抢占空转的 PC/LR
homeDesc: preempt_disable+while(1)；arch_timer 采样同 pid；PC=trigger_store+0xc 对上 b .
sidebarOrder: 7
sidebarTitle: 定时器采样抓空转 PC
---

# 用 arch_timer 采样抓关抢占空转的 PC / LR

> **环境**：Linux 5.4.31 · ARM · STM32MP157 · `SMP PREEMPT` · 模块 `pc_fault`  
> **关联**：[根据 Oops 的 PC 定位到出错指令](/analysis/kernel/debug/oops-pc-to-source) · [硬中断与 softirq](/analysis/kernel/irq/hardirq-softirq-arm64)  
> **摘要**：在 `preempt_disable()` + `while (1)` 下用 tick 采样同一 pid，打印被打断现场的 PC/LR，并使用 `objdump` / `kallsyms` 找到死循环指令。

---

## 目录

- [1. 现象](#1-现象)
- [2. 实验目的与复现手段](#2-实验目的与复现手段)
- [3. 检测钩子（内核侧）](#3-检测钩子内核侧)
- [4. 根据 PC 找到汇编](#4-根据-pc-找到汇编)

---

## 1. 现象

写 sysfs 触发关抢占空转后，约每 10 秒一条：

```text
irqhog: cpu=1 pid=406 (sh) pc=0xbf00000c lr=0xc014f0c4
```

模块符号：

```text
# grep bf0000 /proc/kallsyms
bf000000 t trigger_store        [pc_fault]
bf000010 t trigger_show         [pc_fault]
...
```

对 `pc_fault.ko` 反汇编（节选）：

```text
00000000 <trigger_store>:
   0:	e92d4010 	push	{r4, lr}
   4:	e3a00001 	mov	r0, #1
   8:	ebfffffe 	bl	0 <preempt_count_add>
   c:	eafffffe 	b	c <trigger_store+0xc>
```

| 日志字段 | 读法 |
|----------|------|
| `pc=0xbf00000c` | 相对 `trigger_store` 基址 `0xbf000000` 为 **+0xc** |
| `+0xc` 指令 | `b c`，即跳到自身 → 源码里的 `while (1)` |
| `lr=0xc014f0c4` | 内核空间；进入死循环前 `bl preempt_count_add` 相关返回链路上的 LR 现场 |

---

## 2. 实验目的与复现手段

### 2.1 要验证什么

在 **开着 `CONFIG_PREEMPT`** 的内核上：

1. 某任务在内核路径里空转，且 **关抢占**，时钟中断仍能进；
2. 用 **arch_timer（GIC INTID 27）** 周期性看「被打断的 `current`」；
3. 若同一 pid 连续多次被采到，打印当时 `pt_regs` 的 PC / LR，从而定位空转指令。

`preempt_disable()` 只是复现手段：开抢占时，普通 `while (1)` 会被调度走，1Hz 采样很难连续采到同一 pid。

### 2.2 模块侧触发

`pc_fault` 的 sysfs store（示意）：

```c
static ssize_t trigger_store(...)
{
	preempt_disable();
	while (1)
		;
	preempt_enable();	/* 不可达 */
	...
}
```

复现：

```bash
insmod pc_fault.ko
echo 0 > /sys/kernel/pc_fault/trigger   # 该 shell 卡在 write → trigger_store
```

该进程：`State=R`，`wchan=0`，`stime` 持续增长；Ctrl+C 无效（卡在内核态，回不到用户态处理信号）。

---

## 3. 检测钩子（内核侧）

挂在 `__handle_domain_irq` 里，在 `irq_enter()` 之后、对 **hwirq == 27**（本板 arch_timer 的 GIC INTID，`/proc/interrupts` 中为 `GIC-0 27 … arch_timer`）采样：

```text
gic_handle_irq
  └─ __handle_domain_irq(..., hwirq, ...)
        ├─ irq_enter()
        ├─ if (hwirq == 27) irqhog_arch_timer_sample(regs);   ← 采样
        └─ irq_find_mapping → generic_handle_irq → arch_timer_handler_virt …
```

采样逻辑概要（per-CPU）：

1. 至多每秒一次（`jiffies` 间隔 `HZ`）；
2. 读 `task_pid_nr(current)`；idle（pid 0）或 pid 变化则清计数；
3. 同一 pid 连续满 10 次 → `pr_emerg` 打印 PC / LR（十六进制；硬中断里避免 `%pS` 解析模块符号）。

因此日志间隔约 10 秒一条，与阈值一致。

---

## 4. 根据 PC 找到汇编

步骤与 [Oops PC 定位](/analysis/kernel/debug/oops-pc-to-source) 相同，只是来源是采样打印而非 Oops。

1. `kallsyms`：`trigger_store` = `0xbf000000`（本次加载地址，重载模块会变）；
2. 运行时 PC `0xbf00000c` → 模块内偏移 **+0xc**；
3. 对本机构建的 `pc_fault.ko`：

```bash
arm-buildroot-linux-gnueabihf-objdump -d pc_fault.ko | sed -n '/<trigger_store>/,/^$/p'
```

4. `+0xc` 处为 `b <trigger_store+0xc>`，对应 C 的 `while (1)`；其前是 `bl preempt_count_add`（`preempt_disable()` 展开）。