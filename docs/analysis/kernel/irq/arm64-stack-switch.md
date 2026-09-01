---
date: 2026-09-01
homeTag: 内核 · 中断
homeTitle: ARM64 异常路径上的栈切换
homeDesc: 硬件换 SP_EL1、劫持 SP_EL0、IRQ 栈与 cpu_switch_to
sidebarOrder: 20
sidebarTitle: ARM64 异常栈切换
---

# ARM64 Linux 异常路径上的栈切换（6.8）

> Linux 6.8 · `arch/arm64/kernel/entry.S`、`entry-common.c`  
> **Linux 内核 · 中断 / softirq**  
> 把 ARM64 异常路径上的栈切换串成一条时间线：哪些是栈、`SP_EL0` 在内核里干什么、IRQ 栈何时切、和调度换栈有什么不同。不重复 16 槽向量表，只写 **三次切换 + 调度那一次**。  
> 相关：[硬中断、softirq 与 arm64 路径](/analysis/kernel/irq/hardirq-softirq-arm64)

---

## 目录

- [1. Linux 有哪些栈](#1-linux-有哪些栈)
- [2. 第 0 步：硬件把 SP 换成任务内核栈](#2-第-0-次硬件把-sp-换成任务内核栈)
- [3. 第 1 步：`kernel_entry` 保存上下文](#3-第-1-步kernel_entry-保存上下文)
- [4. 第 2 步：硬中断才上 IRQ 栈](#4-第-2-步硬中断才上-irq-栈)
- [5. EL0 IRQ 和 EL1 IRQ 的调用栈不一样](#5-el0-irq-和-el1-irq-的调用栈不一样)
- [6. 调度换栈](#6-调度换栈)
- [附录 A：源码索引](#附录-a源码索引)
- [附录 B：要点速记](#附录-b要点速记)

---

## 1. Linux 有哪些栈

6.8 arm64 日常会碰到的内存「栈」：

| 名字 | 粒度 | 大小（常见） | 角色 |
|------|------|----------------|------|
| 用户栈 | 每线程 | 用户态自己的 | EL0 的 `SP`，就是 `SP_EL0` |
| 任务内核栈 | 每线程 | `THREAD_SIZE`（通常 16K） | syscall / 缺页 / 存 `pt_regs` / `schedule` |
| IRQ 栈 | 每 CPU | 等于 `THREAD_SIZE` | 硬中断、FIQ 的 handler |

AArch64 按异常级别各备一个栈指针寄存器：SP_EL0、SP_EL1、SP_EL2、SP_EL3。**`SP_EL0` 在内核里有别的用处。** `current` 的实现就是读它：

```15:24:arch/arm64/include/asm/current.h
static __always_inline struct task_struct *get_current(void)
{
	unsigned long sp_el0;

	asm ("mrs %0, sp_el0" : "=r" (sp_el0));

	return (struct task_struct *)sp_el0;
}
#define current get_current()
```

Linux 在 EL1 默认 `SPSel=1`，真正当栈用的是 `SP_EL1`（硬件 SP 寄存器）。

---

## 2. 第 0 步：硬件把 SP 换成任务内核栈

异常触发之后，CPU 自动把 `SPSel` 置1，自动换栈到 `SP_EL1`，等到异常处理程序开始执行的时候，已经在内核栈上了。

| 硬件在干什么 | 人话 |
|---|---|
| `ELR_EL1 ← PC` | 打断时执行到哪条指令，回来接着跑 |
| `SPSR_EL1 ← PSTATE` | 保存当时的处理器状态（用户还是内核、中断开没开等），回来按这份恢复 |
| 屏蔽 DAIF | 关闭硬中断，免得现场没存完又被打断 |
| `SPSel ← 1`，`sp` 变成 `SP_EL1` | 别再用用户栈，改用事先准备好的内核栈 |
| `PC ← VBAR_EL1 + 槽偏移` | 跳到内核异常入口表的某一格。用户态 IRQ 是 `+0x480`，内核自己被打断是 `+0x280` |

从用户态进来时，用户栈已经不能用：寄存器全是用户的值。所以 **`SP_EL1` 必须事先指向该任务内核栈顶**。`SP_EL1` 的维护由内核完成，这里不展开。

内核自己跑着被打断时，硬件同样会强制改用 `SP_EL1`。Linux 内核本来就在这个栈上跑，所以这一步常常只是「继续用当前内核栈」，除非当时已经在 IRQ 栈上。

CPU 跳进 `vectors` 之后，软件第一件事才是 `kernel_ventry` 里的 `sub sp, sp, #PT_REGS_SIZE`：在 **已经换成内核栈** 上给 `pt_regs` 留坑，然后才进 `kernel_entry`。

表在 `arch/arm64/kernel/entry.S`，基址写入 `VBAR_EL1`，每槽 0x80 字节（`.align 7`）：

```text
SYM_CODE_START(vectors)                    // = VBAR_EL1
  kernel_ventry  1, t, 64, sync            // +0x000  EL1t  同步（Linux 当未处理）
  kernel_ventry  1, t, 64, irq             // +0x080  EL1t  IRQ
  kernel_ventry  1, t, 64, fiq             // +0x100  EL1t  FIQ
  kernel_ventry  1, t, 64, error            // +0x180  EL1t  SError

  kernel_ventry  1, h, 64, sync            // +0x200  EL1h  同步（缺页等）
  kernel_ventry  1, h, 64, irq             // +0x280  EL1h  IRQ   ← 内核跑着被打断
  kernel_ventry  1, h, 64, fiq             // +0x300  EL1h  FIQ
  kernel_ventry  1, h, 64, error            // +0x380  EL1h  SError

  kernel_ventry  0, t, 64, sync            // +0x400  EL0   同步（SVC / 缺页）
  kernel_ventry  0, t, 64, irq             // +0x480  EL0   IRQ   ← 用户态被打断
  kernel_ventry  0, t, 64, fiq             // +0x500  EL0   FIQ
  kernel_ventry  0, t, 64, error            // +0x580  EL0   SError

  kernel_ventry  0, t, 32, sync            // +0x600  32 位用户态（CONFIG_COMPAT）
  ...
```

```text
	.macro entry_handler el:req, ht:req, regsize:req, label:req
SYM_CODE_START_LOCAL(el\el\ht\()_\regsize\()_\label)
	kernel_entry \el, \regsize                     // 在任务内核栈上填好 pt_regs
	mov	x0, sp                                     // x0 = &pt_regs，给后面的 C handler
	bl	el\el\ht\()_\regsize\()_\label\()_handler  // el1h_64_irq_handler 或者 el0t_64_irq_handler
	.if \el == 0
	b	ret_to_user
	.else
	b	ret_to_kernel
	.endif
SYM_CODE_END(el\el\ht\()_\regsize\()_\label)
	.endm

/*
 * Early exception handlers
 */
	entry_handler	1, t, 64, sync
	entry_handler	1, t, 64, irq
	entry_handler	1, t, 64, fiq
	entry_handler	1, t, 64, error

	entry_handler	1, h, 64, sync
	entry_handler	1, h, 64, irq
	entry_handler	1, h, 64, fiq
	entry_handler	1, h, 64, error

	entry_handler	0, t, 64, sync
	entry_handler	0, t, 64, irq
	entry_handler	0, t, 64, fiq
	entry_handler	0, t, 64, error

	entry_handler	0, t, 32, sync
	entry_handler	0, t, 32, irq
	entry_handler	0, t, 32, fiq
	entry_handler	0, t, 32, error
```

kernel_ventry 是个宏，参数用来拼入口名字。kernel_ventry 的展开不赘述，两个异常分别会跳到 el1h_64_irq 和 el0t_64_irq。这两个跳转的 label 也由宏生成。最终是进了 el1h_64_irq_handler 或者 el0t_64_irq_handler。

宏参数里的 `t` / `h` 表示 **进异常前 CPU 用的哪个栈指针**：`t` 是 `SP_EL0`，`h` 是 `SP_EL1`。内核一直用 `SP_EL1`，所以内核里来的 IRQ 进第二排的 EL1h（`+0x280`），第一排 EL1t 正常走不到。



---

## 3. 第 1 步：`kernel_entry` 保存上下文

`entry_handler` 展开后（以用户态 IRQ 为例）：

```
el0t_64_irq:
    kernel_entry 0, 64
    mov x0, sp          // pt_regs *
    bl  el0t_64_irq_handler
    b   ret_to_user
```

`kernel_entry` 在任务内核栈上保存 `x0–x29`，然后 **仅当 `\el == 0`**：

```221:225:arch/arm64/kernel/entry.S
	.if	\el == 0
	clear_gp_regs
	mrs	x21, sp_el0
	ldr_this_cpu	tsk, __entry_task, x20
	msr	sp_el0, tsk
```

含义：

1. `x21 = 用户 SP`（还在 `SP_EL0` 里）
2. `tsk = 当前任务`（per-cpu `__entry_task`）
3. `SP_EL0 ← tsk`，从此 `current` 可用
4. 稍后 `stp lr, x21, [sp, #S_LR]`，用户 SP 进 `pt_regs`

从 EL1 进来时走 `.else`：`x21 = sp + PT_REGS_SIZE`（被打断时的内核 SP）。

返回用户态时 `kernel_exit 0` 做逆操作：

```364:366:arch/arm64/kernel/entry.S
	.if	\el == 0
	ldr	x23, [sp, #S_SP]
	msr	sp_el0, x23
```

`eret` 降到 EL0 后，硬件再次用 `SP_EL0`，那时它已经是用户栈指针。

`kernel_entry` 做完，现场已经在任务内核栈上的 `pt_regs` 里。syscall、缺页这类同步异常到此结束，不会再切到 IRQ 栈；硬中断才会，见下一节。

---

## 4. 第 2 步：硬中断才上 IRQ 栈

硬中断打断用户态，处理函数如下：

```c
static void noinstr el0_interrupt(struct pt_regs *regs,
				  void (*handler)(struct pt_regs *))
{
	enter_from_user_mode(regs);

	write_sysreg(DAIF_PROCCTX_NOIRQ, daif);

	if (regs->pc & BIT(55))
		arm64_apply_bp_hardening();

	irq_enter_rcu();
	do_interrupt_handler(regs, handler);
	irq_exit_rcu();

	exit_to_user_mode(regs);
}

static void noinstr __el0_irq_handler_common(struct pt_regs *regs)
{
	el0_interrupt(regs, handle_arch_irq);
}

asmlinkage void noinstr el0t_64_irq_handler(struct pt_regs *regs)
{
	__el0_irq_handler_common(regs);
}

static void noinstr __el0_fiq_handler_common(struct pt_regs *regs)
{
	el0_interrupt(regs, handle_arch_fiq);
}

asmlinkage void noinstr el0t_64_fiq_handler(struct pt_regs *regs)
{
	__el0_fiq_handler_common(regs);
}
```

硬中断打断内核态，处理函数如下：

```c
static __always_inline void __el1_irq(struct pt_regs *regs,
				      void (*handler)(struct pt_regs *))
{
	enter_from_kernel_mode(regs);

	irq_enter_rcu();
	do_interrupt_handler(regs, handler);
	irq_exit_rcu();

	arm64_preempt_schedule_irq();

	exit_to_kernel_mode(regs);
}
static void noinstr el1_interrupt(struct pt_regs *regs,
				  void (*handler)(struct pt_regs *))
{
	write_sysreg(DAIF_PROCCTX_NOIRQ, daif);

	if (IS_ENABLED(CONFIG_ARM64_PSEUDO_NMI) && !interrupts_enabled(regs))
		__el1_pnmi(regs, handler);
	else
		__el1_irq(regs, handler);
}

asmlinkage void noinstr el1h_64_irq_handler(struct pt_regs *regs)
{
	el1_interrupt(regs, handle_arch_irq);
}
```

最终都走到 `do_interrupt_handler`

```c
static void do_interrupt_handler(struct pt_regs *regs,
				 void (*handler)(struct pt_regs *))
{
	struct pt_regs *old_regs = set_irq_regs(regs);

	if (on_thread_stack())
		call_on_irq_stack(regs, handler);  // 不在 IRQ 栈上就切换。
	else
		handler(regs);  // 已经在 IRQ 栈上，则直接执行。

	set_irq_regs(old_regs);
}
```

对于硬中断打断内核态，当前有可能在任务内核栈上，也有可能是在 IRQ 栈上 (前一个硬中断执行完紧跟着的软中断被当前硬中断打断)。`on_thread_stack()` 就是「当前 SP 是否落在 `current` 的任务栈范围内」。在任务栈上才切；已经在 IRQ 栈上（硬中断打断软中断）则直接 `handler(regs)`，避免再切一次、也避免把嵌套现场叠错。

对于硬中断打断用户态，总是要进行栈的切换。

真正换 SP 的是汇编：

```874:896:arch/arm64/kernel/entry.S
SYM_FUNC_START(call_on_irq_stack)
	stp	x29, x30, [sp, #-16]!
	mov	x29, sp
	ldr_this_cpu x16, irq_stack_ptr, x17
	add	sp, x16, #IRQ_STACK_SIZE
	blr	x1
	mov	sp, x29
	ldp	x29, x30, [sp], #16
	ret
```

在 **任务栈** 上留一个 frame（FP/LR，FP 里隐含旧 SP），把 `sp` 指到 per-CPU irq stack 顶端，调用 `handle_arch_irq`，返回后用 FP 把 SP 接回来。`pt_regs` 始终留在任务栈，`regs` 只是指针被带上 IRQ 栈。

硬件已经让代码执行在任务内核栈(SP_EL1)，为什么 kernel_ventry 不立刻再改到 IRQ 栈，而要先在任务栈上建完 pt_regs，等进了 C 才把 handler 放到 IRQ 栈上跑？

1. 硬中断单独一个栈，而且在硬中断处理完了之后，有一个内核设计的安全调度点，而调度必须发生在内核任务栈上。

```496:507:arch/arm64/kernel/entry-common.c
static __always_inline void __el1_irq(...)
{
	enter_from_kernel_mode(regs);
	irq_enter_rcu();
	do_interrupt_handler(regs, handler);   /* 切过 IRQ 栈的，返回时已回来 */
	irq_exit_rcu();
	arm64_preempt_schedule_irq();          /* 调用点不保证在任务栈上 */
	exit_to_kernel_mode(regs);
}
```

`arm64_preempt_schedule_irq()` 即可以在内核任务栈上被调用，也可以在软中断的 IRQ 栈上被调用。`schedule` 要切的是被打断任务的内核栈，不能在 per-CPU IRQ 栈上换任务。

---

## 5. EL0 IRQ 和 EL1 IRQ 的调用栈不一样

两个 C 入口共享 `do_interrupt_handler`，调用栈不同：

```text
EL0 IRQ（用户态被打断）
  用户栈 --硬件--> 任务内核栈 --kernel_entry--> SP_EL0=current
       --on_thread_stack--> IRQ 栈 --handler 完--> 任务栈
       --exit_to_user_mode / ret_to_user--> 写回用户 SP，eret

EL1 IRQ（内核态被打断）
  若当时在任务栈：任务栈 --call_on_irq_stack--> IRQ 栈 --> 回任务栈
                  --> arm64_preempt_schedule_irq() 可能 schedule
  若当时已在 IRQ 栈：不再切，直接 handler（嵌套）
```

| | `el0_interrupt` | `el1_interrupt` → `__el1_irq` |
|---|---|---|
| 硬件换栈 | 用户栈 → 任务内核栈 | 多数时候已在内核栈 |
| `kernel_entry` | 保存用户 SP，劫持 `SP_EL0` | 保存被打断的内核 SP |
| 上 IRQ 栈 | 几乎总会（刚从用户来，必在 thread stack） | 仅当 `on_thread_stack()` |
| 返回后抢占 | `exit_to_user_mode` 里看 `need_resched` | `do_interrupt_handler` 之后显式 `preempt_schedule_irq` |

同步异常（SVC、缺页）走 `el0_sync_handler` / `el1_sync_handler`，**不会**调用 `do_interrupt_handler`，因此不上 IRQ 栈。

---

## 6. 调度换栈

`cpu_switch_to(prev, next)`：

```825:845:arch/arm64/kernel/entry.S
	mov	x9, sp
	stp	x19, x20, [x8], #16		// 存 prev 的 callee-saved + sp
	...
	mov	sp, x9				// 换成 next 的内核栈
	msr	sp_el0, x1			// current = next
```

和中断切 IRQ 栈的差别：

| | 硬中断 `call_on_irq_stack` | 调度 `cpu_switch_to` |
|---|---|---|
| 换到哪 | 本 CPU 的 IRQ 栈 | **另一个任务**的内核栈 |
| `current` / `SP_EL0` | 不变 | 改成 next |
| `pt_regs` | 仍在被打断任务的栈上 | 各任务各有一份，在各自栈顶附近 |

中断里切 IRQ 栈 **不会**换进程；只有 `schedule` 走到 `cpu_switch_to` 才换。IRQ 栈上绝对不要 `schedule`——这也是第 4 节抢占必须回到任务栈的原因。

---

## 附录 A：源码索引

| 主题 | 位置 |
|------|------|
| 向量槽 | `arch/arm64/kernel/entry.S` `kernel_ventry` |
| 铺 `pt_regs`、劫持 `SP_EL0` | 同文件 `kernel_entry` / `kernel_exit` |
| `el0t_64_irq` → C | 同文件 `entry_handler` |
| `current` | `arch/arm64/include/asm/current.h` |
| EL0/EL1 IRQ C 入口 | `arch/arm64/kernel/entry-common.c` `el0_interrupt`、`el1_interrupt`、`__el1_irq` |
| 是否上 IRQ 栈 | 同文件 `do_interrupt_handler` |
| `on_thread_stack` | `arch/arm64/include/asm/stacktrace.h` |
| `call_on_irq_stack` | `arch/arm64/kernel/entry.S` |
| 任务切换 | 同文件 `cpu_switch_to` |
| 栈尺寸 / 对齐 | `arch/arm64/include/asm/memory.h` `THREAD_SIZE`、`THREAD_ALIGN`、`IRQ_STACK_SIZE` |
| IRQ 栈分配 | `arch/arm64/kernel/irq.c` `init_irq_stacks` |

---

## 附录 B：要点速记

1. Linux EL1 用 `SP_EL1` 当栈；`SP_EL0` 在内核里是 `current`，不是内核任务栈。
2. 从 EL0 进异常：硬件换到任务内核栈 → `kernel_entry` 保存用户 SP 并劫持 `SP_EL0`。
3. 只有 IRQ/FIQ 才可能上 per-CPU IRQ 栈；syscall / 缺页不上。
4. `on_thread_stack()` 为真才 `call_on_irq_stack`；嵌套中断不切。
5. `pt_regs` 始终在任务栈；抢占 / `schedule` 也必须在任务栈。
6. `cpu_switch_to` 换的是另一个 **任务**内核栈，并更新 `SP_EL0`；和 IRQ 栈无关。

一张时间线：

```text
用户栈 ──硬件 SPSel──► 任务内核栈 ──硬中断──► IRQ 栈
                ▲                         │
                └──── handler 返回 / 抢占 ─┘
                        │
                   cpu_switch_to → 另一个任务的内核栈
```
