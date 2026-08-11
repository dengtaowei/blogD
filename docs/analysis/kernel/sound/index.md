---
home: false
---

# Sound / ALSA

以百问 i.MX6ULL（SAI2 + WM8960）为例，看 ASoC 分层、`/dev/snd`，以及播、录路径。

内核是 NXP BSP **Linux 4.9.88**（和站里多数 6.8 文不一样，各篇文首有写）。PCM 那套调用链换板也能对照；时钟和模拟口接线跟板子有关——本板耳机麦进 LINPUT1，板载麦克风进 RINPUT1/2，详见 [ASoC 四层 §6.1.1](/analysis/kernel/sound/imx6ull-asoc-layers#611-本板模拟接线)、[DAPM §5.3](/analysis/kernel/sound/wm8960-dapm-routes#53-本板原理图与脚位)。

## 文章

- [ASoC 四层架构与 i.MX6ULL 驱动对照](/analysis/kernel/sound/imx6ull-asoc-layers) — Machine / Platform / CPU DAI / Codec
- [i.MX6ULL `/dev/snd` 设备节点](/analysis/kernel/sound/imx6ull-snd-devices) — `controlC0`、`pcmC0D0` / `D1`、三条 `dai_link`
- [i.MX6ULL 声卡播放路径](/analysis/kernel/sound/imx6ull-audio-playback-flow) — `aplay` → SDMA / SAI / WM8960
- [i.MX6ULL 声卡录音路径](/analysis/kernel/sound/imx6ull-audio-capture-flow) — `arecord`、`read`、SAI RX
- [ALSA PCM 状态机与 XRUN](/analysis/kernel/sound/alsa-pcm-state-xrun) — 状态、`start`/`stop`、underrun/overrun
- [WM8960 kcontrol 构造与使用](/analysis/kernel/sound/wm8960-kcontrol) — `SOC_*` 宏、音量怎么写到寄存器
- [从 tinymix 到 WM8960 DAPM 路由](/analysis/kernel/sound/wm8960-dapm-routes) — 开关、播录路径、本板接线
- [DAPM widget 上电：谁判、何时判](/analysis/kernel/sound/dapm-widget-power) — `power_check`、complete path
