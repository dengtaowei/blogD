# 关于我

## 定位

**Linux 内核**学习方向。以源码阅读为主，关注 USB 子系统、设备模型、驱动 probe 与 pinctrl / GPIO 等路径，习惯从**协议层 → 内核实现 → 驱动绑定**串联分析问题。

本博客记录 Linux 内核相关的源码分析与学习笔记，侧重调用链梳理、协议与内核实现的对应关系，以及可复现的调试方法。

## 技术栈

| 领域 | 内容 |
|------|------|
| Linux 内核 | USB core、设备模型、probe 机制、pinctrl / GPIO、设备树与驱动绑定 |
| 调试工具 | Wireshark（USB 抓包）、trace-cmd、GDB、ftrace |
| 语言 / 基础 | C、数据结构与计算机基础 |
| 阅读环境 | Linux 6.8 内核源码、QEMU / 开发板上的内核日志与跟踪 |

## 阅读指引

**USB 子系统**系列建议按以下顺序阅读：

1. [USB 2.0 枚举流程](/analysis/kernel/usb/usb-enumeration) — 协议层控制传输时序
2. [hub_port_init 调用链](/analysis/kernel/usb/hub-port-init) — 插盘到地址分配
3. [usb_get_descriptor 调用链](/analysis/kernel/usb/get-descriptor-trace) — core 到 xHCI 的 URB 路径
4. [枚举与两轮 Probe](/analysis/kernel/usb/enumeration-and-probe) — 设备注册与驱动绑定
5. [UVC 驱动分析](/analysis/kernel/usb/uvc-driver) — USB Video Class 类驱动

**Device 侧（Gadget）**：

1. [Gadget 子系统概览](/analysis/kernel/usb/gadget-subsystem) — 四层架构、两阶段生命周期、configfs 设计
2. [Configfs 组装分析](/analysis/kernel/usb/gadget-configfs-assembly) — `gadget_info`、`cdev` 与 `composite` 如何由脚本拼装
3. [Gadget CDC ACM 串口实践](/analysis/kernel/usb/gadget-cdc-acm) — configfs、`/dev/ttyGS0` 与 Host `cdc_acm`

**其他内核专题**：[STM32 Pinctrl](/analysis/kernel/pinctrl/stm32-pinctrl) · [STM32 GPIO](/analysis/kernel/gpio/stm32-gpio)

**调试与实践**（具体问题排查）：[概览](/analysis/kernel/debug/) · [USB 记录](/analysis/kernel/debug/usb/)

**补充笔记**（非主线）：[FreeRTOS 任务调度](/notes/rtos/task-scheduling)

## 站点与仓库

- **博客首页**：https://blog.xvfex.com.cn
- 博客源码：[github.com/dengtaowei/blogD](https://github.com/dengtaowei/blogD)
- 文章配套示例：`code/` 目录（与文章同步维护）

## 联系

- GitHub：[dengtaowei](https://github.com/dengtaowei)
- 邮箱：`1158725668@qq.com`（合作 / 交流欢迎来信）

---

欢迎通过 Issue 或邮件交流技术问题。文章如有疏漏，也欢迎指正。
