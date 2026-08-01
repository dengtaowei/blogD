---
homeTag: BPF · kprobe
homeDesc: load / open / link / 命中，以及同函数多 BPF 的 aggr 分发。
sidebarOrder: 10
sidebarTitle: eBPF kprobe 路径
date: 2026-07-30
---

# eBPF kprobe：load / attach / 命中

> Ubuntu HWE **Linux 5.15**（与本站多数文章的 6.8 基准不同，文中路径以 5.15 为准）· `kernel/bpf` + `kernel/kprobes` + `kernel/trace`  
> **Linux 内核 · BPF / kprobe**  
> 以 usbtrace 的 `SEC("kprobe/…")` 为锚点，拆解 **load → 插桩 → attach → 命中执行**；续篇见 [kprobe-on-ftrace 插桩实测](/analysis/kernel/bpf/kprobe-on-ftrace-lab)。

配套实验模块：[code/kprobe-bytes-demo](https://github.com/dengtaowei/blogD/tree/main/code/kprobe-bytes-demo)（站内说明见续篇）。

---

## 目录

1. [总览：load ≠ attach ≠ 执行](#1-总览load--attach--执行)
2. [用户态到底传了什么](#2-用户态到底传了什么)
3. [`bpf_prog_load()`：装进内核](#3-bpf_prog_load装进内核)
4. [验证：`bpf_check()`](#4-验证bpf_check)
5. [JIT 与解释器](#5-jit-与解释器bpf_prog_select_runtime)
6. [prog 存在哪：`prog_idr`](#6-prog-存在哪prog_idr)
7. [真正挂钩：两步](#7-真正挂钩两步不是一次-syscall)
8. [命中之后：谁跑 eBPF](#8-命中之后谁跑-ebpf)
9. [同一函数挂多个 eBPF](#9-同一函数挂多个-ebpf如何分发)
10. [一句话记忆](#10-一句话记忆)

---
本文以 **usbtrace 的 kprobe 模块**（如 `power` 的
`SEC("kprobe/usb_autosuspend_device")`）为锚点，顺着 Ubuntu HWE **5.15**
内核源码，把「用户态一次 `sudo ./usbtrace power`」拆成内核里真实发生的
**load → 插桩 → attach → 命中执行** 四段。

对照树路径（本机常见布局）：

```text
linux-hwe-5.15-5.15.0/
  kernel/bpf/syscall.c      # bpf()：PROG_LOAD / LINK_CREATE
  kernel/bpf/verifier.c     # bpf_check()
  kernel/bpf/core.c         # JIT / 解释器选择
  kernel/trace/bpf_trace.c  # perf_event_attach_bpf_prog / trace_call_bpf
  kernel/trace/trace_kprobe.c
  kernel/trace/trace_event_perf.c
  kernel/kprobes.c          # register_kprobe / arm_kprobe
  kernel/events/core.c      # perf_event_set_bpf_prog
  include/uapi/linux/bpf.h  # bpf_attr / bpf_cmd
```

---

## 1. 总览：load ≠ attach ≠ 执行

```text
.bpf.c  ──clang──►  .bpf.o (ELF)
                      │
                   libbpf 拆 ELF
                      │
     ┌────────────────┼────────────────┐
     ▼                ▼                ▼
 bpf(MAP_CREATE)  bpf(BTF_LOAD)  bpf(PROG_LOAD)     ← 装进内核、验证、JIT
                                      │
                                      ▼  prog fd
                         perf_event_open(kprobe)    ← 在目标函数入口插桩
                                      │
                                      ▼  perf fd
                    bpf(BPF_LINK_CREATE)            ← 把 prog 绑到该探针
                      或 ioctl(SET_BPF)
                                      │
                                      ▼
                    内核调用目标函数 → kprobe 命中
                      → kprobe_dispatcher
                      → kprobe_perf_func
                      → trace_call_bpf → 跑 eBPF
                      → ringbuf → 用户态 poll
```

| 阶段 | 关键调用 | 内核入口 |
|------|----------|----------|
| 加载程序 | `bpf(BPF_PROG_LOAD)` | `bpf_prog_load()` |
| 函数入口插桩 | `perf_event_open` | `perf_kprobe_init` → `register_kprobe` |
| 绑定 eBPF | `bpf(BPF_LINK_CREATE)` | `link_create` → `bpf_perf_link_attach` |
| 命中执行 | （被动） | `kprobe_dispatcher` → `trace_call_bpf` |

---

## 2. 用户态到底传了什么

用户态 **不是** 把 `.bpf.c` 或整份 ELF 塞进内核，而是：

```c
bpf(BPF_PROG_LOAD, &attr, sizeof(attr));
```

`attr` 是 `union bpf_attr` 里 `BPF_PROG_LOAD` 那一组字段
（`include/uapi/linux/bpf.h`）：

| 字段 | 含义 |
|------|------|
| `prog_type` | 如 `BPF_PROG_TYPE_KPROBE` |
| `insn_cnt` / `insns` | 指令条数 + **指针** → `struct bpf_insn[]` |
| `license` | **指针** → `"GPL"` 等字符串 |
| `prog_name` | 程序名 |
| `prog_flags` | 对齐、`SLEEPABLE` 等 |
| `log_*` | verifier 日志缓冲（`-v` 时 libbpf 会开） |
| `prog_btf_fd` | 程序 BTF（CO-RE） |
| `func_info` / `line_info` | 调试信息 |
| `attach_btf_id` 等 | fentry 等场景；经典 kprobe 常不用 |

usbtrace 侧对应关系：

```text
power.bpf.c
  → clang -target bpf → power.bpf.o
  → libbpf 解析 ELF、先建 map/BTF
  → bpf(BPF_PROG_LOAD)：insns = 抽出的字节码，license = "GPL"
```

---

## 3. `bpf_prog_load()`：装进内核

文件：`kernel/bpf/syscall.c`，由 `bpf()` 的 `case BPF_PROG_LOAD` 调用。

### 3.1 函数开头的三个局部变量

```c
struct bpf_prog *prog, *dst_prog = NULL;
struct btf *attach_btf = NULL;
```

| 变量 | 作用 | usbtrace 经典 kprobe |
|------|------|----------------------|
| `prog` | 正在加载的这份程序（主角） | 有 |
| `dst_prog` | 挂到**另一份已加载 BPF**（`attach_prog_fd`） | 通常 `NULL` |
| `attach_btf` | 用 BTF 描述挂接点（fentry 等） | 通常 `NULL` |

### 3.2 执行流水线（按源码顺序）

1. **门禁**：`CHECK_ATTR`、flags、从用户态拷 license、算 GPL 兼容、
   `insn_cnt` 上限、`bpf_capable` / `perfmon_capable` 等。
2. **可选 attach 元数据**：解析 `attach_prog_fd` / `attach_btf_id`。
3. **分配 + 拷指令**：
   ```c
   prog = bpf_prog_alloc(...);
   copy_from_bpfptr(prog->insns, ...);
   ```
4. **定类型**：`find_prog_type(type, prog)` —— 决定合法 helper、上下文形态。
5. **验证**（安全边界）：
   ```c
   err = bpf_check(&prog, attr, uattr);   /* verifier.c */
   ```
6. **选运行时**：
   ```c
   prog = bpf_prog_select_runtime(prog, &err);  /* core.c：JIT 或解释器 */
   ```
7. **曝光 + 返回 fd**：
   ```c
   bpf_prog_alloc_id(prog);   /* 插入 prog_idr */
   bpf_prog_kallsyms_add(prog);
   err = bpf_prog_new_fd(prog);  /* 返回值 = prog fd */
   ```

**此处只完成「验证并持有程序」；尚未挂到 `usb_autosuspend_device`。**

---

## 4. 验证：`bpf_check()`

调用点（`syscall.c`）：

```c
/* run eBPF verifier */
err = bpf_check(&prog, attr, uattr);
```

实现：`kernel/bpf/verifier.c` → `int bpf_check(struct bpf_prog **prog, ...)`。

Verifier 在 **load 时** 做完安全分析（指针、越界、helper 合法性、CO-RE 重定位等）。
之后的 JIT/解释器 **不再做安全验证**，只负责怎么执行已通过的字节码。

---

## 5. JIT 与解释器：`bpf_prog_select_runtime()`

文件：`kernel/bpf/core.c`。

| | 解释器 | JIT |
|--|--------|-----|
| 实现 | `___bpf_prog_run()`：按 insn jumptable 模拟 | `bpf_int_jit_compile()` → 本机机器码 |
| 跑什么 | `prog->insns` eBPF 字节码 | `prog->bpf_func` 原生函数 |
| 速度 | 慢 | 接近原生 |
| 失败时 | 默认兜底 | `CONFIG_BPF_JIT_ALWAYS_ON` 时失败则 load 失败 |

桌面 Ubuntu 通常 `bpf_jit_enable=1`，usbtrace 加载成功后多数已 JIT。
命中时统一经 `bpf_prog_run()` → 调 `prog->bpf_func`。

---

## 6. prog 存在哪：`prog_idr`

对象分配：`bpf_prog_alloc()`（堆上的 `struct bpf_prog`）。

**全局索引**在 `bpf_prog_alloc_id()`：

```c
static DEFINE_IDR(prog_idr);

id = idr_alloc_cyclic(&prog_idr, prog, 1, INT_MAX, GFP_ATOMIC);
```

`prog_idr` 是 **IDR（ID → pointer）**，底层是 **radix tree**
（`include/linux/idr.h` 的 `struct idr`），不是链表：

```text
prog_id ──► struct bpf_prog *
```

`bpftool prog list`、`BPF_PROG_GET_FD_BY_ID` 查的就是这张表。

**用户态句柄**在 `bpf_prog_new_fd()`：

```c
anon_inode_getfd("bpf-prog", &bpf_prog_fops, prog, O_RDWR | O_CLOEXEC);
```

`file->private_data = prog`，返回值是进程 fd 表里的 prog fd。

| 步骤 | 函数 | 存到哪 |
|------|------|--------|
| 分配 | `bpf_prog_alloc` | `struct bpf_prog` |
| 全局注册 | `bpf_prog_alloc_id` | `prog_idr` |
| 交给用户态 | `bpf_prog_new_fd` | fd → `private_data` |

---

## 7. 真正挂钩：两步，不是一次 syscall

「把 eBPF 挂到目标函数入口」常被理解成一步，内核里拆成：

1. **在函数入口插桩**（改指令 / ftrace）—— `perf_event_open`
2. **把这份 prog 绑到该探针** —— `bpf(BPF_LINK_CREATE)` 或旧 ioctl

### 7.1 插桩：`perf_event_open` → `register_kprobe`

```text
perf_event_open
  → perf_kprobe_event_init          # kernel/events/core.c
    → perf_kprobe_init()            # kernel/trace/trace_event_perf.c
      → create_local_trace_kprobe() # kernel/trace/trace_kprobe.c
        → __register_trace_kprobe()
          → register_kprobe()       # kernel/kprobes.c  ★
            → arm_kprobe()
              → arch_arm_kprobe()   # 架构层改入口指令
```

分配 `trace_kprobe` 时会设置命中回调：

```c
tk->rp.kp.pre_handler = kprobe_dispatcher;  /* 仅填函数指针 */
```

**真正改入口**发生在 `register_kprobe()` → `arm_kprobe()`。
open 路径里随后还有 `TRACE_REG_PERF_REGISTER` → `enable_trace_kprobe`，使能该探针。

因此：**open 成功后，目标函数入口已被拦截**；别人一调用就会进
`kprobe_dispatcher`。但此时 **prog_array 往往还是空的**，你的 eBPF 尚未绑定。

### 7.2 绑定 eBPF：`BPF_LINK_CREATE`

`bpf()` 分发：

```c
case BPF_LINK_CREATE:
    err = link_create(&attr, uattr);
```

对 `BPF_PROG_TYPE_KPROBE`：

```c
ret = bpf_perf_link_attach(attr, prog);
/* → perf_event_set_bpf_prog()
   → perf_event_attach_bpf_prog()   # kernel/trace/bpf_trace.c */
```

`perf_event_attach_bpf_prog` 把 `prog` 放进该 kprobe 事件的 `prog_array`：

```c
event->prog = prog;
rcu_assign_pointer(event->tp_event->prog_array, new_array);
```

旧路径可用 `ioctl(pfd, PERF_EVENT_IOC_SET_BPF, prog_fd)`，不经 `LINK_CREATE`。
libbpf 通常还会再 `PERF_EVENT_IOC_ENABLE`。

**`attr->link_create.target_fd` 是先前 `perf_event_open` 返回的 perf fd**——
link 本身不解析函数名；函数名在 open 时已经用来建探针。

---

## 8. 命中之后：谁跑 eBPF

入口：`kprobe_dispatcher()`（`trace_kprobe.c`）：

```c
if (trace_probe_test_flag(&tk->tp, TP_FLAG_TRACE))
    kprobe_trace_func(tk, regs);      /* ① ftrace 文本追踪 */
#ifdef CONFIG_PERF_EVENTS
if (trace_probe_test_flag(&tk->tp, TP_FLAG_PROFILE))
    ret = kprobe_perf_func(tk, regs); /* ② perf / eBPF 路径 */
#endif
```

| 分支 | 标志 | 做什么 |
|------|------|--------|
| ① | `TP_FLAG_TRACE` | 写入 ftrace ring buffer（`trace` / `trace_pipe`），**不是**跑 BPF |
| ② | `TP_FLAG_PROFILE` | perf 路径；usbtrace / libbpf kprobe 走这里 |

`kprobe_perf_func` 内：

```c
if (bpf_prog_array_valid(call)) {
    ret = trace_call_bpf(call, regs);  /* 真正执行 eBPF */
    ...
}
```

随后（若需要）还可向 perf 事件缓冲提交采样；usbtrace 侧数据多经
**BPF ringbuf helper** 回到用户态 `ring_buffer__poll`。

---

## 9. 同一函数挂多个 eBPF：如何分发

libbpf / usbtrace 常见做法：每个 `SEC("kprobe/foo")` 各自
`perf_event_open` + `register_kprobe` + `BPF_LINK_CREATE`。
因此「两个 BPF 钩同一函数」在内核里首先是 **同地址上的两个 kprobe**，
不是一次把两个 prog 塞进同一个 `prog_array`。

### 9.1 日常路径（两个 BPF = 两个 kprobe）

入口只插桩 **一次**（ftrace：NOP→CALL）。命中后：

```text
foo 入口 CALL
  → ftrace trampoline → kprobe_ftrace_handler   // 只进一次
  → get_kprobe → 聚合探针（aggr）
  → aggr_pre_handler                            // ★ 多 kprobe 分发点
       ├─ kprobe_A → kprobe_dispatcher → prog_array_A → BPF₁
       └─ kprobe_B → kprobe_dispatcher → prog_array_B → BPF₂
```

`aggr_pre_handler`（`kernel/kprobes.c`）按聚合探针的 `list` **串行**调用每个
`pre_handler`；每个探针的 `prog_array` 里通常只有各自那一个 prog。

结论：**不是**「一次 `BPF_PROG_RUN_ARRAY` 把两个 BPF 跑完」；
而是 **kprobe 聚合 list 分两次**，每次再跑对应的 eBPF。

### 9.2 对照：同一事件的 `prog_array` 里挂多个 prog

若把多个 prog **挂进同一个** perf / `trace_event` 的 `prog_array`
（少见；需多次往同一事件 attach）：

```text
dispatcher → kprobe_perf_func → trace_call_bpf
  → BPF_PROG_RUN_ARRAY(prog_array)   // ★ BPF 层分发：顺序跑 M 个 prog
```

| 场景 | 分发点 | 扇出方式 |
|------|--------|----------|
| 多 BPF，各 attach 一次（常见） | `aggr_pre_handler` + `list` | N 个 kprobe，各跑自己的 array |
| 多 BPF，同一事件 | `BPF_PROG_RUN_ARRAY` | 一个 dispatcher，数组里跑 M 个 prog |

---

续篇（入口 NOP↔CALL、trampoline、handler 上下文）：[kprobe-on-ftrace 插桩实测](/analysis/kernel/bpf/kprobe-on-ftrace-lab)。

---

## 10. 一句话记忆

> **Load** 把已验证的字节码变成内核里的 `bpf_prog`（`prog_idr` + fd）；  
> **Open** 在目标函数入口插上 kprobe（`register_kprobe`；fentry 上常为 NOP→CALL trampoline）；  
> **Link** 把 prog 放进该探针的 `prog_array`；  
> **命中** 时 `ftrace_regs_caller` → `kprobe_ftrace_handler` →（perf 路径）`kprobe_dispatcher` / `trace_call_bpf` 执行 eBPF；  
> **同函数多 BPF（各 attach）** 时先经 `aggr_pre_handler` 按 kprobe list 扇出，再各自进 `prog_array`。

安全边界在 **`bpf_check`**；插桩边界在 **`arm_kprobe` / ftrace**；绑定边界在
**`perf_event_attach_bpf_prog`**。三者不要混成一个「attach 函数」。
