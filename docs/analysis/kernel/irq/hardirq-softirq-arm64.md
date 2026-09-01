---
date: 2026-08-31
homeTag: 内核 · 中断
homeTitle: 硬中断、softirq 与 arm64 路径
homeDesc: 从 EL0 IRQ 到 irq_exit、softirq、ksoftirqd；栈与上下文、BH 与加锁配对
sidebarOrder: 10
sidebarTitle: 硬中断与 softirq
---

# 硬中断、softirq 与 arm64 路径

> Linux 6.8 · arm64 · `arch/arm64/kernel/entry-common.c` / `kernel/softirq.c`  
> **Linux 内核 · 中断 / softirq**  
> 把硬中断、软中断、栈、上下文、系统调用与加锁串成一条线。

---

## 目录

- [1. 先分清几个概念](#1-先分清几个概念)
- [2. arm64 上有哪些栈](#2-arm64-上有哪些栈)
- [3. 硬中断处理流程（arm64 / 6.8）](#3-硬中断处理流程arm64--68)
- [4. 软中断：从 pending 到执行](#4-软中断从-pending-到执行)
- [5. 同栈嵌套：硬中断打断软中断之后怎么回去](#5-同栈嵌套硬中断打断软中断之后怎么回去)
- [6. 系统调用（SVC）和中断不是一条路](#6-系统调用svc和中断不是一条路)
- [7. 网络协议栈和 softirq](#7-网络协议栈和-softirq)
- [8. 不同上下文之间如何加锁](#8-不同上下文之间如何加锁)
- [9. 一张总图（EL0 来了一次设备中断）](#9-一张总图el0-来了一次设备中断)
- [附录 A：源码索引](#附录-a源码索引)
- [附录 B：要点速记](#附录-b要点速记)

---

## 1. 先分清几个概念

### 1.1 硬中断 vs 软中断

| | 硬中断 | 软中断（softirq） |
|--|--------|-------------------|
| 谁触发 | 硬件（网卡、定时器、GIC 等） | **软件**置位 pending，再找机会执行 |
| 本质 | CPU 异常向量进来 | 内核自己的「延迟执行」机制 |
| 典型工作 | 尽快应答硬件、清状态、标记后续工作 | 网络收包下半部、tasklet、定时器软中断等 |

「中断下半部」是更宽的说法：硬中断里做完紧急事后，**延后做**的那部分。  
softirq 是下半部的一种；还有 tasklet（建在 softirq 上）、workqueue、threaded IRQ 等。  
所以：**softirq 是下半部，下半部不等于只有 softirq。**

### 1.2 「上下文」不等于「栈」

- **栈**：SP 指向哪块内存（用户栈 / 线程内核栈 / IRQ 栈）。
- **上下文**：当前处在什么执行状态，主要看 `preempt_count`（例如是否在硬中断/软中断里、能不能睡、能不能调度）。

反例：softirq 既可以在 IRQ 栈上跑，也可以在 `ksoftirqd` 的线程内核栈上跑；只要还在处理 softirq，上下文仍是软中断上下文。

**疑问：跑在 `ksoftirqd` 上时已经在线程栈上了，为什么 softirq 还是不能睡眠？**  
栈在线程上 ≠ 当前处在可睡眠的进程上下文。`ksoftirqd` 一进 softirq 处理就会抬高 softirq 相关的 `preempt_count`，此时 `in_serving_softirq()` 为真。

### 1.3 软中断并不能「像硬件一样」打断线程

能异步打断正在跑的线程的只有**硬中断**。

softirq 拿到 CPU 的常见方式：

1. 硬中断返回路径里（`irq_exit`）顺带跑；
2. 内核执行到开 BH 等检查点时主动跑；
3. 唤醒本 CPU 的 `ksoftirqd`，靠调度器跑起来。

用户态 `while (1) i++` **挡不住** softirq：定时器 tick 等硬中断照样能进，`irq_exit` 里仍可跑 softirq。

### 1.4 那 `local_bh_disable` 还有什么意义？

疑惑：既然 softirq 不能自己异步打断进程，为什么进程上下文里还要 `local_bh_disable()`？

因为 softirq **会搭硬中断的便车插进来**。进程在内核里只要本地中断是开的，就可能发生：

```text
进程上下文（例如已 spin_lock，锁也会被 softirq 用）
  → 硬中断进来（上半部）
  → irq_exit → 跑 softirq → 再抢同一把锁
  → 死锁
```

对这段临界区来说，效果就像 softirq「插进」了进程上下文代码之间。  
`local_bh_disable()` / `spin_lock_bh()` 的作用是：**在本 CPU 上暂时推迟 softirq**，等临界区结束（`local_bh_enable`）再跑。

| 情况 | `local_bh_disable` 之后 |
|------|-------------------------|
| 本 CPU 硬中断上半部 | 一般仍可进 |
| 本 CPU `irq_exit` 里跑 softirq | **先不跑** |
| 本 CPU 进程路径里主动跑 softirq | 也会被挡住 |
| 其他 CPU 上的 softirq | **不管**（所以叫 local） |

并不矛盾：

- softirq **没有**独立的异步打断能力；
- 但仍必须用 `local_bh_disable` 防它借硬中断返回路径，和进程上下文抢同一份数据。

`local_bh_disable` **只管本 CPU**；其它 CPU 上的进程/softirq 仍可能碰同一份数据，跨核还要自旋锁。完整配对见 [§8](#8-不同上下文之间如何加锁)。

---

## 2. arm64 上有哪些栈

每个用户态线程（每个 `task_struct`）有一份**内核栈**（`THREAD_SIZE`）。  
另外每个 CPU 还有一份 **IRQ 栈**（`IRQ_STACK_SIZE == THREAD_SIZE`，见 `arch/arm64/include/asm/memory.h`）。

| 栈 | 谁用 |
|----|------|
| 用户态栈 | 应用自己跑的时候 |
| 线程的内核栈 | 该线程陷入内核后（系统调用、异常入口建 `pt_regs` 等） |
| per-CPU IRQ 栈 | 硬中断处理；6.8 上 arm64 的 softirq 也常切到这里跑 |

从用户态陷入时：硬件自动改用 `SP_EL1`（内核栈），用户栈留在 `SP_EL0`。  
保存现场在 `arch/arm64/kernel/entry.S` 的 `kernel_entry`（`el == 0`）：通用寄存器、`elr`/`spsr`、用户 SP 等写入内核栈上的 `pt_regs`。切栈时间线见 [ARM64 异常路径上的栈切换](/analysis/kernel/irq/arm64-stack-switch)。

---

## 3. 硬中断处理流程（arm64 / 6.8）

### 3.1 从哪一层被打断

硬中断可能打断**用户态**或**内核态**：

| 被打断时 | 入口 |
|----------|------|
| 用户态（EL0） | `el0_interrupt` |
| 内核态（EL1） | `__el1_irq` / `el1_interrupt` |

代码：`arch/arm64/kernel/entry-common.c`。

中间都是同一套：`do_interrupt_handler` → `handle_arch_irq`（通常是 GIC 的 `gic_handle_irq`）。

### 3.2 6.8 里在哪里标记「进入 / 离开硬中断」

进入硬中断前后，内核要维护一批状态，例如：

- 给 `preempt_count` 加上/减去硬中断计数（这样才知道现在算不算硬中断上下文）
- lockdep、RCU、tick 等相关处理
- 离开时若有 pending softirq，再决定要不要跑 softirq

6.8 的 arm64 把这件事放在架构入口里统一做：

```text
el0_interrupt / __el1_irq
  → irq_enter_rcu()    // 标记：进入硬中断
  → do_interrupt_handler(...)
  → irq_exit_rcu()     // 标记：离开硬中断；这里可能转入 softirq
```

GIC 侧：`drivers/irqchip/irq-gic-v3.c` 里 `gic_handle_irq` → `generic_handle_domain_irq(...)` 找到具体设备的 handler。

### 3.3 何时切到 IRQ 栈

`do_interrupt_handler()`：

```c
if (on_thread_stack())
    call_on_irq_stack(regs, handler);  // 从线程栈切过去
else
    handler(regs);                     // 已在 IRQ 栈上则直接嵌套
```

`call_on_irq_stack` 在 `arch/arm64/kernel/entry.S`：

1. 在线程内核栈上保存 FP/LR；
2. `SP` 换到本 CPU IRQ 栈顶，调用 handler；
3. handler（以及其中触发的 softirq，见下）返回后，`mov sp, x29` **切回线程内核栈**，再 `ret`。

注意：`on_thread_stack()` 判断的是「当前是不是在**任务的内核栈**上」（相对 IRQ 栈），**不是**用户态栈。  
从用户态被硬中断打断后，硬件一陷入就改用 `SP_EL1`（该任务内核栈），用户栈留在 `SP_EL0`，内核代码不会继续跑在用户栈上。

以从用户态（EL0）进来的一次硬中断为例，SP 大致经历：

| 阶段 | SP 在哪 |
|------|---------|
| 打断前 | 用户态栈 |
| 异常入口 ～ `call_on_irq_stack` 之前（含 `on_thread_stack()`） | **该线程的内核栈** |
| handler / 多数 softirq | IRQ 栈 |
| `call_on_irq_stack` 返回后 | 又回到该线程的内核栈 |
| `eret` 之后 | 用户态栈 |

因此：进 `call_on_irq_stack` 前、返回后，都在**该任务的内核栈**上；用户栈要等最后 `eret` 才恢复。

### 3.4 硬中断期间通常不再嵌套普通硬中断

IRQ 入口会保持本地 IRQ 屏蔽（如 `DAIF_PROCCTX_NOIRQ`），所以同一 CPU 上普通硬中断一般不互相嵌套。

---

## 4. 软中断：从 pending 到执行

### 4.1 pending 从哪来

硬中断 pending 来自中断控制器寄存器。  
softirq pending 是**软件维护的 per-CPU 位图**（`irq_stat.__softirq_pending`）：

- `raise_softirq()` / `__raise_softirq_irqoff(nr)` → `or_softirq_pending(1UL << nr)`
- 例如网卡路径 raise `NET_RX_SOFTIRQ`，定时器 raise `TIMER_SOFTIRQ`

读：`local_softirq_pending()`。  
跑之前常先 `set_softirq_pending(0)`，再开中断执行各个 `action`。

### 4.2 硬中断结束后谁去跑 softirq

`kernel/softirq.c` 里 `__irq_exit_rcu()`：

```c
preempt_count_sub(HARDIRQ_OFFSET);
if (!in_interrupt() && local_softirq_pending())
    invoke_softirq();
```

要点：

- 刚结束的是硬中断；若此时**已经在 softirq 里**（`in_interrupt()` 仍真），不会再套一层 softirq。
- tick 末尾同样走 `irq_exit`，所以也会跑 pending 的 softirq（包括刚 raise 的 timer softirq）。

### 4.3 `invoke_softirq` 怎么选路径（非 RT）

简化逻辑：

- 若强制中断线程化等条件满足 → 只 `wakeup_softirqd()`；
- 否则当场执行 softirq：
  - 若架构声明「`irq_exit` 已在 IRQ 栈上」→ 直接 `__do_softirq()`；
  - 否则 → `do_softirq_own_stack()`。

**6.8 的 arm64** 选了 `HAVE_SOFTIRQ_ON_OWN_STACK`，实现是：

```c
// arch/arm64/kernel/irq.c
void do_softirq_own_stack(void)
{
    call_on_irq_stack(NULL, ____do_softirq);  // 里面对 __do_softirq()
}
```

因此：从线程栈上的 `irq_exit` 转 softirq 时，会再保证在 IRQ 栈上跑 softirq（若已经在 IRQ 栈上，`call_on_irq_stack` 的外层逻辑仍按「当前是否在线程栈」处理；硬中断路径里通常已在 IRQ 栈上执行完 handler 再 `irq_exit`）。

实际阅读时抓住两点即可：

1. softirq **优先跟在硬中断返回路径**执行；
2. arm64 6.8 明确用 IRQ 栈承载 softirq，减轻把进程内核栈撑爆的风险。

### 4.4 `__do_softirq` / `handle_softirqs` 在干什么

1. 取出 pending 位图，进入 softirq（抬高 `preempt_count` 里的 softirq 计数）；
2. **开中断**（`local_irq_enable`），所以 softirq 跑的时候**可以被硬中断打断**；
3. 按位调用 `softirq_vec[].action`；
4. 再关中断，看还有没有新的 pending：
   - 未超时、不需要调度、轮数未用尽 → 再跑一轮；
   - 否则 `wakeup_softirqd()`，把剩余工作交给 `ksoftirqd`。

预算大约：最多约 2ms、最多 restart 10 次（`MAX_SOFTIRQ_TIME` / `MAX_SOFTIRQ_RESTART`）。

### 4.5 `ksoftirqd` 是什么

每个 CPU 一个内核线程（如 `ksoftirqd/0`）。  
当场 softirq 太重或策略要求线程化时，只唤醒它，稍后在**该线程自己的内核栈**上消化 pending。

`wake_up_process(ksoftirqd)` **只是把线程标成可运行然后返回**，不会在这里立刻切过去：当时多半还在硬中断/softirq 路径里，`preempt_count != 0`，不可抢占。等这段路径把计数降回 0、又变成 `preemptible()`，若已有 `need_resched`，可抢占内核会在中断返回、`preempt_enable` 一类边界切走；非抢占内核则更常拖到主动 `schedule` / 回用户态等处。

交给 `ksoftirqd` **不会**让后面的硬中断都改到线程栈上跑：硬中断路径不变；变的只是「积压的 softirq 由谁、在哪条栈上消化」。

再次强调：在 `ksoftirqd` 里执行 softirq `action` 时仍是软中断上下文，**不能睡眠**；只是换了栈和调度载体，规则没变。详见 [§1.2](#12-上下文不等于栈)。

---

## 5. 同栈嵌套：硬中断打断软中断之后怎么回去

softirq 开着中断时，tick 等硬中断可以进来。

若当时已在 IRQ 栈上：

- `on_thread_stack()` 为假 → **不再** `call_on_irq_stack`；
- 硬中断在同一条 IRQ 栈上再往下压栈帧；
- 硬中断返回靠异常返回（`eret` 等）恢复 SP/PC → softirq 从打断点继续。

这是「硬中断嵌在软中断上面」，**不是**「硬中断再嵌硬中断」。  
硬中断返回时若 softirq 计数还在，`irq_exit` 不会再 `invoke_softirq`。

**线程能不能在 softirq 中间被调度上来？**  
即使开了内核抢占（`CONFIG_PREEMPT` 等），也不行。抢占条件是 `preemptible()`：`preempt_count == 0` 且本地 IRQ 开着。softirq 期间计数里带着 softirq 位，不可抢占；tick 返回后仍回到 softirq。  
等 softirq 整段结束、计数清掉，才可能按 `need_resched` 切走——可抢占内核不必非等到回用户态，在重新变得可抢占的边界就可以切。

防栈打穿主要靠：

- 限制嵌套形态（softirq + 至多一层普通硬中断）；
- 独立 IRQ 栈；
- softirq 超时/轮数上限 → 卸到 `ksoftirqd`；
- handler 自身保持调用链浅；必要时还有 guard page 等检测。

---

## 6. 系统调用（SVC）和中断不是一条路

用户态 `svc` 触发的是 **EL0→EL1 同步异常**，走 sync 向量，不是 IRQ 向量。

链路（AArch64）：

```text
vectors → el0t_64_sync
       → el0t_64_sync_handler()    // entry-common.c
            ESR == SVC64
       → el0_svc()
       → do_el0_svc() → el0_svc_common() → 查 sys_call_table
```

6.8 里在 `el0_svc()` 中：

```c
enter_from_user_mode(regs);
...
local_daif_restore(DAIF_PROCCTX);  // 在这里开普通硬中断
do_el0_svc(regs);
exit_to_user_mode(regs);
```

因此：

- **进入 `el0_svc` 之前**（向量入口、`kernel_entry`、按 ESR 分发）：本地 IRQ 仍关，普通硬中断打不进来；
- **`local_daif_restore` 之后**跑具体系统调用：可以被硬中断打断。

很多同步异常（缺页等）也会在处理过程中开中断；硬中断 handler 本身通常保持关中断。

---

## 7. 网络协议栈和 softirq

收包经典路径：硬中断 → raise `NET_RX_SOFTIRQ` → `irq_exit` 里 `net_rx_action` / NAPI → 协议栈处理，**常在 softirq 上下文**。

但整条网络路径不全是 softirq：应用 `sendmsg`/`recvmsg`、不少发送路径在**进程上下文**。  
只能说：RX 下半部是协议栈很重要的 softirq 场景，不是「协议栈 = softirq」。

---

## 8. 不同上下文之间如何加锁

共享数据时，先分清**谁可能打断谁**，再选锁。softirq / 进程不能在持自旋锁时睡眠；要睡就把活放到 workqueue / 内核线程。

### 8.1 谁能打断谁（同 CPU）

| 正在跑的 | 谁能插进来 |
|----------|------------|
| 硬中断 | 普通硬中断一般不能再嵌套（本地 IRQ 关着） |
| softirq | **硬中断可以**（softirq 里通常开着 IRQ） |
| 进程 | 硬中断可以；其 `irq_exit` 还可能跑 softirq |

### 8.2 常用配对

| 共享双方 | 怎么加锁 |
|----------|----------|
| **进程 ↔ softirq** | 两边都用 `spin_lock_bh` / `spin_unlock_bh` |
| **softirq ↔ 硬中断** | softirq（及进程）侧：`spin_lock_irqsave`；硬中断里：`spin_lock` |
| **进程 ↔ 硬中断** | 进程侧：`spin_lock_irqsave`；硬中断里：`spin_lock` |

要点：

- `spin_lock_bh` = 本 CPU 关 BH + 自旋锁。防同核 softirq，也防其它核。
- **只有 `_bh` 挡不住硬中断。** 和硬中断共享必须 `_irq` / `_irqsave`。
- 硬中断里再加锁仍有意义：主要防**其它 CPU** 上的进程/softirq/硬中断，不是防同核硬中断嵌套。

示例（进程 ↔ softirq）：

```c
spin_lock_bh(&lock);
/* 访问共享数据，不能睡眠 */
spin_unlock_bh(&lock);
```

示例（与硬中断共享）：

```c
/* softirq 或进程 */
unsigned long flags;
spin_lock_irqsave(&lock, flags);
/* ... */
spin_unlock_irqrestore(&lock, flags);

/* 硬中断 handler */
spin_lock(&lock);
/* ... */
spin_unlock(&lock);
```

## 9. 一张总图（EL0 来了一次设备中断）

```text
用户态线程正在跑（用户栈）
  │ 硬件 IRQ
  ▼
异常入口：切到该线程的内核栈，kernel_entry 保存 pt_regs
  ▼
el0_interrupt
  irq_enter_rcu
  do_interrupt_handler
    └─ call_on_irq_stack → 切到 IRQ 栈
         gic_handle_irq → 设备 handler（上半部，可能 raise softirq）
    ← handler 返回（仍处于硬中断处理流程中，尚未 irq_exit）
  irq_exit_rcu
    └─ 若有 pending softirq → invoke_softirq
         └─（arm64 6.8）常在 IRQ 栈上 __do_softirq
              开中断跑 action；可被新的硬中断同栈嵌套打断，返回后继续
  exit_to_user_mode / ret_to_user / eret
  │
  ▼
回到用户态（或若 need_resched 则先调度）
```

若 softirq 太重：`wakeup_softirqd`，稍后在 `ksoftirqd` 线程栈上继续。

---

## 附录 A：源码索引

| 主题 | 路径 |
|------|------|
| 异常向量 / 切栈 / 保存用户上下文 | `arch/arm64/kernel/entry.S`（`kernel_entry`、`call_on_irq_stack`、`kernel_exit`） |
| EL0/EL1 IRQ、SVC 分发 | `arch/arm64/kernel/entry-common.c` |
| arm64 softirq 用 IRQ 栈 | `arch/arm64/kernel/irq.c`（`do_softirq_own_stack`） |
| softirq 核心 | `kernel/softirq.c` |
| GIC | `drivers/irqchip/irq-gic-v3.c` |
| 系统调用 | `arch/arm64/kernel/syscall.c` |
| `local_bh_disable` | `include/linux/bottom_half.h` |
| softirq pending | `include/asm-generic/hardirq.h`（`irq_stat.__softirq_pending`） |

---

## 附录 B：要点速记

1. softirq 是内核抽象的延迟执行层，不是第二种硬件中断。
2. 上下文看 `preempt_count`，栈看 SP；两者相关但不是一回事。`ksoftirqd` 上跑 softirq 仍不能睡。
3. 硬中断异步打断线程；softirq 搭硬中断返回的便车，或靠 `ksoftirqd` 被调度。
4. 正因为会搭 `irq_exit` 便车，进程上下文临界区才需要 `local_bh_disable` / `spin_lock_bh`。
5. 加锁：进程↔softirq 用 `_bh`；和硬中断共享用 `_irqsave`；硬中断里的锁主要为了多核。
6. arm64 用独立 IRQ 栈跑硬中断（6.8 上也明确用于 softirq），用 `call_on_irq_stack` 切去切回。
7. softirq 可被硬中断同栈嵌套打断，靠异常返回继续；线程调度要等 softirq 结束。
8. SVC 走同步异常；开中断点在 `el0_svc` 的 `local_daif_restore`，开之前普通硬中断进不来。
