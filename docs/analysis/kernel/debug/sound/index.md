---
home: false
---

# Sound · 调试与实践

音频 / ALSA 相关的板级踩坑与实验记录。

**流程分析**（成体系阅读）：[Sound / ALSA 概览](/analysis/kernel/sound/) · [ASoC 四层](/analysis/kernel/sound/imx6ull-asoc-layers) · [DAPM widget 上电](/analysis/kernel/sound/dapm-widget-power)

---

## 记录

- [T113 Vela：板载麦与喇叭通路对齐](/analysis/kernel/debug/sound/t113-vela-onboard-audio) — 先梳理原理图，再对齐 DMIC（PD18～20）与 `gpio-spk`（PD17）

---

## 常用手段（备忘）

| 手段 | 典型用途 |
|------|----------|
| `aplay -l` / `arecord -l` | 声卡与 PCM 设备 |
| `amixer` / `tinymix` | DAPM pin、音量、路由开关 |
| `/sys/kernel/debug/asoc/` | widget 上电状态 |
| `/sys/kernel/debug/pinctrl/*/pinmux-pins` | 音频脚复用是否与原理图一致 |
| 源码 + 原理图 | Machine / Codec 节点、`gpio-spk`、模拟口 |
