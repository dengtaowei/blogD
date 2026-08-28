---
date: 2026-08-23
homeTag: ARM64 · 笔记
homeTitle: AArch64 调用约定与帧指针
homeDesc: 前八个整数参数走 x0～x7，第 9、10 个占 8 字节栈槽；对照有无 x29 的两份单步
sidebarOrder: 10
sidebarTitle: 调用约定与帧指针
---

# AArch64 调用约定

> **平台**：`qemu-aarch64`；`aarch64-linux-gnu-gcc -O1 -g -fno-inline -static`（一份加 `-fomit-frame-pointer`，一份保留 `x29`）  
> **工具**：[gdbsp](https://github.com/dengtaowei/gdbsp)；JSON `/gdbsp/aarch64-add1-nofp.json`（37 步）、`/gdbsp/aarch64-add1-fp.json`（39 步），都从 `main` 到 `exit`  
> **本文**：对着下一条要执行的指令，看通用寄存器和 `$sp` 附近每个字  
> **配套代码**：`code/arm64-call-stack/`

---

## 目录

- [1. 对应的 C](#1-对应的-c)
- [2. 单步回放](#2-单步回放)
- [3. 如何做栈回溯](#3-如何做栈回溯)
- [4. 局部变量如何传递](#4-局部变量如何传递)
- [5. 返回值如何传递](#5-返回值如何传递)

---

AAPCS64 里，前八个整数参数放在 `x0`～`x7`（`int` 用对应的 `wN`），再多出来的由调用者写到栈上，**每个槽 8 字节**，即使类型是 4 字节的 `int`。[RV32 ilp32](/notes/riscv/rv32-call-stack) 同样把第 9、10 个参数放在 `$sp` 上，槽宽是 4 字节。`add2` 有十个参数，进函数时 `0(sp)`、`8(sp)` 就是 9 和 10。

## 1. 对应的 C

```c
int add2(int a, int b, int c, int d, int e, int f, int g, int h, int i, int j) {
    return a + b + c + d + e + f + g + h + i + j;
}

int add1(int a, int b) {
    return add2(a, b, 3, 4, 5, 6, 7, 8, 9, 10);
}

int main(int argc, char *argv[]) {
    volatile int local = 0xffff;
    return add1(1, 2);
}
```

`add1` 还要再 `bl add2`，得先把返回地址从 `x30` 存到栈上。`add2` 是叶函数，进来之后直接用寄存器和 `ldr` 做加法。

## 2. 单步回放

| 编译 | 步数 | 回放 |
|------|------|------|
| `-fomit-frame-pointer` | 37 | <a href="/files/gdbsp-aarch64.html?t=nofp" target="_blank" rel="noopener">无帧指针</a> |
| 保留 `x29` | 39 | <a href="/files/gdbsp-aarch64.html?t=fp" target="_blank" rel="noopener">有帧指针</a> |

## 3. 如何做栈回溯

### 有帧指针

AArch64 的帧指针是 `x29`。非叶函数序言会把旧的 `x29` 和返回地址 `x30` 成对存进栈，再让 `x29` 对准这对值。有如下规则：

**`[x29]` = 上一层 `x29`，`[x29, #8]` = 本函数的 `x30`。**

```text
高地址
[x29+8]   本函数的 x30
[x29]     上一层 x29      ← x29 寄存器指这里
…
低地址
```

这对 16 字节内部永远是「`x30` 在上、旧 `x29` 在下」。省略号只表示地址更低的方向。

顺着 `[x29]` 走到 0 就是整条链。

### 无帧指针

只能根据序言里面保存的 `x30` 函数返回地址来做栈回溯。

### 栈帧示意图
示意地址从 168 往下每格 8 字节；红色是 `main` 这一帧，绿色是 `add1` 这一帧。

<div class="a64-stacks">
<figure class="a64-stack">
<figcaption>有帧指针</figcaption>
<div class="a64-grid">
  <span class="a64-addr">168</span><span class="a64-cell a64-gap"></span><span class="a64-note a64-muted">main 入口时的 sp</span>
  <span class="a64-addr">160</span><span class="a64-cell a64-main a64-top">0x0000ffff00000000</span><span class="a64-note">main 的局部变量 local</span>
  <span class="a64-addr">152</span><span class="a64-cell a64-main"></span><span class="a64-note"></span>
  <span class="a64-addr">144</span><span class="a64-cell a64-main"><code>x30</code></span><span class="a64-note">main 保存的 x30 返回地址</span>
  <span class="a64-addr">136</span><span class="a64-cell a64-main a64-bot"><code>x29</code></span><span class="a64-note">main 保存的 x29；main 的 x29 指向这里</span>
  <span class="a64-addr">128</span><span class="a64-cell a64-add1 a64-top"><code>x30</code></span><span class="a64-note">add1 保存的 x30 返回地址</span>
  <span class="a64-addr">120</span><span class="a64-cell a64-add1">136</span><span class="a64-note">add1 保存的 x29；add1 的 x29 指向这里</span>
  <span class="a64-addr">112</span><span class="a64-cell a64-add1">10</span><span class="a64-note">传给 add2 的第 10 个参数</span>
  <span class="a64-addr">104</span><span class="a64-cell a64-add1 a64-bot">9</span><span class="a64-note">传给 add2 的第 9 个参数，当时的 sp</span>
</div>
</figure>
<figure class="a64-stack">
<figcaption>无帧指针</figcaption>
<div class="a64-grid">
  <span class="a64-addr">168</span><span class="a64-cell a64-gap"></span><span class="a64-note a64-muted">main 入口时的 sp</span>
  <span class="a64-addr">160</span><span class="a64-cell a64-main a64-top">0x0000ffff00000000</span><span class="a64-note">main 的局部变量 local</span>
  <span class="a64-addr">152</span><span class="a64-cell a64-main"></span><span class="a64-note"></span>
  <span class="a64-addr">144</span><span class="a64-cell a64-main"></span><span class="a64-note"></span>
  <span class="a64-addr">136</span><span class="a64-cell a64-main a64-bot"><code>x30</code></span><span class="a64-note">main 保存的 x30 返回地址</span>
  <span class="a64-addr">128</span><span class="a64-cell a64-add1 a64-top"></span><span class="a64-note"></span>
  <span class="a64-addr">120</span><span class="a64-cell a64-add1"><code>x30</code></span><span class="a64-note">add1 保存的 x30 返回地址</span>
  <span class="a64-addr">112</span><span class="a64-cell a64-add1">10</span><span class="a64-note">传给 add2 的第 10 个参数</span>
  <span class="a64-addr">104</span><span class="a64-cell a64-add1 a64-bot">9</span><span class="a64-note">传给 add2 的第 9 个参数，当时的 sp</span>
</div>
</figure>
</div>

有 `x29` 时，120 这一槽里的 136 接到 `main` 的帧记录，再沿 `[x29]` 走到 0。无 `x29` 时 `main` 的 `x30` 在自己帧底（136），`add1` 的 `x30` 在 `[sp,#16]`（120）；128 是 `sub sp, #0x20` 多出来的未用槽。

## 4. 局部变量如何传递

aarch64 用 `w0`～`w7` 传递整数参数，超出的由调用者写到栈上。

## 5. 返回值如何传递

aarch64 默认使用 `w0` 传递函数返回值。

<style>
.a64-stacks {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem 1.75rem;
  margin: 1rem 0 1.25rem;
  font-size: 13px;
  line-height: 1.35;
  color: var(--gh-fg-default);
}
.vp-doc .a64-stack {
  flex: 1 1 22rem;
  margin: 0;
  min-width: 0;
}
.vp-doc .a64-stack > figcaption {
  font-weight: 600;
  font-size: 14px;
  margin: 0 0 0.5rem;
  color: var(--gh-fg-default);
}
.a64-grid {
  display: grid;
  grid-template-columns: 2.4rem minmax(7.25rem, 9.25rem) minmax(7rem, 1fr);
  column-gap: 0.45rem;
  align-items: stretch;
}
.a64-addr {
  font-family: var(--gh-font-mono);
  font-size: 12px;
  color: var(--gh-fg-muted);
  text-align: right;
  padding: 0.35rem 0.15rem 0.35rem 0;
  align-self: center;
}
.a64-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 2.15rem;
  padding: 0.15rem 0.25rem;
  border: 1px solid var(--gh-border-default);
  margin-bottom: -1px;
  font-family: var(--gh-font-mono);
  font-size: 11px;
  text-align: center;
  word-break: break-all;
}
.vp-doc .a64-cell code {
  padding: 0;
  margin: 0;
  font-size: inherit;
  background: transparent;
  border-radius: 0;
  color: inherit;
}
.a64-gap {
  border: none;
  background: transparent;
  min-height: 1.4rem;
  margin: 0;
}
.a64-main {
  background: #f8d4d4;
}
.a64-add1 {
  background: #cfe9d4;
}
.a64-top {
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
}
.a64-bot {
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
  margin-bottom: 0;
}
.a64-note {
  display: flex;
  align-items: center;
  padding: 0.2rem 0;
  font-size: 12.5px;
  color: var(--gh-fg-default);
}
.a64-muted {
  color: var(--gh-fg-muted);
}
.dark .a64-main {
  background: #5a3030;
}
.dark .a64-add1 {
  background: #243d2c;
}
</style>

