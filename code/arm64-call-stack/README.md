# ARM64 函数调用栈示例

配合笔记 `docs/notes/arm64/function-call-stack.md`。

```bash
sudo apt install gcc-aarch64-linux-gnu qemu-user
make
make run
aarch64-linux-gnu-objdump -d hello_arm64
```

`study_stack` 的开头应是 `stp x29, x30, [sp, #-32]!`，后面跟 `mov x29, sp`。
