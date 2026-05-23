---
layout: home

hero:
  name: 嵌入式学习笔记
  text: 代码分析与学习心得
  tagline: 记录 RTOS、驱动开发、协议解析与调试实践
  actions:
    - theme: brand
      text: 开始学习
      link: /notes/
    - theme: alt
      text: 代码分析
      link: /analysis/

features:
  - icon: 📝
    title: 学习笔记
    details: RTOS、MCU 外设、Linux 驱动等知识点整理与实验记录
  - icon: 🔍
    title: 代码分析
    details: 逐行阅读开源驱动与协议栈，梳理设计思路与实现细节
  - icon: 💻
    title: 配套源码
    details: 博客文章对应 code/ 目录下的示例代码，同步托管于 GitHub
---

## 最近更新

- [枚举与两轮 Probe](/analysis/usb/enumeration-and-probe) — USB core 设备注册与 interface 驱动绑定
- [hub_port_init 调用链](/analysis/usb/hub-port-init) — 从 Hub 中断到设备地址分配
- [USB 2.0 枚举流程](/analysis/usb/usb-enumeration) — 典型控制传输与描述符读取时序
- [UVC 驱动分析](/analysis/uvc-driver) — USB Video Class 驱动结构初探
- [FreeRTOS 任务调度](/notes/rtos/task-scheduling) — 任务状态与调度机制笔记
