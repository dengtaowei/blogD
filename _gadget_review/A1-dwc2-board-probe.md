# A1 · 板级 Probe（DWC2）

| | |
|---|---|
| **前置** | [`02-architecture-overview.md`](02-architecture-overview.md) |
| **本文** | 板级 DTS、probe、`dr_mode`、role-switch |
| **下一步** | [`A2-dwc2-pg71-init.md`](A2-dwc2-pg71-init.md) |

> 软件主线见 01–08。系列索引：[`README.md`](README.md)

---

## 与 A2 / A3 的边界

| 主题 | 本文 A1 | A2 | A3 |
|------|----------|-----|-----|
| DTS / probe / `dr_mode` | ✓ | — | — |
| role-switch / Type-C | ✓ | — | 会话触发 connect 时涉及 |
| PG §7.1 寄存器级 init | 仅提 `dwc2_gadget_init` | **✓ 全文** | — |
| `DCTL.SFTDiscon` / soft_connect | 仅对比两入口 | 阶段二摘要 | **✓ 全文** |
| EP0 / DMA | 链到 A4/A5 | — | — |

读 **pullup 从哪来**：A1 §7–§8 建立上下文 → A2 阶段二 → A3 用户态 `soft_connect` 与各 disconnect 路径。

---

## 1. 本文回答什么

在进入 `gadget.c` 的 EP0/DMA 细节之前，需要先弄清：

> **STM32MP157 上，DWC2 OTG 控制器是如何被 platform 驱动拉起来、挂到 Gadget/HCD 框架上的？**

本文只覆盖 **板级 + probe + DRD**；寄存器级 init/connect 见 pg71；传输路径见 control_write / dma。

---

## 2. 硬件拓扑（SoC + 板级 DTS）

### 2.1 三块相关 IP

| IP | 节点 | 基址 / 角色 |
|---|---|---|
| **DWC2 OTG（HS）** | `usbotg_hs` | `0x49000000` — Device **或** OTG 模式下的 Gadget 侧 |
| **USB Host（EHCI/OHCI）** | `usbh_ehci` / `usbh_ohci` | `0x5800d000` / `0x5800c000` — 独立 Host 控制器 |
| **USB PHY 控制器** | `usbphyc` | `0x5a006000` — 两路 PHY：`port0`（Host）、`port1`（OTG HS） |

板级典型接线（DTS overlay）：

| 控制器 | PHY | 用途 |
|---|---|---|
| `&usbh_ehci` / `&usbh_ohci` | `usbphyc_port0` | Type-A Host 口（接 U 盘等） |
| `&usbotg_hs` | `usbphyc_port1 0` | Type-C OTG（Gadget / DRD） |

Type-C 口上的 **fusb302**（`typec: fusb302@22`）负责 CC 检测、PD 协商，并通过 **connector port graph** 与 `usbotg_hs` 的 **usb-role-switch** 联动。

### 2.2 `usbotg_hs` 设备树要点

摘自 `arch/arm/boot/dts/stm32mp151.dtsi`，板级 overlay 中启用：

```dts
usbotg_hs: usb-otg@49000000 {
    compatible = "st,stm32mp1-hsotg", "snps,dwc2";
    reg = <0x49000000 0x10000>;
    clocks = <&rcc USBO_K>;
    clock-names = "otg";
    resets = <&rcc USBO_R>;
    reset-names = "dwc2";
    interrupts-extended = <&exti 44 IRQ_TYPE_LEVEL_HIGH>;
    g-rx-fifo-size = <512>;
    g-np-tx-fifo-size = <32>;
    g-tx-fifo-size = <256 16 16 16 16 16 16 16>;
    dr_mode = "otg";
    usb33d-supply = <&usb33>;
    power-domains = <&pd_core>;
    wakeup-source;
    status = "disabled";          /* 板级 dtsi 改为 okay */
};

/* 板级 overlay 追加 */
&usbotg_hs {
    extcon = <&typec>;
    phys = <&usbphyc_port1 0>;
    phy-names = "usb2-phy";
    usb-role-switch;
    status = "okay";
    port {
        usbotg_hs_ep: endpoint {
            remote-endpoint = <&con_usbotg_hs_ep>;
        };
    };
};
```

