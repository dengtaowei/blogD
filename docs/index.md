---
layout: home

hero:
  name: Linux 内核学习笔记
  text: 源码阅读与子系统分析
  tagline: 调用链梳理 · 协议对照 · 调试实践
  actions:
    - theme: brand
      text: 内核分析
      link: /analysis/kernel/
    - theme: alt
      text: 关于我
      link: /about
    - theme: alt
      text: 学习笔记
      link: /notes/

features:
  - icon: 🔍
    title: 内核源码分析
    details: 从 USB 协议到 hub_port_init、probe、类驱动，成体系梳理 Linux 6.8 内核路径
  - icon: 📚
    title: 子系统专题
    details: USB core、设备模型、pinctrl / GPIO 等子系统的调用链与数据结构对照
  - icon: 💻
    title: 开源可验证
    details: 文章与配套代码托管于 GitHub，便于查阅与对照
---

<div class="home-content">

<section class="home-section">
  <h2 class="home-section-title">精选系列</h2>
  <div class="home-series">
    <div class="home-series-head">
      <h3>Linux 内核 · USB 子系统</h3>
      <p>协议层 → core 调用链 → 驱动绑定 → 类驱动</p>
    </div>
    <ul class="home-series-steps">
      <li>
        <a href="/analysis/kernel/usb/usb-enumeration">
          <span class="home-step-num">1</span>
          <span class="home-step-text">
            <strong>USB 2.0 枚举流程</strong>
            <span>控制传输与 Token / DATA0 / DATA1 时序</span>
          </span>
        </a>
      </li>
      <li>
        <a href="/analysis/kernel/usb/hub-port-init">
          <span class="home-step-num">2</span>
          <span class="home-step-text">
            <strong>hub_port_init 调用链</strong>
            <span>从 Hub 中断到地址分配与设备描述符</span>
          </span>
        </a>
      </li>
      <li>
        <a href="/analysis/kernel/usb/get-descriptor-trace">
          <span class="home-step-num">3</span>
          <span class="home-step-text">
            <strong>usb_get_descriptor 调用链</strong>
            <span>core 到 xHCI 的 URB 提交与完成路径</span>
          </span>
        </a>
      </li>
      <li>
        <a href="/analysis/kernel/usb/enumeration-and-probe">
          <span class="home-step-num">4</span>
          <span class="home-step-text">
            <strong>枚举与两轮 Probe</strong>
            <span>usb_new_device 与 interface 驱动绑定</span>
          </span>
        </a>
      </li>
      <li>
        <a href="/analysis/kernel/usb/uvc-driver">
          <span class="home-step-num">5</span>
          <span class="home-step-text">
            <strong>UVC 驱动分析</strong>
            <span>USB Video Class 类驱动结构</span>
          </span>
        </a>
      </li>
      <li>
        <a href="/analysis/kernel/usb/gadget-subsystem">
          <span class="home-step-num">6</span>
          <span class="home-step-text">
            <strong>Gadget 子系统概览</strong>
            <span>UDC / composite / configfs 四层架构</span>
          </span>
        </a>
      </li>
      <li>
        <a href="/analysis/kernel/usb/gadget-configfs-assembly">
          <span class="home-step-num">7</span>
          <span class="home-step-text">
            <strong>Configfs 组装分析</strong>
            <span>`gadget_info` / `cdev` 脚本拼装与 bind</span>
          </span>
        </a>
      </li>
      <li>
        <a href="/analysis/kernel/usb/gadget-kernel-reference">
          <span class="home-step-num">8</span>
          <span class="home-step-text">
            <strong>Gadget 内核参考</strong>
            <span>结构体、回调与脚本映射速查</span>
          </span>
        </a>
      </li>
      <li>
        <a href="/analysis/kernel/usb/gadget-udc-core-bind">
          <span class="home-step-num">9</span>
          <span class="home-step-text">
            <strong>UDC bind 分析</strong>
            <span>`udc_bind_to_driver`、pending、pullup</span>
          </span>
        </a>
      </li>
      <li>
        <a href="/analysis/kernel/usb/gadget-cdc-acm">
          <span class="home-step-num">10</span>
          <span class="home-step-text">
            <strong>Gadget CDC ACM 串口实践</strong>
            <span>configfs、`ttyGS0` 与 Host `cdc_acm`</span>
          </span>
        </a>
      </li>
    </ul>
    <div class="home-links">
      <a class="home-link-btn" href="/analysis/kernel/">查看内核概览 →</a>
      <a class="home-link-btn" href="https://github.com/dengtaowei/blogD">GitHub 源码 →</a>
    </div>
  </div>
</section>

<RecentPosts :limit="6" />

</div>
