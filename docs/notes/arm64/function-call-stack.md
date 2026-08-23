---
date: 2026-08-23
homeTag: ARM64 · 笔记
homeTitle: ARM64 函数调用栈
homeDesc: gcc 用一条 stp 同时存 x29、x30 并给局部变量留位置；跟着指令看 SP、栈底和返回地址
sidebarOrder: 10
sidebarTitle: 函数调用栈
---

# ARM64 函数调用栈：从一条 `stp [sp, #-32]!` 读起

> **平台**：ARM64 Linux 应用程序；`aarch64-linux-gnu-gcc -O0 -g -fno-omit-frame-pointer -fno-stack-protector -static`，`qemu-aarch64`  
> **配套代码**：`code/arm64-call-stack/`

---

## 目录

- [1. 对应的 C](#1-对应的-c)
- [2. 先看 `study_stack` 开头两条指令](#2-先看-study_stack-开头两条指令)
- [3. 逐步动画](#3-逐步动画)
- [4. `print_hello` 为什么只有 `sub`](#4-print_hello-为什么只有-sub)
- [5. `ldp` 把这一层栈收回去](#5-ldp-把这一层栈收回去)

---

## 1. 对应的 C

`code/arm64-call-stack/main.c` 里这一段：

```c
__attribute__((noinline))
void study_stack(void)
{
    volatile uint64_t local0 = 0x1111222233334444ULL;
    volatile uint64_t local1 = 0xAAAABBBBCCCCDDDDULL;

    print_hello();
    (void)local0;
    (void)local1;
}
```

`noinline` 让编译器不要把 `study_stack` 嵌进 `main`，栈上才能单独看到这一层。`volatile` 让 `-O0` 也会把两个常数写到栈上。`print_hello` 用 `svc #0` 做 `write(1, "hello\n", 6)`，里面不再调用别的函数。

调用栈：

```text
main
 └─ study_stack          // 还要再调别人，得先把 x30 存起来
     └─ print_hello      // 不再调用别的函数，只 sub 给 msg[]
         └─ svc #0       // 进内核，不压栈、不改 x30
```

## 2. 先看 `study_stack` 开头两条指令

`make && aarch64-linux-gnu-objdump -d hello_arm64` 里，`study_stack` 是：

```text
400828  stp   x29, x30, [sp, #-32]!
40082c  mov   x29, sp
400830  mov   x0, #0x4444
        movk  …
400840  str   x0, [sp, #24]          // local0
400844  mov   x0, #0xdddd
        movk  …
400854  str   x0, [sp, #16]          // local1
400858  bl    4007e0 <print_hello>
40085c  ldr   x0, [sp, #24]
400860  ldr   x0, [sp, #16]
400868  ldp   x29, x30, [sp], #32
40086c  ret
```

`stp` 后面的 `!` 表示：先把 SP 减去 32，再把 `x29` 写到新的 `[SP]`，把 `x30` 写到 `[SP+8]`。`400828` 跑完，32 字节已经空出来了，局部变量还没写入。`40082c` 跑完，`x29` 和 SP 都指着刚存下来的 `x29`、`x30`。

## 3. 逐步动画

下面按反汇编地址一条一条走。左边是汇编，右边是寄存器，以及从 `main` 这一层往低地址看的栈（每行 8 字节，低字节在前）。`local0`、`local1`、`hello` 要等到对应的 `str` / `stur` 才会出现在栈上。

表里的栈地址是为了对齐偏移编的。在板子或 qemu 上，绝对地址会变，各段谁在谁上面一样。

<a href="/files/arm64-call-stack.html" target="_blank" rel="noopener">单独打开动画</a>

## 4. `print_hello` 为什么只有 `sub`

`print_hello` 不再调用别的函数，gcc 只给栈上的 `msg[]` 减了 16 字节：

```text
4007e0  sub  sp, sp, #0x10
        … 把 "hello\n" 拷到 [sp, #8] …
400818  svc  #0
400820  add  sp, sp, #0x10
400824  ret
```

没有 `stp`，也不改 `x29`。进来之后 SP 是 `0x7ffbb0`，`x29` 仍指向 `study_stack` 的 `0x7ffbc0`。`ret` 跳到寄存器里的 `x30`，也就是 `0x40085c`。

## 5. `ldp` 把这一层栈收回去

回到 `study_stack` 之后，`400868  ldp x29, x30, [sp], #32` 从 `[SP]`、`[SP+8]` 把 `x29` 和 `x30` 读回来，再把 SP 加 32。刚才存下来的寄存器和两个局部变量一起没了。`x29` 回到 `main` 的 `0x7ffbe0`，`x30` 回到 `0x4008b0`。再执行 `ret`，就回到 `main` 里 `bl study_stack` 的下一条。

`main` 打印的「调用前」和「返回后」SP、FP 相同，就是因为这一对 `stp` / `ldp` 把 32 字节借走后又还回去了。