| 属性 | 含义 |
|---|---|
| `st,stm32mp1-hsotg` | 匹配 `params.c` 中 STM32MP1 HS 默认参数 |
| `dr_mode = "otg"` | 双角色 **能力**（非当前运行角色） |
| `g-*-fifo-size` | Gadget 侧 RX / NP-TX / 各 IN EP TX FIFO 深度（word） |
| `usb33d-supply` | STM32 ID/VBUS 检测用 3.3V（仅 `activate_stm_id_vb_detection` 时启用） |
| `usb-role-switch` | 走软件 role-switch，**关闭** 硬件 ID/VB 检测路径 |
| `extcon = <&typec>` | 与 Type-C 控制器关联（旧式 extcon 接口，与 role-switch 并存） |
| `port` + `remote-endpoint` | 将 fusb302 `connector` 与 dwc2 的 role-switch 图绑定 |

### 2.3 内核可见节点

| 路径 | 何时出现 |
|---|---|
| `/sys/bus/platform/devices/49000000.usb-otg` | `dwc2` platform probe 成功 |
| `/sys/class/udc/49000000.usb-otg` | `dwc2_gadget_init()` → `usb_add_gadget_udc()` |
| `/sys/kernel/debug/49000000.usb-otg/params` | debugfs（需挂载 debugfs） |
| `/sys/kernel/debug/49000000.usb-otg/hw_params` | 读 `GHWCFG*` 硬件能力 |

UDC 名 **`49000000.usb-otg`** 来自 platform 设备名（reg 地址），configfs 脚本里 `echo` 的即此字符串。

---

## 3. Kconfig 与模块形态

| 配置项 | 典型值 | 作用 |
|---|---|---|
| `CONFIG_USB_DWC2` | `y` 或 `m` | dwc2 platform 驱动 |
| `CONFIG_USB_DWC2_DUAL_ROLE` | `y` | 同时编译 Gadget + HCD 栈 |
| `CONFIG_USB_GADGET` | `y` | Gadget 框架 |
| `CONFIG_USB_CONFIGFS` | `y` | configfs 动态 gadget |

`drivers/usb/dwc2/Kconfig`：`USB_DWC2_DUAL_ROLE` 要求 **USB 与 USB_GADGET 均开启**。  
这与 DTS `dr_mode = "otg"` 一致：probe 时 **两条栈都会初始化**（见 §5）。

---

## 4. `dr_mode`：配置能力 vs 运行角色

### 4.1 probe 时如何确定 `hsotg->dr_mode`

`dwc2_get_dr_mode()`（`platform.c`）：

```
usb_get_dr_mode(dev)     ← DTS dr_mode（本文示例 = "otg"）
  缺省 → USB_DR_MODE_OTG
× dwc2_hw_is_host/device()   ← GHWCFG2.OTG_MODE 硬件能力
× Kconfig                    ← CONFIG_USB_DWC2_HOST / PERIPHERAL / DUAL_ROLE
→ 最终 hsotg->dr_mode
```

典型结果：**`USB_DR_MODE_OTG`**（DTS `"otg"` + `DUAL_ROLE`）。

### 4.2 两个概念勿混

| 概念 | 决定因素 | 含义 |
|---|---|---|
| **`dr_mode`** | DTS + Kconfig + GHWCFG2 | 控制器 **能** 当 Host / Device / 两者 |
| **当前 USB 角色** | Type-C CC、role-switch、`GOTGCTL` | 运行时 **正在** Host 还是 Device |

插 Type-C 线作 UFP（接 PC）时，fusb302 会 `usb_role_switch_set_role(..., USB_ROLE_DEVICE)`，dwc2 `drd.c` 里强制 B-session 并 `dwc2_hsotg_core_connect()`；这与 DTS 里 `dr_mode=otg` 不矛盾。

