---
homeTag: Sound · ALSA
homeTitle: ASoC 四层架构与 i.MX6ULL 驱动对照
homeDesc: Machine / Platform / CPU DAI / Codec 职责与源文件
sidebarOrder: 0
sidebarTitle: ASoC 四层架构
date: 2026-08-02
---

# ASoC 四层架构与 i.MX6ULL 驱动对照

> **平台**：100ask i.MX6ULL Pro（`wm8960-audio`，SAI2 + WM8960）  
> **内核**：NXP BSP **Linux 4.9.88**（`imx-wm8960` / `fsl_sai` / `imx-pcm-dma-v2` / `wm8960`）；与站点多数 6.8 文路径不同，差异处另行注明  
> **本文**：ASoC 经典四层各自做什么，以及在本板上对应哪些驱动与设备树节点

---

## 目录

- [1. 本文要回答什么](#1-本文要回答什么)
- [2. ASoC 在 ALSA 中的位置](#2-asoc-在-alsa-中的位置)
- [3. 经典四层与职责](#3-经典四层与职责)
- [4. 分层关系图](#4-分层关系图)
- [5. i.MX6ULL Pro 四层驱动对照](#5-imx6ull-pro-四层驱动对照)
- [6. 设备树如何粘合四层](#6-设备树如何粘合四层)
  - [6.1 Machine：`sound`](#61-machine-sound)
  - [6.5 内核如何管理这三层](#65-内核如何管理这三层)
  - [6.6 绑卡：soc_bind_dai_link 与 rtd](#66-绑卡soc_bind_dai_link-与-rtd)
- [7. Probe 顺序](#7-probe-顺序)
- [8. 运行时数据走哪几层](#8-运行时数据走哪几层)
- [9. 术语澄清](#9-术语澄清)
- [10. 小结](#10-小结)
- [附录 A 源码索引](#附录-a-源码索引)
- [附录 B 要点速记](#附录-b-要点速记)

---

## 1. 本文要回答什么

> **ASoC 一般分哪几层？每层做什么？100ask i.MX6ULL Pro 上分别对应哪个驱动文件？**

---

## 2. ASoC 在 ALSA 中的位置

ALSA 面向用户态提供 `/dev/snd/*`（PCM、控制等）。嵌入式 SoC 上，声卡往往由「控制器 + 编解码器 + DMA」拼成，ASoC（ALSA System on Chip）把这块拆成可复用的驱动层，再由 **Machine** 按板级接线组卡。

用户态仍只认 card / device；四层是内核里的组织方式，不是用户态再开四套 API。

---

## 3. 经典四层与职责

| 层 | 英文 | 职责（做什么） | 一般不做什么 |
|----|------|----------------|--------------|
| **Machine** | Machine / Card | 板级粘合：解析 DTS、`dai_link`、`audio-routing`、主从与时钟策略、耳机插入等；注册 `snd_soc_card` | 不搬 PCM 字节流，不直接操作 SAI FIFO |
| **Platform** | Platform / PCM | PCM 设备与 DMA：环形缓冲、period、SDMA / DMA 把内存与 DAI FIFO 对接 | 不解析编解码器寄存器；不是「某某开发板平台」的意思 |
| **CPU DAI** | CPU DAI | SoC 侧数字音频接口：SSI / SAI / I2S 等，配置格式、时钟、触发收发 | 不负责模拟增益、耳机功放 |
| **Codec** | Codec | 编解码器：I2C / SPI 控制、DAC / ADC、DAPM 模拟路由、音量 | 一般不负责 SoC 侧 DMA |

一条 `dai_link` 通常绑定：**CPU DAI + Codec DAI + Platform**；Machine 持有整张 card 与一条或多条 link。

较新主线内核里不少驱动合成 **Component**，但读板级代码、对照 DTS 时，仍按上述四层拆最清楚。

---

## 4. 分层关系图

用户态只看到 ALSA 提供的设备节点；Machine 把 Platform、CPU DAI、Codec 绑进同一张声卡，本身不搬运 PCM 数据。

```mermaid
flowchart TB
  US["用户态<br/>aplay / arecord / tinymix"]
  ALSA["ALSA 核心<br/>/dev/snd/pcm* · control*"]
  M["Machine<br/>card / dai_link / routing"]

  P["Platform<br/>PCM + DMA"]
  C["CPU DAI<br/>SAI …"]
  CO["Codec<br/>DAC / ADC / DAPM"]

  US --> ALSA --> M
  M -.绑.-> P
  M -.绑.-> C
  M -.绑.-> CO
```

---

## 5. i.MX6ULL Pro 四层驱动对照

本板声卡名 `wm8960-audio`，数字接口为 **SAI2**，编解码器为 **WM8960**（I2C2 `@0x1a`）。

| 层 | 本板驱动 | 源文件 | 设备树 / 绑定要点 |
|----|----------|--------|-------------------|
| **Machine** | `imx-wm8960` | `sound/soc/fsl/imx-wm8960.c` | `sound` 节点；`compatible` 匹配 `"fsl,imx-audio-wm8960"` |
| **Platform** | `imx-pcm-dma-v2` | `sound/soc/fsl/imx-pcm-dma-v2.c` | **无独立节点**；`fsl_sai` probe 末尾 `imx_pcm_platform_register()` |
| **CPU DAI** | `fsl_sai` | `sound/soc/fsl/fsl_sai.c` | `&sai2`；SoC 定义在 `imx6ull.dtsi`（`fsl,imx6ul-sai`） |
| **Codec** | `wm8960` | `sound/soc/codecs/wm8960.c` | `wm8960@1a`；`compatible = "wlf,wm8960"` |

本板另外还有一套经 ASRC 的前端 PCM，节点说明见 [`/dev/snd` 设备节点](/analysis/kernel/sound/imx6ull-snd-devices)。下文仍按不经 ASRC、直连 Codec 的 `HiFi` 通路来对照四层。

辅助头文件：`sound/soc/fsl/fsl_sai.h`、`sound/soc/fsl/imx-pcm.h`。

---

## 6. 设备树如何粘合四层

主板文件：`arch/arm/boot/dts/100ask_imx6ull-14x14.dts`（`#include "imx6ull.dtsi"`）。

### 6.1 Machine：`sound`

```txt
sound {
    compatible = "fsl,imx6ul-evk-wm8960",
                 "fsl,imx-audio-wm8960";
    model = "wm8960-audio";
    cpu-dai = <&sai2>;
    audio-codec = <&codec>;
    codec-master;
    gpr = <&gpr 4 0x100000 0x100000>;
    hp-det = <3 0>;          /* 片内 JD3，对应原理图 HPD */
    audio-routing =
        "Headphone Jack", "HP_L",
        "Headphone Jack", "HP_R",
        "Ext Spk", "SPK_LP",
        /* … SPK_LN / SPK_RP / SPK_RN … */
        "RINPUT1", "Main MIC",
        "RINPUT2", "Main MIC",
        "Main MIC", "MICB",
        /* … 其余边见 dts 源文件 … */;
};
```

| 属性 | 作用 |
|------|------|
| `cpu-dai` | 指向 CPU DAI（及 Platform 宿主）`&sai2` |
| `audio-codec` | 指向 Codec `&codec` |
| `codec-master` | WM8960 出 BCLK / LRCLK，SAI 为 clock slave |
| `model` | 用户可见卡名 |
| `hp-det` | 片内耳机检测脚；本板 `<3 0>` 选 JD3（原理图 `HPD` → `RINPUT3/JD3`） |
| `audio-routing` | 板级端点名（`Headphone Jack`、`Main MIC` 等）接到 Codec 脚名 |

### 6.2 CPU DAI：`&sai2`

板级使能时钟与引脚；控制器寄存器与 DMA 通道在 `imx6ull.dtsi`。`sound` 的 `cpu-dai = <&sai2>` 只把节点指到 Machine；真正成为 ASoC CPU DAI，靠 `fsl_sai_probe` 末尾注册：

```c
ret = devm_snd_soc_register_component(&pdev->dev, &fsl_component,
                &fsl_sai_dai, 1);
```

传入的 `fsl_sai_dai` 是静态 `snd_soc_dai_driver`；core 据此创建运行时 `snd_soc_dai`（挂链见 [6.5](#65-内核如何管理这三层)）：

```c
static struct snd_soc_dai_driver fsl_sai_dai = {
	.probe = fsl_sai_dai_probe,   /* 绑卡后：复位 SAI、装 DMA 参数 */
	.playback = {                 /* 播放方向能力：通道 / 速率 / 格式 */
		.stream_name = "CPU-Playback",
		.channels_min = 1,
		.channels_max = 32,
		.rate_min = 8000,
		.rate_max = 2822400,
		.rates = SNDRV_PCM_RATE_KNOT,
		.formats = FSL_SAI_FORMATS,
	},
	.capture = {                  /* 录音方向能力，字段含义同 playback */
		.stream_name = "CPU-Capture",
		.channels_min = 1,
		.channels_max = 32,
		.rate_min = 8000,
		.rate_max = 2822400,
		.rates = SNDRV_PCM_RATE_KNOT,
		.formats = FSL_SAI_FORMATS,
	},
	.resume  = fsl_sai_dai_resume, /* 恢复时切回正确 pinctrl 状态 */
	.ops = &fsl_sai_pcm_dai_ops,  /* 见下表：时钟 / 格式 / PCM 回调 */
};
```

`.ops` 指向的 `fsl_sai_pcm_dai_ops`：

```c
static const struct snd_soc_dai_ops fsl_sai_pcm_dai_ops = {
	.set_sysclk   = fsl_sai_set_dai_sysclk,   /* 选 SAI 内部时钟源 / 分频相关 */
	.set_fmt      = fsl_sai_set_dai_fmt,      /* I2S / 主从、极性等总线格式 */
	.set_tdm_slot = fsl_sai_set_dai_tdm_slot, /* TDM 槽数与槽宽 */
	.hw_params    = fsl_sai_hw_params,        /* 按 rate/channels/format 写寄存器 */
	.hw_free      = fsl_sai_hw_free,          /* 释放本流占用的 SAI 配置 */
	.trigger      = fsl_sai_trigger,          /* start/stop：开停 TX/RX */
	.startup      = fsl_sai_startup,          /* open 时约束与准备 */
	.shutdown     = fsl_sai_shutdown,         /* close 时清理流状态 */
};
```

同一 probe 里随后 `imx_pcm_platform_register()` 挂上 Platform（见 6.4）。

### 6.3 Codec：`wm8960@1a`（`&i2c2` 下）

```txt
codec: wm8960@1a {
    compatible = "wlf,wm8960";
    reg = <0x1a>;
    clocks = <&clks IMX6UL_CLK_SAI2>;
    clock-names = "mclk";
    wlf,shared-lrclk;
};
```

`wlf,shared-lrclk`：录放共用 LRCLK，便于 `codec-master` 下录音。

`sound` 的 `audio-codec = <&codec>` 只做绑定；真正注册靠 `wm8960_i2c_probe`：

```c
ret = snd_soc_register_codec(&i2c->dev,
                &soc_codec_dev_wm8960, &wm8960_dai, 1);
```

与 SAI 的 `snd_soc_register_component` 对应：本 BSP 仍用经典 **`snd_soc_register_codec`**。`soc_codec_dev_wm8960` 是 `snd_soc_codec_driver`（codec `probe` / bias 等）；`wm8960_dai` 是 Codec 侧静态 `snd_soc_dai_driver`，core 据此建运行时 Codec DAI（挂链见 [6.5](#65-内核如何管理这三层)）：

```c
static struct snd_soc_dai_driver wm8960_dai = {
	.name = "wm8960-hifi",        /* dai_link 匹配用的 Codec DAI 名 */
	.playback = {                 /* 播放方向能力 */
		.stream_name = "Playback",
		.channels_min = 1,
		.channels_max = 2,
		.rates = WM8960_RATES,
		.formats = WM8960_FORMATS,
	},
	.capture = {                  /* 录音方向能力 */
		.stream_name = "Capture",
		.channels_min = 1,
		.channels_max = 2,
		.rates = WM8960_RATES,
		.formats = WM8960_FORMATS,
	},
	.ops = &wm8960_dai_ops,       /* 见下：格式 / 时钟 / mute */
	.symmetric_rates = 1,         /* 录放共用同一采样率 */
};
```

`.ops` 指向的 `wm8960_dai_ops`：

```c
static const struct snd_soc_dai_ops wm8960_dai_ops = {
	.hw_params    = wm8960_hw_params,      /* 按 rate/format 配接口与分频 */
	.hw_free      = wm8960_hw_free,        /* 释放本流相关配置 */
	.digital_mute = wm8960_mute,           /* DAC 数字静音，减切换爆音 */
	.set_fmt      = wm8960_set_dai_fmt,    /* I2S / 主从等（与 SAI 对齐） */
	.set_clkdiv   = wm8960_set_dai_clkdiv, /* 各类分频寄存器 */
	.set_pll      = wm8960_set_dai_pll,    /* 片内 PLL */
	.set_sysclk   = wm8960_set_dai_sysclk, /* 系统时钟源选择 */
};
```

模拟路由、音量等不在这份 `dai_ops` 里，而在 codec 驱动 / DAPM（`wm8960_probe` 等）；`audio-routing` 由 Machine 挂到这些 widget 名上。

### 6.4 Platform

DTS **没有**单独的 `imx-pcm` 节点；`sound` 也不写 `dmas`。DMA 写在 CPU DAI 设备上（`imx6ull.dtsi` 的 `&sai2`）：

```txt
dma-names = "rx", "tx";
dmas = <&sdma 37 24 0>, <&sdma 38 24 0>;
```

Platform 在 `fsl_sai_probe` 末尾、与 CPU DAI **同一次 probe、同一个 `pdev->dev`** 上注册——容易看成「合在一层」，其实是另一次注册：

```c
if (sai->soc->imx)
        return imx_pcm_platform_register(&pdev->dev);
```

```c
int imx_pcm_platform_register(struct device *dev)
{
        return devm_snd_soc_register_platform(dev, &imx_soc_platform);
}
```

`imx_soc_platform`（`imx-pcm-dma-v2.c`）提供 PCM ops：`open` 时按 CPU DAI 填好的 `chan_name`（`"rx"` / `"tx"`）对 **该 SAI 设备** `dma_request_slave_channel()`，再配置 SDMA、管环形缓冲与 period。FIFO 地址等仍由 `fsl_sai` 的 `dma_params` 提供。内核如何挂进全局表见 [6.5](#65-内核如何管理这三层)。

分工一句话：**通道描述挂在 SAI（外设）上；搬数与 PCM 生命周期由 Platform 做。** `dai_link` 里仍是 CPU DAI 与 Platform 两项并列。

### 6.5 内核如何管理这三层

这里的「三层」指 `dai_link` 上的 **CPU DAI、Codec、Platform**（Machine 是 `snd_soc_card`，另论）。注册入口不同，ASoC core（`sound/soc/soc-core.c`）用几张链表把运行时对象管起来，绑卡时再按设备和名字匹配。

| 层 | 注册入口（本板） | 运行时对象 | core 如何挂链 |
|----|------------------|------------|---------------|
| **CPU DAI** | `snd_soc_register_component`（`fsl_sai`） | `snd_soc_dai` | `soc_add_dai`：`list_add` 到所属 **`component->dai_list`**；component 本身在全局 **`component_list`** |
| **Codec** | `snd_soc_register_codec`（`wm8960`） | `snd_soc_codec` + Codec DAI | codec 进全局 **`codec_list`**；其 DAI 同样经 `soc_add_dai` 挂到 **`codec->component.dai_list`** |
| **Platform** | `snd_soc_register_platform`（`imx_pcm_platform_register`） | `snd_soc_platform` | `snd_soc_add_platform`：内嵌 component 进 **`component_list`**，再 `list_add` 到全局 **`platform_list`** |

三层注册调用栈（本板路径）：

```text
CPU DAI
  fsl_sai_probe
    → devm_snd_soc_register_component          /* soc-devres.c */
        → snd_soc_register_component           /* soc-core.c */
            → snd_soc_component_initialize
            → snd_soc_register_dais
            │     → soc_add_dai
            │           → list_add(&dai->list, &component->dai_list)
            │           → component->num_dai++
            → snd_soc_component_add
                  → list_add(&component->list, &component_list)

Codec
  wm8960_i2c_probe
    → snd_soc_register_codec                   /* soc-core.c */
        → snd_soc_component_initialize（codec->component）
        → snd_soc_register_dais
        │     → soc_add_dai
        │           → list_add(..., &codec->component.dai_list)
        → snd_soc_component_add_unlocked
        → list_add(&codec->list, &codec_list)

Platform
  fsl_sai_probe
    → imx_pcm_platform_register                /* imx-pcm-dma-v2.c */
        → devm_snd_soc_register_platform       /* soc-devres.c */
            → snd_soc_register_platform        /* soc-core.c */
                → snd_soc_add_platform
                      → snd_soc_component_initialize（platform->component）
                      → snd_soc_component_add_unlocked → component_list
                      → list_add(&platform->list, &platform_list)
```

要点：

- **DAI 不单独一张全局「裸 DAI 表」**：挂在所属 component 的 `dai_list` 上；CPU 侧宿主是 SAI component，Codec 侧宿主是 codec component。
- **Platform / Codec 另有专用全局表**（`platform_list` / `codec_list`），方便按设备查找。
- Machine 的 `snd_soc_register_card` → `snd_soc_instantiate_card` 再按 `dai_link` 匹配三层，填入 `rtd`（详见 [6.6](#66-绑卡soc_bind_dai_link-与-rtd)）。

```text
注册阶段
  fsl_sai     → component_list + component.dai_list（CPU DAI）
              → platform_list（同 pdev 上的 Platform）
  wm8960      → codec_list + component.dai_list（Codec DAI）
绑卡阶段
  imx-wm8960  → snd_soc_register_card → instantiate → soc_bind_dai_link（见 6.6）
```

### 6.6 绑卡：`soc_bind_dai_link` 与 `rtd`

三层注册进链表之后，Machine 调用 `devm_snd_soc_register_card` → `snd_soc_register_card` → **`snd_soc_instantiate_card`**。真正「把四层接到一条路上」的第一步，就是按 `num_links` 循环绑定：

```c
/* snd_soc_instantiate_card */
for (i = 0; i < card->num_links; i++) {
        ret = soc_bind_dai_link(card, &card->dai_link[i]);
        if (ret != 0)
                goto base_error;
}
```

**一条 `dai_link` 对应一个 `rtd`（`struct snd_soc_pcm_runtime`）**。`rtd` 是该 link 的运行时上下文：挂上已匹配的 `cpu_dai` / `codec_dai` / `platform`，以及稍后创建的 `snd_pcm`；PCM 回调经 `rtd` 找到各层，而不是临时满世界搜驱动。

本板 `imx_wm8960_probe` 填好的 `HiFi` 直连（`imx_wm8960_dai[0]`）要点：

| `dai_link` 字段 | 本板取值 | 绑定时用途 |
|-----------------|----------|------------|
| `cpu_dai_name` | SAI 的 `dev_name` | 找 CPU DAI |
| `platform_of_node` | `cpu_np`（即 `&sai2`） | 在 `platform_list` 里匹配 Platform（与 SAI 同设备） |
| `codec_of_node` | `codec_np` | 找 Codec 侧 DAI |
| `codec_dai_name` | `"wm8960-hifi"` | 与 `wm8960_dai.name` 对齐 |

本文只讨论 `HiFi` 这条直连：`num_links = 1`，绑定一次即可。

`soc_bind_dai_link` 对单条 link 做的事：

```text
soc_bind_dai_link(card, dai_link)
  │
  ├─ 已绑定则返回
  ├─ soc_new_pcm_runtime → 分配 rtd
  ├─ snd_soc_find_dai（CPU）     → rtd->cpu_dai
  ├─ snd_soc_find_dai（各 Codec） → rtd->codec_dais[] / codec_dai / codec
  ├─ 遍历 platform_list
  │     按 platform_of_node（或名字）匹配 → rtd->platform
  └─ soc_add_pcm_runtime
        → list_add_tail(&rtd->list, &card->rtd_list)
```

任一层尚未注册，返回 **`-EPROBE_DEFER`**：释放本次 `rtd`，Machine probe 延后重试——这与 §7 里「Codec / SAI 未就绪则 deferred」是同一机制。绑成功后，`instantiate_card` 还会继续 probe 各 component、建 PCM 等；那是后续步骤，本节只盯「匹配进 `rtd`」这一环。

---

## 7. Probe 顺序

```text
开机 OF 枚举
  │
  ├─ i2c2 + wm8960@1a
  │     wm8960_i2c_probe
  │       → snd_soc_register_codec（DAI 名 wm8960-hifi）
  │
  ├─ sai@…（SAI2）
  │     fsl_sai_probe
  │       → snd_soc_register_component（CPU DAI）
  │       → imx_pcm_platform_register（Platform）
  │
  └─ platform「sound」（imx-wm8960）
        imx_wm8960_probe
          → 解析 cpu-dai / audio-codec / routing
          → snd_soc_register_card（wm8960-audio）
               → instantiate_card → soc_bind_dai_link（见 6.6）
```

Machine 若早于 Codec / SAI 就绪，`soc_bind_dai_link` 返回 `-EPROBE_DEFER`，属正常现象。

---

## 8. 运行时数据走哪几层

播放、录音时 PCM 数据不经过 Machine。具体怎么走，见 [播放路径](/analysis/kernel/sound/imx6ull-audio-playback-flow)、[录音路径](/analysis/kernel/sound/imx6ull-audio-capture-flow)。

---

## 9. 术语澄清

| 说法 | 含义 |
|------|------|
| **Platform** | ASoC 的 PCM / DMA 层，不是「开发板平台」 |
| **CPU DAI** | SoC 侧数字接口驱动，不是 ARM 应用 CPU |
| **dai_link** | Machine 里「CPU DAI ↔ Codec（+ Platform）」的一条连接 |
| **Component** | 较新框架里对 DAI / Codec / Platform 的统一抽象；本 BSP 代码仍多见经典四分法 |

---

## 10. 小结

- ASoC 经典 **四层**：Machine（组卡）、Platform（PCM/DMA）、CPU DAI（数字接口）、Codec（编解码与模拟路由）。
- 本板对应：`imx-wm8960.c` / `imx-pcm-dma-v2.c` / `fsl_sai.c` / `wm8960.c`。
- DTS 用 `sound` 的 phandle 把 SAI 与 WM8960 绑在一起；Platform 挂在 SAI 上注册，无单独节点。
- Machine 负责板级策略与路由；PCM 数据不经过 Machine（见 [§8](#8-运行时数据走哪几层)）。

---

## 附录 A 源码索引

| 文件 | 层 / 角色 |
|------|-----------|
| `sound/soc/fsl/imx-wm8960.c` | Machine |
| `sound/soc/fsl/imx-pcm-dma-v2.c` | Platform（本板 SAI） |
| `sound/soc/fsl/fsl_sai.c` | CPU DAI |
| `sound/soc/codecs/wm8960.c` | Codec |
| `arch/arm/boot/dts/100ask_imx6ull-14x14.dts` | 板级 `sound` / `wm8960` / `&sai2` |
| `arch/arm/boot/dts/imx6ull.dtsi` | SAI 控制器定义 |
| `Documentation/devicetree/bindings/sound/imx-audio-wm8960.txt` | Machine 绑定说明 |
| `Documentation/devicetree/bindings/sound/fsl-sai.txt` | SAI 绑定说明 |

---

## 附录 B 要点速记

1. 四层职责一句话：组卡 / 搬数 / 数字口 / 编解码。  
2. Pro 板：Machine=`imx-wm8960`，Platform=`imx-pcm-dma-v2`，CPU DAI=`fsl_sai`（SAI2），Codec=`wm8960`。  
3. Platform 无 DTS 节点；随 SAI probe 注册。  
4. `codec-master` + SAI2 MCLK（约 12.288 MHz）是本板时钟策略。  
5. mini 板可能是 MQS + SAI1，与本文 WM8960 路径不同。
