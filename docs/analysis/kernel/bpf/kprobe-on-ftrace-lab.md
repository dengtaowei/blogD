---
homeTag: BPF · kprobe
homeDesc: 入口 NOP↔CALL、trampoline 与 handler 上下文实测。
sidebarOrder: 20
sidebarTitle: ftrace 插桩实测
date: 2026-07-30
---

# kprobe-on-ftrace 插桩实测

> Ubuntu HWE **Linux 5.15.0-139-generic**（`CONFIG_PREEMPT_VOLUNTARY`）· `arch/x86/kernel/kprobes/ftrace.c` + `ftrace_64.S`  
> **Linux 内核 · BPF / kprobe**  
> 用 out-of-tree 模块观察 usbtrace 同款 **kprobe-on-ftrace**（入口 NOP↔CALL）；原理主文见 [eBPF kprobe 路径](/analysis/kernel/bpf/ebpf-kprobe-load-attach)。

配套源码：[`code/kprobe-bytes-demo/`](https://github.com/dengtaowei/blogD/tree/main/code/kprobe-bytes-demo)。

---

## 目录

1. [要验证什么](#1-要验证什么)
2. [编译与运行](#2-编译与运行)
3. [模块源码](#3-模块源码)
4. [实测打印（load / unload）](#4-实测打印load--unload)
5. [实测打印（插拔 USB 触发 HIT）](#5-实测打印插拔-usb-触发-hit)
6. [CALL 进 trampoline 之后](#6-call-进-trampoline-之后还调谁)
7. [和 usbtrace 的对应关系](#7-和-usbtrace-的对应关系)
8. [总结](#8-总结)

---

## 1. 要验证什么

usbtrace / libbpf 的 `SEC("kprobe/<func>")` 在挂接阶段最终会走到
`register_kprobe()`。在开启 `CONFIG_KPROBES_ON_FTRACE` 的 Ubuntu 上，对
**普通函数入口（fentry）** 不会改成 `INT3`（`0xcc`），而是：

```text
空闲时 : 5 字节 NOP   0f 1f 44 00 00
挂接后 : 5 字节 CALL  e8 xx xx xx xx   → ftrace trampoline
              → kprobe_ftrace_handler → pre_handler
              （若再挂了 eBPF，才会 trace_call_bpf）
拆钩后 : 再变回 NOP
```

本模块**不加载 eBPF**，只注册 kprobe 并 dump 入口机器码，用来看清「改码」这一步。

本机相关配置：

```text
CONFIG_KPROBES=y
CONFIG_KPROBES_ON_FTRACE=y
CONFIG_OPTPROBES=y
CONFIG_FUNCTION_TRACER=y
```

---

## 2. 编译与运行

```bash
cd code/kprobe-bytes-demo
make
sudo insmod ./kprobe_bytes_demo.ko          # 默认 symbol=usb_set_configuration
sudo dmesg | grep kprobe_bytes
# 可选：插拔 USB，看 HIT
sudo rmmod kprobe_bytes_demo
sudo dmesg | grep kprobe_bytes | tail -30
```

换符号：

```bash
sudo insmod ./kprobe_bytes_demo.ko symbol=usb_submit_urb
```

---

## 3. 模块源码

当前默认探测符号为 `usb_set_configuration`。完整源码与 `Makefile` 在仓库：

[`code/kprobe-bytes-demo/`](https://github.com/dengtaowei/blogD/tree/main/code/kprobe-bytes-demo)
（本机路径：`code/kprobe-bytes-demo/`）。

要点：

- 只设 `kp.symbol_name`，**不要**同时设 `kp.addr`（否则 `_kprobe_addr()` 返回 `-EINVAL`）
- `dump_bytes`：挂接前后打印入口 16 字节，识别 NOP / `call rel32` / INT3
- `demo_pre_handler`：首次及每 64 次命中打印 preempt / IRQ / `current`

`Makefile`：对当前运行内核做 out-of-tree 编译（`KDIR=/lib/modules/$(uname -r)/build`）。

---

## 4. 实测打印（load / unload）

环境：Ubuntu，内核 `5.15.0-139-generic`，符号 `usb_set_configuration`。

```text
[37196.497884] kprobe_bytes: === init (usbtrace-style ftrace kprobe demo) ===
[37196.556571] kprobe_bytes: target symbol='usb_set_configuration' -> usb_set_configuration+0x0/0x980 (ffffffff9ef84110)
[37196.556593] kprobe_bytes: expect KPROBE_FLAG_FTRACE + NOP<->CALL on Ubuntu
[37196.556602] kprobe_bytes: BEFORE register_kprobe           usb_set_configuration+0x0/0x980
[37196.556612] kprobe_bytes:   addr=ffffffff9ef84110  bytes: 0f 1f 44 00 00 55 48 89 e5 41 57 41 56 41 55 49 
[37196.556617] kprobe_bytes:   -> 5-byte NOP (idle ftrace/fentry site)
[37196.575924] kprobe_bytes: AFTER register_kprobe            usb_set_configuration+0x0/0x980
[37196.575933] kprobe_bytes:   addr=ffffffff9ef84110  bytes: e8 eb 3e de 21 55 48 89 e5 41 57 41 56 41 55 49 
[37196.575935] kprobe_bytes:   -> CALL rel32 (ftrace site LIVE), rel=0x21de3eeb target≈ffffffffc0d68000
[37196.575937] kprobe_bytes: OK — FTRACE flag set (usbtrace-class hook on fentry)
[37196.575938] kprobe_bytes: not calling the target; real USB activity may HIT
[37196.575939] kprobe_bytes: rmmod to disarm and dump restored bytes
[37200.912455] kprobe_bytes: === exit (hits=0) ===
[37200.912459] kprobe_bytes: BEFORE unregister_kprobe         usb_set_configuration+0x0/0x980
[37200.912463] kprobe_bytes:   addr=ffffffff9ef84110  bytes: e8 eb 3e de 21 55 48 89 e5 41 57 41 56 41 55 49 
[37200.912464] kprobe_bytes:   -> CALL rel32 (ftrace site LIVE), rel=0x21de3eeb target≈ffffffffc0d68000
[37200.947440] kprobe_bytes: AFTER unregister_kprobe          usb_set_configuration+0x0/0x980
[37200.947467] kprobe_bytes:   addr=ffffffff9ef84110  bytes: 0f 1f 44 00 00 55 48 89 e5 41 57 41 56 41 55 49 
[37200.947475] kprobe_bytes:   -> 5-byte NOP (idle ftrace/fentry site)
[37200.947479] kprobe_bytes: unloaded
```

### 4.1 入口字节对照

| 阶段 | 入口 5 字节 | 含义 |
|------|-------------|------|
| BEFORE `register_kprobe` | `0f 1f 44 00 00` | 空闲 fentry（5 字节 NOP） |
| AFTER `register_kprobe` | `e8 eb 3e de 21` | **CALL rel32** → ftrace trampoline |
| BEFORE `unregister` | 同上 `e8…` | 钩子仍在 |
| AFTER `unregister` | `0f 1f 44 00 00` | 拆钩，恢复 NOP |

后面的 `55 48 89 e5 41 57…`（`push rbp; mov rbp,rsp; …`）始终不变——**只改入口那 5 字节**。

### 4.2 逐行分析（init）

| 日志 | 分析 |
|------|------|
| `target symbol='usb_set_configuration' -> …+0x0/0x980 (ffffffff9ef84110)` | 符号解析成功；`+0x0` 表示打在函数入口；`/0x980` 为符号大小约 0x980 字节 |
| `BEFORE … bytes: 0f 1f 44 00 00 55…` | 挂接前入口是标准 5 字节 NOP，后面才是函数序言 |
| `-> 5-byte NOP (idle ftrace/fentry site)` | 模块对字节模式的判定：当前是空闲 ftrace 位点 |
| `AFTER … bytes: e8 eb 3e de 21 55…` | 前 5 字节被 `ftrace_make_call` 写成相对调用 `call rel32` |
| `-> CALL rel32 … target≈ffffffffc0d68000` | 相对位移 `0x21de3eeb`；目标落在模块/trampoline 地址一带（`0xffffffffc0……`） |
| `OK — FTRACE flag set` | `KPROBE_FLAG_FTRACE` 已置位 → **kprobe-on-ftrace**，不是经典 `INT3` |
| `not calling the target…` | 模块不主动调用该函数，避免乱改 USB 配置 |

### 4.3 逐行分析（exit）

| 日志 | 分析 |
|------|------|
| `exit (hits=0)` | 本次从 insmod 到 rmmod 期间没有再次进入 `usb_set_configuration`（与另一次插拔实验的 HIT 不矛盾） |
| `BEFORE unregister … e8…` | 拆钩前仍是 CALL |
| `AFTER unregister … 0f 1f 44 00 00` | `disarm_kprobe_ftrace` 把位点改回 NOP，可逆 |

### 4.4 和经典 INT3 路径的对比

若目标是 `notrace`、无 fentry 的函数，会看到首字节变成 `0xcc`（`arch_arm_kprobe` → `text_poke(INT3)`）。  
本 demo 故意打在带 fentry 的内核符号上，所以应看到 **NOP↔CALL**，而不是 `0xcc`。

---

## 5. 实测打印（插拔 USB 触发 HIT）

模块保持加载时插入 FTDI（`0403:6001`）：

```text
[38639.073844] usb 1-3: USB disconnect, device number 6
...
[38641.018132] usb 1-3: new full-speed USB device number 7 using xhci_hcd
[38641.176758] usb 1-3: New USB device found, idVendor=0403, idProduct=6001, ...
[38641.177155] kprobe_bytes: HIT #1 at usb_set_configuration+0x0/0x980
[38641.177175] kprobe_bytes:   preempt_count=0x0 preemptible=0 in_atomic=0
[38641.177180] kprobe_bytes:   irqs_disabled=0 in_hardirq=0 in_softirq=0 in_nmi=0 in_task=1
[38641.177185] kprobe_bytes:   current=kworker/5:1 pid=64689
[38641.180738] ftdi_sio 1-3:1.0: FTDI USB Serial Device converter detected
...
[38641.182391] usb 1-3: FTDI USB Serial Device converter now attached to ttyUSB0
```

（上下文宏的详细解读见 **§6.5**。）

### 5.1 时序分析

```text
枚举 new device
  → 内核调用 usb_set_configuration()
  → 入口 CALL 进 ftrace trampoline
  → kprobe_ftrace_handler
  → demo_pre_handler  →  打印 HIT #1 at …+0x0（及 preempt/任务上下文）
  → 返回后继续原函数 / 驱动绑定
  → ftdi_sio 出现，挂上 ttyUSB0
```

| 点 | 含义 |
|----|------|
| `HIT #1 at …+0x0` | 命中的是**函数入口**，不是函数中间 |
| HIT 出现在 `ftdi_sio … detected` **之前** | 回调发生在设配置路径上，早于/交错于驱动 probe 日志 |
| `current=kworker/5:1` | 枚举工作在 kworker 线程上下文（`in_task=1`） |
| 与仅 load/unload、`hits=0` 的对比 | 那次卸载前没有插拔；有真实枚举才会 HIT |

---

## 6. CALL 进 trampoline 之后还调谁？

实测 AFTER 日志里有：

```text
bytes: e8 eb 3e de 21 ...
-> CALL rel32 ... target≈ffffffffc0d68000
```

这里要分清两层：**入口 `e8` 的直接目标**，和 **真正进到你回调的 C 函数**。

### 6.1 入口那条 CALL 直接落到哪？

`kprobe_ftrace_ops` 带 `FTRACE_OPS_FL_SAVE_REGS`：

```c
/* kernel/kprobes.c */
static struct ftrace_ops kprobe_ftrace_ops = {
	.func = kprobe_ftrace_handler,
	.flags = FTRACE_OPS_FL_SAVE_REGS,
};
```

`ftrace_make_call()` 写入的 CALL 目标是：

| 情况 | 直接目标 |
|------|----------|
| 全局 trampoline | `ftrace_regs_caller`（`arch/x86/kernel/ftrace_64.S`） |
| 为本 ops 分配了私有 trampoline（本次实测） | `ops->trampoline`：从 `ftrace_regs_caller` **拷贝出来的一份** |

`ffffffffc0d68000` 落在模块地址一带（`0xffffffffc0……`），说明这次用的是 **动态分配的 trampoline**，不是 vmlinux 里那个全局符号地址本身，但逻辑等价于跑 `ftrace_regs_caller` 那套汇编。

创建时（`arch/x86/kernel/ftrace.c`）会：

1. `copy_from_kernel_nofault` 拷贝 `ftrace_regs_caller` … `ftrace_regs_caller_end`
2. 在 trampoline 末尾存上指向该 `ftrace_ops` 的指针
3. 把拷贝里对应 **`ftrace_regs_call`** 的那条 call 改成调用 `ftrace_ops_get_func(ops)`

对 kprobe ops，`ftrace_ops_get_func()` 返回的就是 **`ops->func` = `kprobe_ftrace_handler`**。

### 6.2 进了 `ftrace_regs_caller` 之后再“跳”的地方

关键二次调用在这里（源码占位写成 stub，运行时改掉）：

```asm
/* arch/x86/kernel/ftrace_64.S — ftrace_regs_caller */
SYM_INNER_LABEL(ftrace_regs_call, SYM_L_GLOBAL)
	call ftrace_stub          /* 运行时被改成真正回调 */
	...
SYM_INNER_LABEL(ftrace_regs_caller_end, SYM_L_GLOBAL)
	jmp ftrace_epilogue       /* 回调返回后回到原函数路径 */
```

| 站点 | 源码里写什么 | 运行时实际 |
|------|--------------|------------|
| `ftrace_regs_call` | `call ftrace_stub` | **私有 trampoline**：`call kprobe_ftrace_handler`；**全局 caller**：常被 `ftrace_update_ftrace_func` 改成 `ftrace_ops_list_func`，再 `op->func` → `kprobe_ftrace_handler` |
| `ftrace_regs_caller_end` | `jmp ftrace_epilogue` | 收尾，返回被探针函数，不是去 handler |

私有 trampoline 改 call 的代码：

```c
/* arch/x86/kernel/ftrace.c — create trampoline */
memcpy(trampoline + call_offset,
       text_gen_insn(CALL_INSN_OPCODE,
                     trampoline + call_offset,
                     ftrace_ops_get_func(ops)), CALL_INSN_SIZE);
```

### 6.3 完整命中链（结合本 demo）

```text
usb_set_configuration 入口
  → e8 …  CALL  ops->trampoline / ftrace_regs_caller
       → 保存 pt_regs 等
       → call kprobe_ftrace_handler     ← ftrace_regs_call 改写后的目标
            （arch/x86/kernel/kprobes/ftrace.c）
            → get_kprobe(ip)
            → p->pre_handler
                 → demo_pre_handler 打印 HIT
                 （usbtrace：再进 eBPF / trace_call_bpf）
       → jmp ftrace_epilogue
  → 继续执行 usb_set_configuration 函数体
```

**一句话：** 入口 CALL 的是 **ftrace trampoline（`ftrace_regs_caller` 或其拷贝）**；进 trampoline 后再经 **`ftrace_regs_call` 那条 call** 进入 **`kprobe_ftrace_handler`**，然后才是你的 `pre_handler` / eBPF。

### 6.4 `pre_handler` 登记 vs 谁在循环调用

demo 里只有：

```c
static struct kprobe kp = {
	.pre_handler = demo_pre_handler,
};
```

这只是把回调**登记**进 `struct kprobe`，本身不会循环调用。命中后的调用在内核里：

**只有一个探针时（本 demo）：** `kprobe_ftrace_handler` 直接调一次：

```c
/* arch/x86/kernel/kprobes/ftrace.c */
p = get_kprobe((kprobe_opcode_t *)ip);
...
if (!p->pre_handler || !p->pre_handler(p, regs)) {
    /* … emulate step over 5-byte nop … */
}
```

即：`p->pre_handler` → `demo_pre_handler`，**没有 for 循环**。

**同一地址挂了多个 kprobe 时：** 第二次 `register_kprobe` 会 `register_aggr_kprobe`，表里变成 aggr manager，其 `pre_handler = aggr_pre_handler`，各个逻辑探针挂在 `list` 上。命中链变成：

```text
kprobe_ftrace_handler
  → p->pre_handler          // 实际是 aggr_pre_handler
       → list_for_each_entry_rcu(...)
            → 各 kp->pre_handler（demo / 其它工具 / …）
```

```c
/* kernel/kprobes.c */
static int aggr_pre_handler(struct kprobe *p, struct pt_regs *regs)
{
	struct kprobe *kp;

	list_for_each_entry_rcu(kp, &p->list, list) {
		if (kp->pre_handler && likely(!kprobe_disabled(kp))) {
			set_kprobe_instance(kp);
			if (kp->pre_handler(kp, regs))
				return 1;
		}
		reset_kprobe_instance();
	}
	return 0;
}
```

| 场景 | 谁在“循环” |
|------|------------|
| 仅本 demo 一个 kprobe | 无循环，直接 `demo_pre_handler` |
| 同地址多个 kprobe | **`aggr_pre_handler` 的 `list_for_each_entry_rcu`** |
| 经典 INT3 路径 | 同样：单探针直接调，多探针经 `aggr_pre_handler` |

经典 INT3 路径下，断点命中后最终也是调 `p->pre_handler`；多探针时同样是 `aggr_pre_handler` 做分发。

### 6.5 handler 运行上下文实测（抢占 / 原子 / 任务）

`kprobe_ftrace_handler` 注释写着 `called under preempt disabled`，函数里也有：

```c
preempt_disable_notrace();
...
preempt_enable_notrace();
```

demo 在 `demo_pre_handler` 里打印 `preempt_count` / `preemptible` / `in_atomic` / IRQ 标志 / `current`，插拔 FTDI 命中时实测（`5.15.0-139-generic`）：

```text
kprobe_bytes: HIT #1 at usb_set_configuration+0x0/0x980
kprobe_bytes:   preempt_count=0x0 preemptible=0 in_atomic=0
kprobe_bytes:   irqs_disabled=0 in_hardirq=0 in_softirq=0 in_nmi=0 in_task=1
kprobe_bytes:   current=kworker/5:1 pid=64689
```

#### 字段解读

| 字段 | 实测 | 含义 |
|------|------|------|
| `in_task=1` | 是 | **进程上下文**，不是硬中断/软中断顶半部 |
| `in_hardirq/softirq/nmi=0` | 是 | 与「从函数入口 ftrace 进来」一致 |
| `irqs_disabled=0` | 是 | 中断未关 |
| `current=kworker/5:1` | 是 | USB 枚举走在工作队列线程里 |
| `preempt_count=0` / `in_atomic=0` | 见下 | **不能**据此断言「观测到了关抢占」 |
| `preemptible=0` | 见下 | 在这套 config 上另有含义 |

#### 为何看不到「关抢占」？

本机配置为：

```text
CONFIG_PREEMPT_VOLUNTARY=y
# 无 CONFIG_PREEMPTION / CONFIG_PREEMPT_COUNT
```

在 **voluntary**、无 preempt count 的内核上：

| 宏/API | 行为 |
|--------|------|
| `preempt_disable_notrace()` | 基本是 **`barrier()`**，**不会**增加 `preempt_count` |
| `preempt_count()` | 恒为 **0** |
| `in_atomic()` | 恒为 **假** |
| `preemptible()` | 因 `!CONFIG_PREEMPTION` 被定义成 **恒为 0**（表示「不是 CONFIG_PREEMPT 那种可抢占内核」），**不是**「当前处在原子区」 |

因此日志里 `preempt_count=0`、`in_atomic=0`、`preemptible=0` **同时成立并不矛盾**：宏在这套 config 上**测不到** `preempt_disable` 的效果。

源码注释 `called under preempt disabled` 主要针对带 **`CONFIG_PREEMPT` / `CONFIG_PREEMPT_COUNT`** 的内核；在 Ubuntu generic（voluntary）上那对 disable/enable 对计数器几乎是空操作。

#### 仍应遵守的规则

1. 插桩与 HIT 路径仍然成立（FTRACE + `kworker` 进程上下文）。  
2. **即便 `in_atomic()==0`，kprobe/ftrace 回调里也不要 sleep**（约定与其它配置/路径；handler 应短小）。  
3. 若要「看见」关抢占，需在 **`CONFIG_PREEMPT=y`**（带 preempt count）的内核上再测。

---

## 7. 和 usbtrace 的对应关系

```text
usbtrace: SEC("kprobe/usb_…")
    → perf_event_open + BPF_LINK_CREATE
    → register_kprobe / arm_kprobe_ftrace
    → 入口 NOP 变成 CALL          ← 本 demo 用 dump 看见的部分
    → trampoline → kprobe_ftrace_handler
    → （usbtrace）再跑 eBPF + ringbuf
    → （本 demo）只跑 pre_handler 打 HIT
```

| usbtrace | 本 demo |
|----------|---------|
| libbpf attach | `register_kprobe(symbol_name=…)` |
| eBPF prog | `demo_pre_handler` 打日志 |
| 用户看不见改码 | `dump_bytes` 打印 NOP/CALL |

---

## 8. 总结

在 Ubuntu 5.15（`CONFIG_PREEMPT_VOLUNTARY`）上对 `usb_set_configuration`：

1. **挂接前**入口是 `0f 1f 44 00 00`（fentry NOP）  
2. **`register_kprobe` 后**变成 `e8 …`（CALL 进 ftrace trampoline），且 `KPROBE_FLAG_FTRACE`  
3. trampoline 内再 **`call kprobe_ftrace_handler`**（`ftrace_regs_call` 站点）  
4. **插 USB** 时 `pre_handler` 在入口命中；跑在 **`kworker` 进程上下文**（`in_task=1`）  
5. 本机 **测不到** `preempt_count` 上升（voluntary、无 preempt count）；注释里的「关抢占」在 `CONFIG_PREEMPT` 内核上才有可观测计数  
6. **`unregister_kprobe` 后**入口恢复为 NOP  

这就是 usbtrace 所用的 **kprobe-on-ftrace** 插桩形态；eBPF 是挂在 `kprobe_ftrace_handler` →（perf/trace 路径）之后的下一层。handler 里仍应保持短小、不要 sleep。