---

## 5. Probe 主流程

`dwc2_driver_probe()`（`drivers/usb/dwc2/platform.c`）核心顺序：

```
platform probe (compatible → st,stm32mp1-hsotg / snps,dwc2)
  │
  ├─ devm_ioremap(0x49000000)
  ├─ dwc2_lowlevel_hw_init()      时钟/reset/phy 句柄
  ├─ request_irq (EXTI 44, shared)
  ├─ dwc2_lowlevel_hw_enable()    开 clock、phy_power_on、phy_init
  ├─ dwc2_get_dr_mode()           → OTG
  ├─ dwc2_core_reset()
  ├─ dwc2_get_hwparams()          读 GSNPSID、GHWCFG1–4 → hw_params
  ├─ dwc2_force_dr_mode()
  ├─ dwc2_init_params()           合并 hw + DTS + STM32 回调 → params
  │     └─ dwc2_set_stm32mp1_hsotg_params()
  ├─ dwc2_drd_init()              usb-role-switch 注册（见 §6）
  │
  ├─ if (dr_mode != HOST)
  │     dwc2_gadget_init()        → usb_add_gadget_udc()  ★ UDC 出现
  │
  └─ if (dr_mode != PERIPHERAL)
        dwc2_hcd_init()             → 注册 usbh 侧 HCD（与 usbotg 不同 IP）
```

**Gadget 相关关键点：**

- **`dwc2_gadget_init()` 在 boot 时只注册 `usb_gadget` 抽象**，不 pullup、不枚举；具体 USB 功能仍等用户 `echo UDC`（configfs）或 legacy 模块 bind。
- **`dwc2_hcd_init()` 初始化的是 `49000000.usb-otg` 这颗 DWC2 的 Host 栈**；板子上 Type-A 的 EHCI/OHCI 是 **另一颗** `5800d000` 控制器，勿混淆。

### 5.1 低层资源：`dwc2_lowlevel_hw_*`

| 步骤 | 内容 |
|---|---|
| reset | `reset-names = "dwc2"` → `reset_control_deassert` |
| PHY | `phy-names = "usb2-phy"` → `phy_get` + `phy_power_on` / `phy_init`（`usbphyc_port1`） |
| 时钟 | `clock-names = "otg"` → `clk_prepare_enable(USBO_K)` |
| _regulator_ | `vusb_d` / `vusb_a`（若 DTS 提供；STM32 另用 `usb33d-supply`） |

---

## 6. STM32MP1 专用参数

`dwc2_set_stm32mp1_hsotg_params()`（`params.c`）在 `of_match` 匹配 `st,stm32mp1-hsotg` 时调用：

| 字段 | 本文示例（有 `usb-role-switch`） | 说明 |
|---|---|---|
| `otg_cap` | `NO_HNP_SRP_CAPABLE` | 不做 HNP/SRP |
| `activate_stm_id_vb_detection` | **false** | `usb-role-switch` 存在时不走 GCCFG ID/VB 硬件检测 |
| `host_rx_fifo_size` 等 | 440 / 256 / 256 | Host 侧 FIFO（OTG 模式下 HCD 仍会用） |
| `power_down` | `NONE` | suspend 不 power-down core |
| `lpm` / `besl` | false | 本文示例关闭 LPM 相关 |

FIFO 深度来自 DTS `g-rx-fifo-size`、`g-np-tx-fifo-size`、`g-tx-fifo-size`，在 `dwc2_get_device_properties()` 中覆盖默认值（2048/1024）。

### 6.1 `hw_params` vs `params`

| 结构体 | 来源 | 典型用途 |
|---|---|---|
| `hw_params` | 读寄存器 `GHWCFG*`、`GSNPSID` | `arch`（是否 INT_DMA）、EP 数量、FIFO 总深度 |
| `params` | hw + DTS + 平台回调 + 校验 | 运行时 `g_dma`、`g_rx_fifo_size`、PHY 类型 |

