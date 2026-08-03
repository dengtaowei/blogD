---
home: false
---

# Sound / ALSA

i.MX6ULL（SAI + WM8960）作对照：ASoC 分层、`/dev/snd` 节点与播/录路径分析。

对照内核以百问 **Linux 4.9.88 BSP** 为主（与本站多数 6.8 文章不同，各文文首已注明）。PCM 热路径换板可对照；时钟/模拟路由偏板级。

## 文章列表

- [ASoC 四层架构与 i.MX6ULL 驱动对照](/analysis/kernel/sound/imx6ull-asoc-layers) — Machine / Platform / CPU DAI / Codec 职责与本板源文件
- [i.MX6ULL `/dev/snd` 设备节点](/analysis/kernel/sound/imx6ull-snd-devices) — `controlC0` / `pcmC0D0` / `pcmC0D1`、三条 `dai_link`、节点创建与 `file_operations`
- [i.MX6ULL 声卡播放路径](/analysis/kernel/sound/imx6ull-audio-playback-flow) — `aplay` → 环形缓冲 → SDMA / SAI / WM8960，以及 HiFi 播放调用栈
- [i.MX6ULL 声卡录音路径](/analysis/kernel/sound/imx6ull-audio-capture-flow) — `arecord` 与播放对称：`read` / `DEV_TO_MEM` / SAI RX
- [ALSA PCM 状态机与 XRUN](/analysis/kernel/sound/alsa-pcm-state-xrun) — 状态变迁、`start`/`stop` 时机、underrun/overrun 与恢复
- [WM8960 kcontrol 构造与使用](/analysis/kernel/sound/wm8960-kcontrol) — `SOC_*` 宏、注册到 `controlC0`、读写到寄存器
