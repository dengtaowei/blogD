---
home: false
---

# Sound / ALSA

以百问 **i.MX6ULL（SAI2 + WM8960）** 为主线看 ASoC 分层、`/dev/snd` 与播录路径。

内核是 NXP BSP **Linux 4.9.88**（和站里多数 6.8 文不一样，各篇文首有写）。PCM 调用链换板可对照；时钟和模拟口跟板子有关——该板耳机麦进 LINPUT1，板载麦克风进 RINPUT1/2，详见 [DAPM §5.3](/analysis/kernel/sound/wm8960-dapm-routes#53-本板原理图与脚位)。

板级踩坑见 [调试与实践 · Sound](/analysis/kernel/debug/sound/)。

## 文章

- [ASoC 四层架构与 i.MX6ULL 驱动对照](/analysis/kernel/sound/imx6ull-asoc-layers) — Machine / Platform / CPU DAI / Codec
- [i.MX6ULL `/dev/snd` 设备节点](/analysis/kernel/sound/imx6ull-snd-devices) — `controlC0`、`pcmC0D0` / `D1`、三条 `dai_link`
- [i.MX6ULL 声卡播放路径](/analysis/kernel/sound/imx6ull-audio-playback-flow) — `aplay` → SDMA / SAI / WM8960
- [i.MX6ULL 声卡录音路径](/analysis/kernel/sound/imx6ull-audio-capture-flow) — `arecord`、`read`、SAI RX
- [ALSA PCM 状态机与 XRUN](/analysis/kernel/sound/alsa-pcm-state-xrun) — 状态、`start`/`stop`、underrun/overrun
- [ALSA hw_params 参数协商](/analysis/kernel/sound/alsa-hw-params-negotiate) — 本板成功/失败对照；dump 区间与 rule 离散率
- [WM8960 kcontrol 构造与使用](/analysis/kernel/sound/wm8960-kcontrol) — `SOC_*` 宏、音量怎么写到寄存器
- [从 tinymix 到 WM8960 DAPM 路由](/analysis/kernel/sound/wm8960-dapm-routes) — 开关、播录路径、本板接线
- [DAPM widget 上电：谁判、何时判](/analysis/kernel/sound/dapm-widget-power) — `power_check`、complete path

## 英文资料

| 资料 | 内容 |
|------|------|
| [Bootlin · Audio with Embedded Linux](https://bootlin.com/training/audio/) | 嵌入式音频培训总览（ASoC、DTS、DAPM、用户态） |
| [Bootlin · 培训幻灯片 PDF](https://bootlin.com/doc/training/audio/audio-slides.pdf) | 同上课程的完整讲义 |
| [Luca Ceresoli · Introduction to DAPM](https://bootlin.com/pub/conferences/2024/eoss/ceresoli-dapm/ceresoli-dapm.pdf) | EOSS 2024：widget / route、驱动接入与调试 |
| [Marcus Folkesson · Audio and Embedded Linux](https://www.marcusfolkesson.se/blog/audio-and-embedded-linux/) | i.MX8MM + TAS5720，`simple-audio-card` 组卡实战 |
| [Kernel · ASoC Overview](https://docs.kernel.org/sound/soc/overview.html) | 官方 ASoC 设计目标与分层 |
| [Kernel · DAPM](https://docs.kernel.org/sound/soc/dapm.html) | 官方 DAPM 说明 |
| [Pandy · ALSA Soc (ASoC) Driver Explained](https://pandysong.github.io/blog/post/asoc_explained/) | 四层、widget 与路由的概念梳理 |

## 后续蓝图

九篇已覆盖的主干是：一次 `write` / `read` 在四层里怎么走完、`/dev/snd` 节点从哪来、kcontrol 与 DAPM 图怎么建，以及 hw_params 协商。下面按层记录后续选题；**本专题暂以 NXP BSP Linux 4.9.88 为准**（与站内多数 6.8 文不同），与主线有出入处文内并列写明。升级内核后再统一基线。优先级只表示动笔顺序。

### PCM 核心

| 选题 | 要回答的问题 | 优先级 |
|------|--------------|--------|
| `hw_params` 参数协商 | 见 [ALSA hw_params 参数协商](/analysis/kernel/sound/alsa-hw-params-negotiate) | 已完成 |
| DMA 缓冲从哪来 | `snd_pcm_lib_preallocate_pages`（本 BSP 4.9）；主线常见 `snd_pcm_set_managed_buffer`；`SNDRV_DMA_TYPE_DEV` 与 `dma_alloc_coherent`；`/proc/asound/card0/pcm0p/sub0/prealloc` 改的是什么 | 高 |
| mmap 与 read/write 两种搬运 | `SNDRV_PCM_ACCESS_RW_INTERLEAVED` 与 `MMAP_INTERLEAVED` 的差别；`snd_pcm_mmap_begin` / `_commit`；`.mmap` 回调把 DMA 缓冲映射给用户态的过程 | 中 |
| 延迟与时间戳 | `.pointer` 回调精度决定什么；`snd_pcm_delay`、`snd_pcm_htimestamp` 与 `SNDRV_PCM_TSTAMP_TYPE_*`；端到端延迟由哪几段组成 | 中 |
| `snd_pcm_link` 多流同步 | 多个 substream 共用一次 `trigger` 的机制 | 低 |

### ASoC 框架

| 选题 | 要回答的问题 | 优先级 |
|------|--------------|--------|
| component 化：4.9 → 主线 | `snd_soc_codec` 并入 `snd_soc_component` 后代码长什么样；`snd_soc_dai_link_component` 与 `SND_SOC_DAILINK_DEFS`；`.cpus` / `.codecs` / `.platforms` 数组写法。可作 [ASoC 四层](/analysis/kernel/sound/imx6ull-asoc-layers) 的版本对照篇（待内核升级后再写） | 高 |
| 时钟与 DAI 格式 | `set_sysclk` / `set_pll` / `set_bclk_ratio` / `set_tdm_slot` 各自定什么；`SND_SOC_DAIFMT_I2S` / `LEFT_J` / `DSP_A` 的时序差别；provider / consumer（原 master / slave）由谁出 BCLK、LRCK；44.1 kHz 与 48 kHz 两族采样率的分频来源 | 高 |
| bias level 状态机 | `SND_SOC_BIAS_OFF` / `STANDBY` / `PREPARE` / `ON` 的迁移时机；`set_bias_level` 与 `idle_bias_off`；与 [widget 上电](/analysis/kernel/sound/dapm-widget-power) 的先后关系 | 中 |
| 通用 Machine：simple-audio-card / audio-graph-card | 不写板级 C 文件、只靠 DTS 组卡的写法；`simple-audio-card,dai-link` 与 OF graph 的 `port` / `endpoint`；对照 T113 的 `sunxi-simple-card` | 中 |
| DPCM（FE / BE） | `dynamic` / `no_pcm` 两类 dai_link；前端 PCM 与后端 DAI 的参数如何传导；手机 SoC 为什么需要它 | 中 |
| ASoC topology | `.tplg` 固件描述 widget / route / dai_link 的思路 | 低 |

### Codec 与硬件接口

| 选题 | 要回答的问题 | 优先级 |
|------|--------------|--------|
| regmap 在 codec 驱动里 | `regmap_config` 的 `max_register` / `volatile_reg` / `reg_defaults`；`REGCACHE_RBTREE` 缓存与 resume 时的 `regcache_sync`；只写寄存器的芯片（如 WM8960）为什么必须有 cache；`/sys/kernel/debug/regmap/` 怎么看 | 高 |
| I2S 控制器驱动怎么写 | 以 `fsl_sai.c`、`sunxi-daudio.c` 为例看 `snd_soc_dai_ops` 的 `hw_params` / `trigger` / `set_fmt`；FIFO 阈值与 `snd_dmaengine_dai_dma_data` 如何交给 dmaengine | 中 |
| jack 检测 | `snd_soc_jack` 与 `snd_soc_jack_add_pins` / `_add_gpios`；`SND_JACK_HEADPHONE` 上报到 input 层后谁来切路由 | 中 |
| DMIC / PDM 通路 | PDM 码流经抽取滤波变 PCM 的位置；`sound/soc/codecs/dmic.c` 与 `sunxi-dmic.c` 的分工。可把 [T113 板载音频](/analysis/kernel/debug/sound/t113-vela-onboard-audio) 的实践升格为框架文 | 中 |

### 用户态与周边

| 选题 | 要回答的问题 | 优先级 |
|------|--------------|--------|
| procfs / debugfs / trace 速查 | `/proc/asound/card0/pcm0p/sub0/{hw_params,status}` 各字段；`/sys/kernel/debug/asoc/` 的 `dapm` / `dais` / `components`；`dapm_pop_time`；`trace-cmd record -e snd_soc -e snd_pcm` 能看到哪些事件 | 高 |
| alsa-lib 插件链与 tinyalsa | `hw` / `plughw` / `default` 的区别；重采样与格式转换发生在用户态的哪一层；`dmix` / `dsnoop` 与 `asound.conf`；tinyalsa 直通 ioctl 的取舍 | 中 |
| USB Audio Class | `sound/usb/` 如何按 UAC1 / UAC2 描述符建卡；同步端点与 implicit feedback；与 [UVC 驱动分析](/analysis/kernel/usb/uvc-driver) 对照看同一根线上的两类 Class | 中 |
| UCM 用例管理 | `alsa-ucm-conf` 与 `alsactl` 在产品上怎么固化路由与音量 | 低 |
| compress offload | `/dev/snd/comprC0D0` 与 `snd_compr_ops`，硬件解码时数据不经 PCM 环形缓冲的路径 | 低 |
| HDMI / SPDIF 音频 | `hdmi-codec.c` 与 IEC958 通道状态 | 低 |