Gadget DMA 结论（详见 `A5-dwc2-buffer-dma.md`）：

```bash
cat /sys/kernel/debug/49000000.usb-otg/params
# g_dma: 1, g_dma_desc: 0, arch: 2 (INT_DMA)
```

---

## 7. DRD 与 usb-role-switch

### 7.1 设备树图

```
fusb302@22
  └── connector (usb-c-connector)
        port ──remote-endpoint──► usbotg_hs / port / usbotg_hs_ep

usbotg_hs
  usb-role-switch;          → dwc2_drd_init() 注册 switch
  extcon = <&typec>;        → 与 Type-C 驱动关联
```

fusb302 在 CC 状态变化时（`fusb302.c`）：

- UFP / Sink → `usb_role_switch_set_role(..., USB_ROLE_DEVICE)`
- DFP / Source → `USB_ROLE_HOST`
- 断开 → `USB_ROLE_NONE`

role-switch 框架调用 dwc2 注册的 `dwc2_drd_role_sw_set()`（`drd.c`）。

### 7.2 `dwc2_drd_role_sw_set()` 做什么

| `USB_ROLE_*` | dwc2 动作（摘要） |
|---|---|
| `HOST` | `GOTGCTL` override A-session；OTG 时 `dwc2_force_mode(host)` |
| `DEVICE` | override B-session；`dwc2_force_mode(device)`；**`dwc2_hsotg_core_connect()`**（清 `DCTL.SFTDISCON`） |
| `NONE` | device 模式：`dwc2_hsotg_core_disconnect()`；host：`avalid` 无效 |

这与 configfs **`echo UDC`** 触发的 pullup（`udc_bind_to_driver` → `usb_udc_connect_control`）是 **不同入口、可叠加** 的两层：

| 层次 | 谁触发 | 作用 |
|---|---|---|
| **role-switch** | Type-C / 用户写 role | OTG 会话、强制 Host/Device 模式、可 connect/disconnect PHY 可见性 |
| **gadget bind** | configfs `echo UDC` | 绑定 composite 驱动、装配描述符、UDC core pullup |

实践上 Type-C 作 Device 接 PC：通常先 role-switch → DEVICE，再跑 configfs 脚本 bind ACM。

### 7.3 无 role-switch 时的 STM32 ID/VB 路径

若 DTS **没有** `usb-role-switch`，则 `activate_stm_id_vb_detection = true`，probe 中会：

- 使能 `usb33d` regulator
- 设置 `GGPIO` 的 `IDEN` / `VBDEN`

**已启用 role-switch**，故走软件 DRD，不依赖该硬件检测路径。

---

## 8. Boot 到 Gadget 可用：时间线

```
[内核启动]
  usbphyc probe → port1 PHY 就绪
  fusb302 probe → connector + role_sw 图建立
  dwc2 platform probe (49000000.usb-otg)
      → dwc2_gadget_init → /sys/class/udc/49000000.usb-otg
      → dwc2_hcd_init（DWC2 host 栈，与 Type-A EHCI 无关）
  （此时无 USB 设备功能、通常无 pullup）

[Type-C 插入 PC，fusb302 UFP]
  usb_role_switch_set_role(DEVICE)
      → dwc2_drd_role_sw_set → core_connect（视状态）

[用户空间 configfs]
  mkdir .../deferred_fb_serial …
  echo 49000000.usb-otg > .../UDC
      → configfs_composite_bind → pullup → Host 枚举

[Host]
  GET_DESCRIPTOR / SET_CONFIGURATION → ttyGS0 通
```

与 [`02-architecture-overview.md`](02-architecture-overview.md) §4 两阶段模型对应：**阶段 A = 本文 probe**；**阶段 B = echo UDC + role-switch 会话**。

---

## 9. 与 Gadget 框架的衔接

