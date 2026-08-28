# RV32 add1 / add2

配合笔记 `docs/notes/riscv/rv32-call-stack.md`。

```bash
make          # -fomit-frame-pointer
make dump     # 应看到 sw ra,28(sp)，没有 addi s0,sp
make fp dump  # 应看到 sw s0 与 addi s0,sp,32
```

单步回放见笔记里的 gdbsp JSON，不必在本目录开 QEMU。
