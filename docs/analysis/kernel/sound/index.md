---
home: false
---

# Sound / ALSA

i.MX6ULL（SAI + WM8960）作对照：ALSA / ASoC 设备节点与播/录路径分析。

对照内核以百问 **Linux 4.9.88 BSP** 为主（与本站多数 6.8 文章不同，各文文首已注明）。PCM 热路径换板可对照；时钟/模拟路由偏板级。

## 阅读顺序

1. [i.MX6ULL `/dev/snd` 设备节点](/analysis/kernel/sound/imx6ull-snd-devices) — `controlC0` / `pcmC0D0` / `pcmC0D1`、三条 `dai_link`、节点创建与 `file_operations`
2. [i.MX6ULL 声卡播放路径](/analysis/kernel/sound/imx6ull-audio-playback-flow) — `aplay` → 环形缓冲 → SDMA / SAI / WM8960，以及 HiFi 播放调用栈
3. [i.MX6ULL 声卡录音路径](/analysis/kernel/sound/imx6ull-audio-capture-flow) — `arecord` 与播放对称：`read` / `DEV_TO_MEM` / SAI RX
