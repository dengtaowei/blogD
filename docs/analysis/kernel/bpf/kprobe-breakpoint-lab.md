---
homeTag: BPF · kprobe
homeDesc: ARM32 经典 undef 断点改码实测（对照 ftrace 路径）。
sidebarOrder: 30
sidebarTitle: 经典 kprobe 实测
---

# 经典 kprobe 插桩实测（ARM32 / 非 ftrace）

> STM32MP157 · **Linux 5.4**（`CONFIG_KPROBES=y`，**无** `CONFIG_KPROBES_ON_FTRACE`）· `arch/arm/probes/kprobes/`  
> **Linux 内核 · BPF / kprobe**  
> 对照 [kprobe-on-ftrace 插桩实测](/analysis/kernel/bpf/kprobe-on-ftrace-lab)：本实验走 **undef 断点**，不是入口 NOP↔CALL。原理主文见 [eBPF kprobe 路径](/analysis/kernel/bpf/ebpf-kprobe-load-attach)。

配套源码：

- 博客仓库副本：[`code/kprobe-brk-demo/`](https://github.com/dengtaowei/blogD/tree/main/code/kprobe-brk-demo)

---

## 目录

1. [要验证什么](#1-要验证什么)
2. [板子配置](#2-板子配置)
3. [编译与运行](#3-编译与运行)
4. [实测打印](#4-实测打印)
5. [命中路径](#5-命中路径)
6. [和 ftrace 路径对照](#6-和-ftrace-路径对照)

---

## 1. 要验证什么

在 **没有** `CONFIG_KPROBES_ON_FTRACE` 的 ARM32 上，`register_kprobe()` 对函数入口会：

```text
挂接前 : 原指令（本例 kfree 入口为 movw，word=0xe30d3a98）
挂接后 : 保留条件码的 undef 指令 0xe7f001f8
         （KPROBE_ARM_BREAKPOINT_INSTRUCTION | 条件位）
拆钩后 : 写回原指令
```

ARM 不用真实 breakpoint 进 SVC（会丢 LR），改用 **专门留给 kprobe 的 undefined instruction**（见 `arch/arm/probes/kprobes/actions-arm.c` 注释）。

---

## 2. 板子配置

```text
CONFIG_KPROBES=y
CONFIG_OPTPROBES=y
CONFIG_KPROBE_EVENTS=y
# CONFIG_KPROBES_ON_FTRACE  — ARM32 通常无此选项
```

建议实测时关掉优化，否则入口很快被改成 `B`（optprobe），不好对照「断点」形态：

```bash
echo 0 > /proc/sys/debug/kprobes-optimization
```

---

## 3. 编译与运行

```bash
cd stm32mp157/kmodules/kprobe_brk_demo   # 或 blogD/code/kprobe-brk-demo
make
adb push kprobe_brk_demo.ko /tmp/
adb shell
echo 0 > /proc/sys/debug/kprobes-optimization
insmod /tmp/kprobe_brk_demo.ko           # 默认 symbol=kfree
# 等约 1s，看 HIT
rmmod kprobe_brk_demo
dmesg | grep kprobe_brk
```

换符号：

```bash
insmod /tmp/kprobe_brk_demo.ko symbol=schedule
```

---

## 4. 实测打印

环境：STM32MP157，内核 `5.4.31`，`symbol=kfree`，`kprobes-optimization=0`。

```text
kprobe_brk: === init (classic ARM kprobe, no ftrace) ===
kprobe_brk: target symbol='kfree' -> kfree+0x0/0x2fc (c02b8c00)
kprobe_brk: expect undef breakpoint (NOT KPROBE_FLAG_FTRACE)
kprobe_brk: BEFORE register_kprobe           kfree+0x0/0x2fc
kprobe_brk:   addr=c02b8c00  bytes: 98 3a 0d e3 2b 31 4c e3 f0 43 2d e9 0e 60 a0 e1
kprobe_brk:   -> original / other insn word=0xe30d3a98
kprobe_brk: AFTER register_kprobe            kfree+0x0/0x2fc
kprobe_brk:   addr=c02b8c00  bytes: f8 01 f0 e7 2b 31 4c e3 f0 43 2d e9 0e 60 a0 e1
kprobe_brk:   -> ARM undef breakpoint 0xe7f001f8 (classic kprobe LIVE)
kprobe_brk: OK - FTRACE flag clear (classic path)
kprobe_brk: HIT #1 at kfree+0x0/0x2fc pc=c02b8c00
kprobe_brk:   preempt_count=0x0 in_irq=0 in_softirq=0
kprobe_brk:   current=sh pid=903
kprobe_brk: === exit (hits=30) ===
kprobe_brk: BEFORE unregister_kprobe         kfree+0x0/0x2fc
kprobe_brk:   addr=c02b8c00  bytes: f8 01 f0 e7 ...
kprobe_brk:   -> ARM undef breakpoint 0xe7f001f8 (classic kprobe LIVE)
kprobe_brk: AFTER unregister_kprobe          kfree+0x0/0x2fc
kprobe_brk:   addr=c02b8c00  bytes: 98 3a 0d e3 ...
kprobe_brk:   -> original / other insn word=0xe30d3a98
kprobe_brk: unloaded
```

要点：

| 阶段 | 入口 word | 含义 |
|------|-----------|------|
| 挂接前 | `0xe30d3a98` | 原指令（LE 字节 `98 3a 0d e3`） |
| 挂接后 | `0xe7f001f8` | undef 断点（LE `f8 01 f0 e7`） |
| `kprobe_ftrace(&kp)` | false | **不是** ftrace 路径 |
| 拆钩后 | `0xe30d3a98` | 恢复 |

若未关优化，挂接后不久可能变成 `B`（`0xea……`，OPTPROBE）；拆钩前应用 `kprobes-optimization=0` 便于观察断点本体。

---

## 5. 命中路径

内核态（SVC）命中入口 undef 时，异常入口到本模块钩子大致如下（Linux 5.4 / `arch/arm`）：

```text
硬件 Undef 向量
  vector_stub und                    arch/arm/kernel/entry-armv.S
    __und_svc                        建 pt_regs / 切回 SVC 栈
      call_fpe                       先给 FPU/协处理器试一下（kprobe 通常不是）
      __und_fault                    把 PC 拨回 faulting insn
        do_undefinstr                arch/arm/kernel/traps.c
          call_undef_hook            按 instr/cpsr 匹配 undef_hook 链表
            kprobe_trap_handler      arch/arm/probes/kprobes/core.c
              kprobe_handler
                p->pre_handler()     ← 本模块 demo_pre_handler
                  或 aggr_pre_handler → 各 kp->pre_handler
                    （eBPF：再进 kprobe_dispatcher → kprobe_perf_func
                      → trace_call_bpf → BPF_PROG_RUN）
                singlestep(...)      跑/仿真原指令
            （hook 返回 0 → do_undefinstr 直接 return，不当 SIGILL）
      __und_svc_finish
        svc_exit                     从异常返回，继续执行
```

| 层级 | 符号 | 作用 |
|------|------|------|
| 向量 | `vector_stub und` | Undef 模式入口 |
| 汇编 | `__und_svc` → `__und_fault` | 存寄存器、修正 PC |
| C | `do_undefinstr` | 读出 fault 指令 |
| 分发 | `call_undef_hook` | 命中 `kprobes_arm_break_hook`（与 `0xe7f001f8` 掩码匹配） |
| kprobe | `kprobe_trap_handler` → `kprobe_handler` | 查表、调 `pre_handler`、单步 |
| 钩子 | `demo_pre_handler` / eBPF | 本实验计数；eBPF 再往下到 `trace_call_bpf` |

注册时挂上的 hook（`arch/arm/probes/kprobes/core.c`）：

```c
static struct undef_hook kprobes_arm_break_hook = {
	.instr_mask	= 0x0fffffff,
	.instr_val	= KPROBE_ARM_BREAKPOINT_INSTRUCTION,
	.cpsr_mask	= MODE_MASK,
	.cpsr_val	= SVC_MODE,
	.fn		= kprobe_trap_handler,
};
```

和 eBPF 的关系：libbpf `SEC("kprobe/…")` 最终也是 `register_kprobe()`；在本板上同样走这条 **undef** 路径。之后若经 perf/trace 绑定，才会 `trace_call_bpf`。

---

## 6. 和 ftrace 路径对照

| | [kprobe-on-ftrace](/analysis/kernel/bpf/kprobe-on-ftrace-lab)（x86 Ubuntu） | 本实验（ARM32 STM32MP157） |
|--|--|--|
| 配置 | `KPROBES_ON_FTRACE=y` | 无该选项 |
| 空闲入口 | 5 字节 NOP | 普通函数序言 |
| 挂接后 | `CALL` → ftrace trampoline | undef `0xe7f001f8` |
| `KPROBE_FLAG_FTRACE` | 置位 | **清** |
| 命中入口 | `kprobe_ftrace_handler` | undef → `kprobe_handler` |

两种不同实现方式的优缺点：

- **ftrace 路径**：挂接是入口 NOP↔CALL，走统一 trampoline，热路径上通常比每次异常进内核更轻；但依赖 `KPROBES_ON_FTRACE` / fentry 垫片，且主要覆盖**函数入口**，不是任意指令地址。
- **经典 undef / breakpoint 路径**：不依赖 ftrace 垫片，ARM32 等平台上可用，也能挂到入口以外的指令；代价是每次命中都要走异常（Undef / INT3）→ 存 `pt_regs` → 再单步或仿真原指令，开销和复杂度都更高。
- 上层 API 都是 `register_kprobe()` / eBPF `kprobe`；选哪条由架构与配置决定。

