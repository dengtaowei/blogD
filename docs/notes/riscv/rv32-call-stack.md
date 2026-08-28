---
date: 2026-08-27
homeTag: RISC-V · 笔记
homeTitle: RV32 调用约定与 $sp 栈
homeDesc: 前八个整数参数走 a0～a7，第 9、10 个在 $sp 上；跟着 si 看 add1 怎么把它们放到栈上
sidebarOrder: 20
sidebarTitle: RV32 调用约定与 $sp
---

# RV32 调用约定：从 `$sp` 上的第九个参数读起

> **平台**：`qemu-riscv32`；`riscv64-unknown-elf-gcc -march=rv32imac -mabi=ilp32 -O1 -g -fno-inline`  
> **工具**：[gdbsp](https://github.com/dengtaowei/gdbsp)；录好的 JSON `/gdbsp/add1.json`（40 步，从 `main` 到 `exit`）  
> **本文**：对着下一条要执行的指令，看通用寄存器和 `$sp` 附近每个字

---

## 目录

- [1. 对应的 C](#1-对应的-c)
- [2. 单步回放](#2-单步回放)
- [3. 进 add1：先减 sp，再存 ra](#3-进-add1先减-sp再存-ra)
- [4. 进 add2：a0～a7 与栈上的 9、10](#4-进-add2a0a7-与栈上的-9、10)
- [5. 这份 JSON 怎么来](#5-这份-json-怎么来)

---

RV32 的 ilp32 调用约定里，前八个整数参数放在 `a0`～`a7`，再多出来的由调用者写到栈上。`add2` 有十个参数，进函数时 `$sp` 指向的两个字就是 9 和 10。下面跟着事先录好的单步走一遍。

## 1. 对应的 C

```c
int add2(int a, int b, int c, int d, int e, int f, int g, int h, int i, int j) {
    return a + b + c + d + e + f + g + h + i + j;
}

int add1(int a, int b) {
    return add2(a, b, 3, 4, 5, 6, 7, 8, 9, 10);
}

int main(int argc, char *argv[]) {
    volatile int local = 1;
    return add1(1, 2);
}
```

`add1` 编译后会先 `addi sp,sp,-32`，空出 32 字节，把 `ra` 和要传给 `add2` 的 9、10 写进去，再 `jal add2`。

## 2. 单步回放

左边是 PC 附近的反汇编（`=>` 标的是**下一条要执行**的指令），中间是通用寄存器（刚变过的标黄），右边是栈（高地址在上）。打开后点 **si**，或按 `s` / 右箭头，前进一步。

<a href="/files/gdbsp-add1.html" target="_blank" rel="noopener">单独打开回放</a>

## 3. 进 add1：先减 sp，再存 ra

第 7 步停在 `add1` 入口 `0x00010124`，这时 `addi  sp,sp,-32` 还没执行。再 si 几次可以看到：

1. `sp` 减 32，空出 32 字节；
2. `sw ra, 28(sp)` 把返回地址写到 `28(sp)`；
3. 接着把 10、9 写到 `4(sp)`、`0(sp)`。

`main` 里的 `jal add1` 已经把返回地址写进 `ra`。`add1` 自己还要再 `jal`，得先把这份 `ra` 存到栈上。

## 4. 进 add2：a0～a7 与栈上的 9、10

第 20 步停在 `add2` 入口 `0x0001010c`。此时：

| 位置 | 值 |
|------|-----|
| `a0`～`a7` | 1 到 8 |
| `0(sp)` | 9 |
| `4(sp)` | 10 |
| `ra` | `add1` 里 `jal add2` 的下一条（`0x0001013e`） |

`add2` 里是一串 `add a0,a0,aN`，最后用 `lw a7,0(sp)`、`lw a5,4(sp)` 把栈上两个参数加进去，再 `ret`。右边栈那一栏，`sp` 那一行的值就是后面 `lw` 会读到的 9。

## 5. 这份 JSON 怎么来

在本机启动 [gdbsp](https://github.com/dengtaowei/gdbsp)，连上 `qemu-riscv32`，从 `main` 一路 `si` 到 `exit`，把每一步的 `pc`、寄存器、反汇编和 `$sp` 附近的内存写成 JSON。页面读这份文件，点 si 只是换到下一步当时的现场。
