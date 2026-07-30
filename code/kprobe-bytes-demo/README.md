# kprobe-bytes-demo

Out-of-tree 模块：在内核函数入口注册 kprobe（默认 `usb_set_configuration`），dump 挂接前后入口机器码，并在命中时打印上下文。

对应博客：

- [eBPF kprobe 路径](https://blog.xvfex.com.cn/analysis/kernel/bpf/ebpf-kprobe-load-attach)
- [kprobe-on-ftrace 插桩实测](https://blog.xvfex.com.cn/analysis/kernel/bpf/kprobe-on-ftrace-lab)

## 快速开始

```bash
cd code/kprobe-bytes-demo
make
sudo insmod ./kprobe_bytes_demo.ko
sudo dmesg | grep kprobe_bytes
# 插拔 USB 可看到 HIT
sudo rmmod kprobe_bytes_demo
```

Ubuntu（`CONFIG_KPROBES_ON_FTRACE=y`）预期：

```text
BEFORE : 0f 1f 44 00 00   (5-byte NOP)
AFTER  : e8 xx xx xx xx   (CALL) + FTRACE flag
rmmod  : NOP restored
```
