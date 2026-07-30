# 配套示例源码

本目录存放博客文章配套的示例与分析源码。

## 目录说明

| 目录 | 说明 |
|------|------|
| `v4l2-virtual/` | 最小虚拟 V4L2 采集驱动与用户态 mmap 示例 |
| `gadget-cdc-acm/` | configfs CDC ACM 串口 gadget 启停脚本 |
| `uvc-capture/` | UVC 相关实验与分析代码（待补充） |
| `kprobe-bytes-demo/` | kprobe-on-ftrace 入口改码教学模块（配合 BPF / kprobe 文） |

## 约定

- 每个子目录对应一篇或多篇博客文章
- 不提交编译产物（`.o`、`.elf`、`.bin` 等）
- 大体积固件或数据文件使用 `.gitignore` 排除