```
49000000.usb-otg (platform device)
    │
    ├─ dwc2_gadget_init()
    │     usb_add_gadget_udc() → struct usb_udc + /sys/class/udc/*
    │     hsotg->gadget (usb_gadget 抽象)
    │
    └─ 用户 echo UDC
          usb_gadget_probe_driver()
            udc_bind_to_driver()
              configfs_composite_bind()   ← configfs 纵轴
              usb_gadget_udc_start()      ← pg71 阶段二 / soft_connect
              usb_udc_connect_control()   ← pullup
```

| 想了解 | 读 |
|---|---|
| UDC 之上 composite/configfs | [`02-architecture-overview.md`](02-architecture-overview.md) → [`03-configfs-assembly.md`](03-configfs-assembly.md) |
| PG §7.1 init/connect 寄存器 | [`A2-dwc2-pg71-init.md`](A2-dwc2-pg71-init.md) |
| `DCTL.SFTDISCON` / soft_connect | [`A3-dwc2-soft-connect.md`](A3-dwc2-soft-connect.md) |
| EP0 / bulk DMA | [`A4-dwc2-ep0-control.md`](A4-dwc2-ep0-control.md)、[`A5-dwc2-buffer-dma.md`](A5-dwc2-buffer-dma.md) |
| `USBTrdTim` | [`A6-dwc2-usbtrdtim.md`](A6-dwc2-usbtrdtim.md) |

---

## 10. 板上常用检查命令

```bash
# UDC 是否注册
ls /sys/class/udc/
# → 49000000.usb-otg

# 当前 UDC 绑定状态（configfs bind 后非空）
cat /sys/kernel/config/usb_gadget/deferred_fb_serial/UDC

# dwc2 运行时参数
cat /sys/kernel/debug/49000000.usb-otg/params
cat /sys/kernel/debug/49000000.usb-otg/hw_params

# UDC 状态（not attached / attached / configured）
cat /sys/class/udc/49000000.usb-otg/state

# soft_connect（见 soft_connect 笔记）
ls /sys/class/udc/49000000.usb-otg/soft_connect

# Type-C / role（若 userspace 暴露）
# 具体路径依 fusb302 与 connector 驱动版本而定；dmesg 可见：
# fusb302: CC connected ... as UFP
# dwc2 ... B-session valid
```

---

## 11. 关键函数索引

| 函数 | 文件 | 作用 |
|---|---|---|
| `dwc2_driver_probe` | `platform.c` | 总 probe 入口 |
| `dwc2_get_dr_mode` | `platform.c` | 确定 `hsotg->dr_mode` |
| `dwc2_get_hwparams` | `params.c` | 读硬件配置寄存器 |
| `dwc2_init_params` | `params.c` | 合成 `hsotg->params` |
| `dwc2_set_stm32mp1_hsotg_params` | `params.c` | STM32MP1 HS 默认 |
| `dwc2_drd_init` | `drd.c` | 注册 `usb-role-switch` |
| `dwc2_drd_role_sw_set` | `drd.c` | Type-C 角色 → GOTGCTL / connect |
| `dwc2_gadget_init` | `gadget.c` | 初始化 gadget、`usb_add_gadget_udc` |
| `dwc2_hcd_init` | `hcd.c` | 同一 DWC2 的 Host 栈（非 5800 EHCI） |

---

## 12. 关联文档

[`README.md`](README.md)

---

## 13. 三句话总结

1. **OTG 口（Type-C）= `usbotg_hs`（DWC2 @ 0x49000000）+ `usbphyc_port1` + fusb302**；Type-A Host 是独立的 EHCI/OHCI + `port0`。
2. **`dr_mode=otg` + `DUAL_ROLE` → probe 同时 `gadget_init` 与 `hcd_init`**，但 USB 设备功能仍等 configfs bind；运行角色由 **usb-role-switch** 与 Type-C 驱动切换。
3. **本文是 dwc2 纵轴 H0**；寄存器级 init/connect 与数据传输分别交给 pg71 / soft_connect / control_write / dma 笔记，configfs 组装交给 Gadget 纵轴。
