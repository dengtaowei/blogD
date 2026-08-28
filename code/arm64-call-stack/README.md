# AArch64 add1 / add2

配合笔记 `docs/notes/arm64/function-call-stack.md`。

```bash
sudo apt install gcc-aarch64-linux-gnu qemu-user
make          # -fomit-frame-pointer
make dump     # 应看到 str x30
make fp dump  # 应看到 stp x29, x30 与 mov/add x29
```

单步回放见笔记里的 gdbsp JSON，不必在本目录开 QEMU。
