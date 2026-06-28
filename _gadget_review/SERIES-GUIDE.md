# 系列编写指南：横向 × 纵向

> 配合 [`README.md`](README.md) 使用。新增或修订笔记前读本文。

---

## 1. 两个维度

### 横向（分层）— 问「在哪一层？」

沿 **Host → 框架 → 硬件** 的软件栈展开；每层可独立增删文章，互不替代。

| 层 ID | 名称 | 典型源码 | 当前主文档 |
|-------|------|----------|------------|
| **L0** | 实践 / 验证 | 脚本、lsusb | 01 |
| **L1** | Configfs 入口 | `configfs.c` | 03, 04 |
| **L2** | Composite 框架 | `composite.c` | 03, 04, 07 |
| **L3** | UDC 核心 | `udc/core.c` | 06, 04§2.16 |
| **L4** | Function | `f_acm.c`, `f_*.c` | 08, 01§2 |
| **L5** | UDC 驱动 (dwc2) | `dwc2/gadget.c` | A1–A6 |
| **L6** | 板级 / Type-C | DTS, `drd.c`, fusb302 | A1 |

**横向扩展示例**（将来可加，不必改主线编号）：

| 新层/新主题 | 建议文件名 | 说明 |
|-------------|------------|------|
| L4 RNDIS | `L4-rndis-path.md` | 与 08 并列，另一 function |
| L4 mass_storage | `L4-mass-storage-path.md` | 与 G01 §10 泛化示例对应 |
| L6 Host 侧对称 | `L6-host-enumeration.md` | 02 §9 的展开 |
| Legacy gadget | `L1-legacy-g_*.md` | 非 configfs 入口 |

### 纵向（深度）— 问「读到多深？」

同一层内从 **能用 → 懂结构 → 跟代码 → 查表 → 专深** 递进。

| 深度 | 代号 | 读者目标 | 文体 | 当前对应 |
|------|------|----------|------|----------|
| **D0** | 概览 | 知道这层干什么 | 架构图、边界 | 02 各节 |
| **D1** | 组装 | 知道填了哪些结构体 | 脚本↔字段 | 03 |
| **D2** | 走读 | 能 trace 内核调用 | 逐步对照 | 04 |
| **D3** | 速查 | 调试时查表 | 表格、索引 | 05 |
| **D4** | 专深 | 搞清一个难点 | PG/寄存器/状态机 | 06–08, A4–A6 |
| **D5** | 对比 | 跨实现对照 | Linux vs HAL/PG | A2, A6 |

**纵向扩展示例**（挂在某一层的 D4/D5）：

| 父文档 | 建议文件名 | 内容 |
|--------|------------|------|
| 06 | `06-dive-pending-list.md` | pending 链表细节 |
| 07 | `07-dive-set-configuration.md` | SET_CONFIGURATION 单路径 |
| 08 | `08-dive-gserial.md` | gserial 缓冲与 queue |
| A5 | `A5-dive-bounce-buffer.md` | bounce buffer 专篇 |

---

## 2. 矩阵（当前覆盖 & 空白）

**读法**：行 = 横向层，列 = 纵向深度；单元格 = 已有文档（链接）或 **—**（可补）。

| 层 | D0 概览 | D1 组装 | D2 走读 | D3 速查 | D4+ 专深 |
|----|---------|---------|---------|---------|----------|
| **L0 实践** | — | — | [01](01-acm-practice.md) | — | [lsusb](01-acm-lsusb-dump.txt) |
| **L1 Configfs** | [02§7](02-architecture-overview.md) | [03](03-configfs-assembly.md) | [04](04-create-kernel-map.md) | [05](05-kernel-reference.md) | — |
| **L2 Composite** | [02§8](02-architecture-overview.md) | [03](03-configfs-assembly.md) | [04](04-create-kernel-map.md) | [05](05-kernel-reference.md) | [07](07-composite-ep0-enumeration.md) ○ |
| **L3 UDC core** | [02§4–5](02-architecture-overview.md) | — | [04§2.16](04-create-kernel-map.md) | [05](05-kernel-reference.md) | [06](06-udc-core-bind.md) ○ |
| **L4 ACM** | [01§2](01-acm-practice.md) | [03§3.5](03-configfs-assembly.md) | [04](04-create-kernel-map.md) | [05](05-kernel-reference.md) | [08](08-function-acm-path.md) ○ |
| **L5 dwc2** | [A1](A1-dwc2-board-probe.md) | [A2](A2-dwc2-pg71-init.md) | [A3](A3-dwc2-soft-connect.md) | — | [A4](A4-dwc2-ep0-control.md) [A5](A5-dwc2-buffer-dma.md) [A6](A6-dwc2-usbtrdtim.md) |

