# 系列文档清单（Manifest）

> 登记所有文档槽位；新增/完成时更新 **状态** 列。  
> 矩阵说明见 [`SERIES-GUIDE.md`](SERIES-GUIDE.md)。

**状态**：`done` | `outline` | `planned` | `—`（空白槽）

---

## Spine（01–08）

| ID | 文件 | 层 | 深度 | 状态 | 备注 |
|----|------|-----|------|------|------|
| 01 | 01-acm-practice.md | L0 | D2 | done | ACM 实验主线 |
| 02 | 02-architecture-overview.md | 全栈 | D0 | done | 跨层总览 |
| 03 | 03-configfs-assembly.md | L1+L2 | D1 | done | 组装 |
| 04 | 04-create-kernel-map.md | L1+L2+L4 | D2 | done | create 走读 |
| 05 | 05-kernel-reference.md | L1–L4 | D3 | done | 速查 |
| 06 | 06-udc-core-bind.md | L3 | D4 | done | UDC bind |
| 07 | 07-composite-ep0-enumeration.md | L2 | D4 | done | EP0 枚举 |
| 08 | 08-function-acm-path.md | L4 | D4 | done | ACM 数据路径 |

---

## 附录 A（L5/L6 硬件）

| ID | 文件 | 层 | 深度 | 状态 | 备注 |
|----|------|-----|------|------|------|
| A1 | A1-dwc2-board-probe.md | L6 | D0 | done | probe/DRD |
| A2 | A2-dwc2-pg71-init.md | L5 | D1/D5 | done | PG §7.1 |
| A3 | A3-dwc2-soft-connect.md | L5 | D2 | done | SFTDISCON |
| A4 | A4-dwc2-ep0-control.md | L5 | D4 | done | 硬件 EP0 |
| A5 | A5-dwc2-buffer-dma.md | L5 | D4 | done | Buffer DMA |
| A6 | A6-dwc2-usbtrdtim.md | L5 | D5 | done | USBTrdTim |

---

## 横向扩展（planned，文件名待定）

| 槽位 | 层 | 建议文件 | 状态 | 触发条件 |
|------|-----|----------|------|----------|
| L4-rndis | L4 | L4-rndis-path.md | planned | 需要 RNDIS gadget |
| L4-mass-storage | L4 | L4-mass-storage-path.md | planned | 需要 U 盘 function 专文 |
| L6-host | L6 | L6-host-enumeration.md | planned | 展开 Host 对称 |
| L6-typec | L6 | L6-typec-fusb302.md | planned | Type-C/PD 专文 |
| L1-legacy | L1 | L1-legacy-composite.md | planned | 对比 legacy g_* |

---

## 纵向扩展（planned，挂 parent）

| 父文档 | 建议文件 | 状态 | 内容 |
|--------|----------|------|------|
| 06 | 06-dive-pending-list.md | planned | gadget_driver_pending_list |
| 06 | 06-dive-connect-disconnect.md | planned | connect vs soft_connect |
| 07 | 07-dive-set-configuration.md | planned | SET_CONFIGURATION 单路径 |
| 07 | 07-dive-get-descriptor.md | planned | GET_DESCRIPTOR 族 |
| 08 | 08-dive-gserial-queue.md | planned | tty 缓冲与 request |
| A5 | A5-dive-bounce-buffer.md | planned | DMA bounce |
| A2 | A2-dive-usbreset-enumdone.md | planned | §7.4.1/7.4.2 专篇 |

---

## 附件

| 文件 | 关联 | 状态 |
|------|------|------|
| 01-acm-lsusb-dump.txt | 01 §5.5 | done |
