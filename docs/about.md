# 关于我

## 定位

嵌入式 / **Linux 驱动**方向。关注 USB 子系统、内核源码阅读与 MCU 外设，习惯从**协议层 → 内核实现 → 类驱动**串联分析问题。

本博客记录嵌入式与 Linux 驱动相关的学习笔记与源码分析，侧重调用链梳理、协议与内核实现的对应关系，以及可复现的调试方法。

## 技术栈

| 领域 | 内容 |
|------|------|
| 语言 / 基础 | C、数据结构与计算机基础 |
| Linux 内核 | USB core、设备模型、probe 机制、pinctrl / 设备树 |
| 嵌入式 RTOS | FreeRTOS 任务调度与外设实验 |
| 调试工具 | Wireshark（USB 抓包）、trace-cmd、GDB、逻辑分析仪 |
| 平台 | STM32、Linux 用户态 / 内核态驱动阅读 |

## 阅读指引

**USB 子系统**系列建议按以下顺序阅读：

1. [USB 2.0 枚举流程](/analysis/kernel/usb/usb-enumeration) — 协议层控制传输时序
2. [hub_port_init 调用链](/analysis/kernel/usb/hub-port-init) — 插盘到地址分配
3. [usb_get_descriptor 调用链](/analysis/kernel/usb/get-descriptor-trace) — core 到 xHCI 的 URB 路径
4. [枚举与两轮 Probe](/analysis/kernel/usb/enumeration-and-probe) — 设备注册与驱动绑定
5. [UVC 驱动分析](/analysis/kernel/usb/uvc-driver) — USB Video Class 类驱动

其他分析：[STM32 Pinctrl](/analysis/kernel/pinctrl/stm32-pinctrl) · [FreeRTOS 任务调度](/notes/rtos/task-scheduling)

## 代码与仓库

- 博客源码：[github.com/dengtaowei/blog](https://github.com/dengtaowei/blog)
- 文章配套示例：`code/` 目录（与文章同步维护）

## 联系

- GitHub：[dengtaowei](https://github.com/dengtaowei)
- 邮箱：`3186986746@qq.com`（合作 / 交流欢迎来信）

---

欢迎通过 Issue 或邮件交流技术问题。文章如有疏漏，也欢迎指正。
