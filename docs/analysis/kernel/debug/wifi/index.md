---
home: false
---

# WiFi · 调试与实践

WiFi 空口、速率控制与抗干扰相关的具体问题排查与实验记录。

---

## 记录

- [有邻区 WiFi 时下行 MCS 不稳](/analysis/kernel/debug/wifi/dl-interference-mcs-per) — 屏蔽箱满速、箱外 PER 升高、MCS 掉档；用对照分清能力上限与抗扰余量

---

## 常用手段（备忘）

| 手段 | 典型用途 |
|------|----------|
| 屏蔽箱 vs 箱外对照 | 区分能力上限与干扰下余量 |
| STA 侧 RSSI / SNR、MCS、PER | 定位是 RF 余量还是 RA 过敏 |
| `iw` / `iwpriv`（名称因驱动而异） | 信道、功率、EDCCA、聚合等 A/B |
| `lspci -vv` · offload / 硬转统计 | 仅当屏蔽箱也上不去时查数据面 |
| 传导仪表 / 暗室 | EVM、功率、天线与对照机对比 |
