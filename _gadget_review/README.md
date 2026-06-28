# Linux USB Gadget 框架分析系列

> **STM32MP157** / **Linux 5.4** / **DWC2** + **configfs CDC ACM**（`deferred_fb_serial`）。
> 本目录可 **整包复制** 到任意位置；链接均为同目录相对路径。

**编写/扩展本系列**：[`SERIES-GUIDE.md`](SERIES-GUIDE.md)（横向分层 × 纵向深度）· [`SERIES-MANIFEST.md`](SERIES-MANIFEST.md)（文档清单与空白槽）

---

## 1. 组织方式：横向 × 纵向

```
                    纵向（深度）
                 D0概览 → D1组装 → D2走读 → D3速查 → D4专深
              ┌──────────────────────────────────────────────
  横向（层）  │
  L0 实践     │  01
  L1 Configfs │  02§7   03      04       05
  L2 Composite│  02§8   03      04       05      07
  L3 UDC core │  02§4   —       04§2.16  05      06
  L4 ACM      │  01§2   03§3.5  04       05      08
  L5 dwc2     │  A1     A2      A3       —       A4–A6
              └──────────────────────────────────────────────
  spine 01–08 = 第一次读框架的纵向主线（已全部完成）
              L4-* / A7 / *-dive-* = 以后横向或加深扩展
```

- **横向**：换一层（Composite、UDC、Function、dwc2…）→ 用 **L*** / **A*** 分支，见 MANIFEST。  
- **纵向**：同一层加深（走读 → EP0 状态机 → PG 对照）→ 用 **spine** 或 **`*-dive-*`** 扩展。  
- 详情与命名规则：**[`SERIES-GUIDE.md`](SERIES-GUIDE.md)**

---

## 2. 三个锚点（不变）

| 时刻 | 用户动作 | 框架层 |
|------|----------|--------|
| **T0** | `mkdir` / `echo` / `ln` | 填 `gadget_info` / `cdev` |
| **T1** | `echo UDC` | composite bind + pullup |
| **T2** | Host `SET_CONFIGURATION` | `gserial_connect`，数据面通 |

例子：`deferred_fb_serial` + `acm.0` + UDC `49000000.usb-otg`。

---

## 3. Spine：第一次读框架（01–08）

| # | 文件 | 层 | 深度 | 状态 |
|---|------|-----|------|------|
| 01 | [01-acm-practice.md](01-acm-practice.md) | L0 | 实践 | done |
| 02 | [02-architecture-overview.md](02-architecture-overview.md) | 全栈 | D0 | done |
| 03 | [03-configfs-assembly.md](03-configfs-assembly.md) | L1–L2 | D1 | done |
| 04 | [04-create-kernel-map.md](04-create-kernel-map.md) | L1–L2 | D2 | done |
| 05 | [05-kernel-reference.md](05-kernel-reference.md) | L1–L4 | D3 | done |
| 06 | [06-udc-core-bind.md](06-udc-core-bind.md) | L3 | D4 | done |
| 07 | [07-composite-ep0-enumeration.md](07-composite-ep0-enumeration.md) | L2 | D4 | done |
| 08 | [08-function-acm-path.md](08-function-acm-path.md) | L4 | D4 | done |

附件：[01-acm-lsusb-dump.txt](01-acm-lsusb-dump.txt)

---

## 4. 附录 A：DWC2（L5/L6，可选）

| # | 文件 | 状态 |
|---|------|------|
| A1 | [A1-dwc2-board-probe.md](A1-dwc2-board-probe.md) | done |
| A2 | [A2-dwc2-pg71-init.md](A2-dwc2-pg71-init.md) | done |
| A3 | [A3-dwc2-soft-connect.md](A3-dwc2-soft-connect.md) | done |
| A4 | [A4-dwc2-ep0-control.md](A4-dwc2-ep0-control.md) | done |
| A5 | [A5-dwc2-buffer-dma.md](A5-dwc2-buffer-dma.md) | done |
| A6 | [A6-dwc2-usbtrdtim.md](A6-dwc2-usbtrdtim.md) | done |

更多槽位（A7、`*-dive-*`、L4-rndis…）见 [SERIES-MANIFEST.md](SERIES-MANIFEST.md)。

---

## 5. 推荐阅读路线

### 第一次读（spine）

```
01 → 02 → 03 → 04 → 05 → 06 → 07 → 08
                              ↓ 按需
                             A1 → A2 → A3 → A4 ∥ A5
```

### 按层查（横向切一片）

| 想搞清 | 读 |
|--------|-----|
| configfs 怎么填 | 03 → 04 → 05 |
| bind / pullup | 02§4 → 06 → A3 |
| EP0 枚举 | 07 → A4 |
| ACM 数据 | 01§2 → 08 → A5 |
| 板级 Type-C | A1 |

### 补细节（纵向加深）

在 MANIFEST 找 parent 下的 `*-dive-*` 或自行按 [SERIES-GUIDE §4](SERIES-GUIDE.md#4-新增文档规则) 新增。

---

## 6. 内核源码索引

| 主题 | 路径 |
|------|------|
| configfs | `drivers/usb/gadget/configfs.c` |
| composite | `drivers/usb/gadget/composite.c` |
| UDC core | `drivers/usb/gadget/udc/core.c` |
| ACM | `drivers/usb/gadget/function/f_acm.c` |
| ttyGS | `drivers/usb/gadget/function/u_serial.c` |
| dwc2 | `drivers/usb/dwc2/gadget.c` |

---

## 7. 备份

`../docs-backup/usb-gadget-notes-2026-05-24/`