○ = 待写提纲已建

**02** 是跨层的 **D0 总览**；不必为每层再写一篇 D0，除非该层内容远超 02 某一节。

---

## 3. 两类主线

###  spine（数字 01–08）— 纵向「第一次读完整框架」

固定顺序，只放 **每层一个最佳入口**；不宜无限加长。

```
01 → 02 → 03 → 04 → 05 → 06 → 07 → 08
```

新增专深内容时：**优先** 用扩展文（见 §4），而不是插入 `09`、`10` 打乱 spine，除非确实是 **新的一层**（例如整条 L4-RNDIS 入门）。

###  branch（L* / A* / *-dive-*）— 横向或纵向扩展

| 前缀 | 含义 | 示例 |
|------|------|------|
| `01`–`08` | spine | `06-udc-core-bind.md` |
| `A1`–`A9` | 硬件附录（L5/L6 专深） | `A7-dwc2-suspend.md` |
| `L4-*` | 新 function 横向 | `L4-rndis-path.md` |
| `L6-*` | 板级/Host 横向 | `L6-typec-fusb302.md` |
| `{spine}-dive-*` | 同一主题纵向加深 | `07-dive-get-descriptor.md` |

---

## 4. 新增文档规则

1. **先定层（L?）和深度（D?）**，在 [`SERIES-MANIFEST.md`](SERIES-MANIFEST.md) 登记一行。  
2. **文首四行**：前置 / 本文 / 下一步 / 系列索引 → `README.md`。  
3. **写清边界**：「与 XX 的边界」— 避免与 03/04/05 或 A* 重复。  
4. **只深不广**：D4 专深文不重复 D1/D2 全文，用链接跳转。  
5. **改矩阵**：完成后更新 README §2 矩阵与 MANIFEST 状态。  
6. **spine 变更要慎重**：仅当「新层入门」才新增 `09`；否则用 branch。

### 文首模板

```markdown
# {编号} · {标题}

| | |
|---|---|
| **层** | L3 UDC core |
| **深度** | D4 专深 |
| **前置** | [`06-udc-core-bind.md`](06-udc-core-bind.md) |
| **本文** | … |
| **下一步** | … |

> 系列索引：[`README.md`](README.md)
```

---

## 5. 三个锚点（全系列不变）

| 时刻 | 用户动作 | L1 | L2 | L3 | L4 |
|------|----------|----|----|----|-----|
| **T0** | mkdir/echo/ln | configfs 填壳 | cdev 组装 | — | instance |
| **T1** | echo UDC | UDC store | bind 焊合 | udc_bind | function bind |
| **T2** | SET_CONFIGURATION | — | composite_setup | — | gserial_connect |

扩文时标明属于 **T0/T1/T2** 哪一段，便于挂到正确层。

---

## 6. 推荐怎么用矩阵

| 你的目标 | 怎么走 |
|----------|--------|
| 第一次学框架 | 只走 spine 01→08 |
| 调试 configfs | L1 行：03 → 04 → 05 |
| 搞懂 pullup | L3 行：02 → 06 → A3 |
| 加 RNDIS | 新建 L4 行，复制 08 的结构 |
| 补 USBTrdTim 级细节 | L5 行 D4：挂 A6 或 `A6-dive-*` |

---

## 7. 与备份

整理前快照：`../docs-backup/usb-gadget-notes-2026-05-24/`
