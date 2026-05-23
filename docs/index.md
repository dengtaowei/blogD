---
layout: home

hero:
  name: 嵌入式学习笔记
  text: Linux 驱动与嵌入式开发
  tagline: 源码分析 · 协议对照 · 调试实践
  actions:
    - theme: brand
      text: 关于我
      link: /about
    - theme: alt
      text: 内核分析
      link: /analysis/kernel/

features:
  - icon: 🔍
    title: 内核源码分析
    details: 从 USB 协议到 hub_port_init、probe、类驱动，成体系梳理 Linux 6.8 内核路径
  - icon: 📝
    title: 学习笔记
    details: RTOS、MCU 外设、设备树等知识点与实验记录
  - icon: 💻
    title: 开源可验证
    details: 文章与配套代码托管于 GitHub，便于查阅与对照
---

## 最近更新

- [枚举与两轮 Probe](/analysis/kernel/usb/enumeration-and-probe) — USB core 设备注册与 interface 驱动绑定
- [hub_port_init 调用链](/analysis/kernel/usb/hub-port-init) — 从 Hub 中断到设备地址分配
- [USB 2.0 枚举流程](/analysis/kernel/usb/usb-enumeration) — 典型控制传输与描述符读取时序
- [UVC 驱动分析](/analysis/kernel/usb/uvc-driver) — USB Video Class 驱动结构初探
- [FreeRTOS 任务调度](/notes/rtos/task-scheduling) — 任务状态与调度机制笔记
