---
date: 2026-08-27
homeTag: RISC-V · 笔记
homeTitle: RV32 调用约定与帧指针
homeDesc: 前八个整数参数走 a0～a7，第 9、10 个占 4 字节栈槽；对照有无 s0 的两份单步
sidebarOrder: 20
sidebarTitle: 调用约定与帧指针
---

# RV32 调用约定

> **平台**：`qemu-riscv32`；`riscv64-unknown-elf-gcc -march=rv32imac -mabi=ilp32 -O1 -g -fno-inline`（一份加 `-fomit-frame-pointer`，一份加 `-fno-omit-frame-pointer`）  
> **工具**：[gdbsp](https://github.com/dengtaowei/gdbsp)；JSON `/gdbsp/rv32-add1-nofp.json`（40 步）、`/gdbsp/rv32-add1-fp.json`（51 步），都从 `main` 到 `exit`  
> **本文**：对着下一条要执行的指令，看通用寄存器和 `$sp` 附近每个字  
> **配套代码**：`code/riscv-call-stack/`

---

## 目录

- [1. 对应的 C](#1-对应的-c)
- [2. 单步回放](#2-单步回放)
- [3. 如何做栈回溯](#3-如何做栈回溯)
- [4. 局部变量如何传递](#4-局部变量如何传递)
- [5. 返回值如何传递](#5-返回值如何传递)

---

RV32 的 ilp32 调用约定里，前八个整数参数放在 `a0`～`a7`，再多出来的由调用者写到栈上，**每个槽 4 字节**。`add2` 有十个参数，进函数时 `0(sp)`、`4(sp)` 就是 9 和 10。

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

`add1` 还要再 `jal add2`，得先把返回地址从 `ra` 存到栈上。无帧指针时 `add2` 是叶函数，进来之后直接用寄存器和 `lw` 做加法。

## 2. 单步回放

| 编译 | 步数 | 回放 |
|------|------|------|
| `-fomit-frame-pointer` | 40 | <a href="/files/gdbsp-add1.html?t=nofp" target="_blank" rel="noopener">无帧指针</a> |
| `-fno-omit-frame-pointer` | 51 | <a href="/files/gdbsp-add1.html?t=fp" target="_blank" rel="noopener">有帧指针</a> |

## 3. 如何做栈回溯

### 有帧指针

RV32 的帧指针是 `s0`（ABI 里也叫 `fp`）。非叶函数序言会把 `ra` 和旧的 `s0` 存进栈，再 `addi s0, sp, <帧大小>`，让 `s0` 对准**进入本函数时的 sp**。有如下规则：

`s0` 指向进入当前函数前的 `sp`，**`[s0-4]` = 本函数的 `ra`，`[s0-8]` = 上一层 `s0`。`s0` 寄存器指在这对的上面。**

```text
高地址
[s0]      进入本函数时的 sp      ← s0 寄存器指这里
[s0-4]    本函数的 ra
[s0-8]    上一层 s0
…
低地址
```

这份录制里帧大小是 32，所以 `addi s0, sp, 32`，`ra` 在 `28(sp)`，旧 `s0` 在 `24(sp)`。顺着 `[s0-8]` 走到 0 就是整条链。

### 无帧指针

只能根据序言里面保存的 `ra` 做栈回溯。这份录制里是 `sw ra, 28(sp)`。

### 栈帧示意图

进了 `add2` 之后。示意地址从 164 往下每格 4 字节；红色是 `main`，绿色是 `add1`，蓝色是 `add2`（有 `s0` 时才提栈）。

<div class="rv-stacks">
<figure class="rv-stack">
<figcaption>有帧指针</figcaption>
<div class="rv-grid">
  <span class="rv-addr">164</span><span class="rv-cell rv-gap"></span><span class="rv-note rv-muted">main 入口时的 sp；main 的 s0 指向这里</span>
  <span class="rv-addr">160</span><span class="rv-cell rv-main rv-top"><code>ra</code></span><span class="rv-note">main 保存的 ra</span>
  <span class="rv-addr">156</span><span class="rv-cell rv-main"><code>s0</code></span><span class="rv-note">main 保存的上一层 s0</span>
  <span class="rv-addr">152</span><span class="rv-cell rv-main"></span><span class="rv-note"></span>
  <span class="rv-addr">148</span><span class="rv-cell rv-main"></span><span class="rv-note"></span>
  <span class="rv-addr">144</span><span class="rv-cell rv-main">0xffff</span><span class="rv-note">main 的局部变量 local</span>
  <span class="rv-addr">140</span><span class="rv-cell rv-main"></span><span class="rv-note"></span>
  <span class="rv-addr">136</span><span class="rv-cell rv-main"></span><span class="rv-note"></span>
  <span class="rv-addr">132</span><span class="rv-cell rv-main rv-bot"></span><span class="rv-note">main 的 sp；add1 的 s0 指向这里</span>
  <span class="rv-addr">128</span><span class="rv-cell rv-add1 rv-top"><code>ra</code></span><span class="rv-note">add1 保存的 ra</span>
  <span class="rv-addr">124</span><span class="rv-cell rv-add1">164</span><span class="rv-note">add1 保存的 s0，接到 main 的 s0</span>
  <span class="rv-addr">120</span><span class="rv-cell rv-add1"></span><span class="rv-note"></span>
  <span class="rv-addr">116</span><span class="rv-cell rv-add1"></span><span class="rv-note"></span>
  <span class="rv-addr">112</span><span class="rv-cell rv-add1"></span><span class="rv-note"></span>
  <span class="rv-addr">108</span><span class="rv-cell rv-add1"></span><span class="rv-note"></span>
  <span class="rv-addr">104</span><span class="rv-cell rv-add1">10</span><span class="rv-note">传给 add2 的第 10 个参数</span>
  <span class="rv-addr">100</span><span class="rv-cell rv-add1 rv-bot">9</span><span class="rv-note">传给 add2 的第 9 个参数；add2 的 s0 指向这里</span>
  <span class="rv-addr">96</span><span class="rv-cell rv-add2 rv-top">132</span><span class="rv-note">add2 保存的 s0，接到 add1 的 s0</span>
  <span class="rv-addr">92</span><span class="rv-cell rv-add2"></span><span class="rv-note"></span>
  <span class="rv-addr">88</span><span class="rv-cell rv-add2"></span><span class="rv-note"></span>
  <span class="rv-addr">84</span><span class="rv-cell rv-add2 rv-bot"></span><span class="rv-note">add2 的 sp</span>
</div>
</figure>
<figure class="rv-stack">
<figcaption>无帧指针</figcaption>
<div class="rv-grid">
  <span class="rv-addr">164</span><span class="rv-cell rv-gap"></span><span class="rv-note rv-muted">main 入口时的 sp</span>
  <span class="rv-addr">160</span><span class="rv-cell rv-main rv-top"><code>ra</code></span><span class="rv-note">main 保存的 ra</span>
  <span class="rv-addr">156</span><span class="rv-cell rv-main"></span><span class="rv-note"></span>
  <span class="rv-addr">152</span><span class="rv-cell rv-main"></span><span class="rv-note"></span>
  <span class="rv-addr">148</span><span class="rv-cell rv-main"></span><span class="rv-note"></span>
  <span class="rv-addr">144</span><span class="rv-cell rv-main">0xffff</span><span class="rv-note">main 的局部变量 local</span>
  <span class="rv-addr">140</span><span class="rv-cell rv-main"></span><span class="rv-note"></span>
  <span class="rv-addr">136</span><span class="rv-cell rv-main"></span><span class="rv-note"></span>
  <span class="rv-addr">132</span><span class="rv-cell rv-main rv-bot"></span><span class="rv-note"></span>
  <span class="rv-addr">128</span><span class="rv-cell rv-add1 rv-top"><code>ra</code></span><span class="rv-note">add1 保存的 ra</span>
  <span class="rv-addr">124</span><span class="rv-cell rv-add1"></span><span class="rv-note"></span>
  <span class="rv-addr">120</span><span class="rv-cell rv-add1"></span><span class="rv-note"></span>
  <span class="rv-addr">116</span><span class="rv-cell rv-add1"></span><span class="rv-note"></span>
  <span class="rv-addr">112</span><span class="rv-cell rv-add1"></span><span class="rv-note"></span>
  <span class="rv-addr">108</span><span class="rv-cell rv-add1"></span><span class="rv-note"></span>
  <span class="rv-addr">104</span><span class="rv-cell rv-add1">10</span><span class="rv-note">传给 add2 的第 10 个参数</span>
  <span class="rv-addr">100</span><span class="rv-cell rv-add1 rv-bot">9</span><span class="rv-note">传给 add2 的第 9 个参数，当时的 sp</span>
</div>
</figure>
</div>

## 4. 局部变量如何传递

RV32 ilp32 用 `a0`～`a7` 传递整数参数，超出的由调用者写到栈上，每个槽 4 字节。

## 5. 返回值如何传递

RV32 默认使用 `a0` 传递函数返回值。

<style>
.rv-stacks {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem 1.75rem;
  margin: 1rem 0 1.25rem;
  font-size: 13px;
  line-height: 1.35;
  color: var(--gh-fg-default);
}
.vp-doc .rv-stack {
  flex: 1 1 22rem;
  margin: 0;
  min-width: 0;
}
.vp-doc .rv-stack > figcaption {
  font-weight: 600;
  font-size: 14px;
  margin: 0 0 0.5rem;
  color: var(--gh-fg-default);
}
.rv-grid {
  display: grid;
  grid-template-columns: 2.4rem minmax(4.5rem, 6.5rem) minmax(7rem, 1fr);
  column-gap: 0.45rem;
  align-items: stretch;
}
.rv-addr {
  font-family: var(--gh-font-mono);
  font-size: 12px;
  color: var(--gh-fg-muted);
  text-align: right;
  padding: 0.25rem 0.15rem 0.25rem 0;
  align-self: center;
}
.rv-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 1.7rem;
  padding: 0.1rem 0.25rem;
  border: 1px solid var(--gh-border-default);
  margin-bottom: -1px;
  font-family: var(--gh-font-mono);
  font-size: 11px;
  text-align: center;
  word-break: break-all;
}
.vp-doc .rv-cell code {
  padding: 0;
  margin: 0;
  font-size: inherit;
  background: transparent;
  border-radius: 0;
  color: inherit;
}
.rv-gap {
  border: none;
  background: transparent;
  min-height: 1.2rem;
  margin: 0;
}
.rv-main {
  background: #f8d4d4;
}
.rv-add1 {
  background: #cfe9d4;
}
.rv-add2 {
  background: #d4e3f8;
}
.rv-top {
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
}
.rv-bot {
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
  margin-bottom: 0;
}
.rv-note {
  display: flex;
  align-items: center;
  padding: 0.15rem 0;
  font-size: 12.5px;
  color: var(--gh-fg-default);
}
.rv-muted {
  color: var(--gh-fg-muted);
}
.dark .rv-main {
  background: #5a3030;
}
.dark .rv-add1 {
  background: #243d2c;
}
.dark .rv-add2 {
  background: #2a3d5a;
}
</style>
