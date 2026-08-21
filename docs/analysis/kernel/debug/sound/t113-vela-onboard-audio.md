---
homeTag: 调试 · Sound
homeTitle: T113 Vela 板载麦与喇叭
homeDesc: 先对原理图，再对齐 DMIC 脚与 gpio-spk
sidebarOrder: 1
sidebarTitle: T113 Vela 麦与喇叭
date: 2026-08-15
---

# T113 Vela：板载麦与喇叭通路对齐

> **环境**：百问网 T113S3 Vela DevKit · Tina Linux 5.4 · 原理图 `T113S3_Vela_DevKit_V11` · 板级目录 `100ask`  
> **关联**：[ASoC 四层](/analysis/kernel/sound/imx6ull-asoc-layers) · [播放路径](/analysis/kernel/sound/imx6ull-audio-playback-flow) · [DAPM widget 上电](/analysis/kernel/sound/dapm-widget-power)  
> **状态**：已按原理图完成板级 `board.dts` 配置，播录可用

---

## 目录

- [1. 原理图：板载麦与喇叭](#1-原理图板载麦与喇叭)
  - [1.1 板载麦：MSM261 ×2（PDM）](#11-板载麦msm261--2pdm)
  - [1.2 喇叭：HPOUTL → AW8010](#12-喇叭hpoutl--aw8010)
  - [1.3 脚位速记](#13-脚位速记)
- [2. 软件分析](#2-软件分析)
  - [2.1 录音：`snddmic`](#21-录音snddmic)
  - [2.2 播放：`audiocodec`](#22-播放audiocodec)
- [3. 板级修改](#3-板级修改)
  - [3.1 先把 PD17～20 从 RGB 屏上释放](#31-先把-pd1720-从-rgb-屏上释放)
  - [3.2 功放使能脚：`gpio-spk`](#32-功放使能脚gpio-spk)
  - [3.3 播放还要开两个开关](#33-播放还要开两个开关)
  - [3.4 改了哪个文件、改成什么样](#34-改了哪个文件改成什么样)
- [4. 自测](#4-自测)
- [附录 A 源码索引](#附录-a-源码索引)

---

## 1. 原理图：板载麦与喇叭

这块板录音和播放各走一条硬件通路，用户态也落在两张 ALSA 声卡上：录音 `hw:snddmic`，播放 `hw:audiocodec`。

| 方向 | 片外器件 | 接到 SoC 的方式 |
|------|----------|-----------------|
| 录音 | MSM261 ×2（PDM 硅麦） | **DMIC** 口：`CLK` + `DATA0` + `DATA1` |
| 播放 | AW8010（模拟功放）+ 板载喇叭 | 片内 codec **`HPOUTL`**（模拟）→ 功放；GPIO **`AMP_EN`** 使能 |

手册：[MSM261](https://github.com/dengtaowei/blogD/blob/main/refs/datasheets/MSM261D4030H1CPM_Datasheet.pdf) · [AW8010A](https://github.com/dengtaowei/blogD/blob/main/refs/datasheets/AW8010A.pdf)

```text
麦:    MSM261 PDM ──DMIC_CLK/D0/D1──► SoC DMIC ──(转换)──► PCM ──► arecord (hw:snddmic)
喇叭:  aplay (hw:audiocodec) ──► 片内 DAC ──HPOUTL──► AW8010 ──SPK+/−──► 喇叭
                              AMP_EN(PD17) ─────────────► SHUTDOWN#
```

### 1.1 板载麦：MSM261 ×2（PDM）

![敏芯微 MSM261：MIC3 / MIC4 与 DMIC_CLK、DMIC_D0/D1](/files/t113-vela-dmic-msm261.png)

两颗都是 **MSM261D4030H1CPM**（全向、顶部进音、PDM 数字输出），3.3 V 供电。

| 板级位号 | DATA 信号 | 共用时钟 |
|----------|-----------|----------|
| **MIC4** | `DMIC_D0`（经 47 Ω） | `DMIC_CLK` |
| **MIC3** | `DMIC_D1`（经 47 Ω） | 同上 |

手册里 `L/R` 用来选择在哪个时钟边沿驱动 DATA。本板两颗的 `L/R` 都接到 VDD，并且 **各占一根 DATA**（`D0` / `D1`），只共用一根 `CLK`。  
这些信号接到 SoC：**`PD20` = CLK，`PD19` = DATA0，`PD18` = DATA1**。用户态 `arecord -D hw:snddmic -c 2 …` 拿到的是 DMIC 控制器把 PDM 转换后的双声道 PCM。

SDK 默认的 RGB `rgb18` 占用 PD0～PD21，其中就包括这三根脚。要用板载麦，须把显示从这组脚上释放掉。

### 1.2 喇叭：HPOUTL → AW8010

![AW8010：HPOUT 入、AMP_EN 使能、差分出到板载喇叭](/files/t113-vela-spk-aw8010.png)

片内 codec 的 **`HPOUTL`** 经 0 Ω、电容和 `Rin`（图中 47 kΩ）进入 **AW8010AFCR**（`U6`）模拟输入；功放差分输出经磁珠到板载喇叭 `SPK+` / `SPK-`。原理图上 `HPOUTR` 的 0 Ω（`R26`）标为空贴，本板喇叭吃的是左声道模拟。

| 信号 | 接到 | 约定 |
|------|------|------|
| `AMP_EN` | AW8010 `SHUTDOWN#`（经 10 kΩ，另有下拉） | 高电平工作；SoC **`PD17`** |

PCM 到模拟由片内 DAC 完成。软件上还要打开 HPOUT 模拟驱动，并按 `gpio-spk` 拉高 `AMP_EN`（用户态控件是 `Headphone` / `HpSpeaker`，见 §3）。PD17 同属 `rgb18`（LCD D23），释放 RGB 屏时一并让出。

### 1.3 脚位速记

| 功能 | 原理图信号 | SoC 脚 | 软件里对应 |
|------|--------------|--------|------------|
| DMIC 时钟 | `DMIC_CLK` | **PD20** | `dmic` pinctrl |
| DMIC 数据 0 | `DMIC_D0`（MIC4） | **PD19** | 同上 |
| DMIC 数据 1 | `DMIC_D1`（MIC3） | **PD18** | 同上 |
| 功放使能 | `AMP_EN` | **PD17** | `&codec` 的 `gpio-spk` |
| 模拟音频 | `HPOUTL`（`HPOUTR` 空贴） | 片内模拟脚 | codec DAPM（`Headphone`） |

---

## 2. 软件分析

§1 两条硬件通路，在内核里分别注册成两张 ALSA 声卡。分层含义见 [ASoC 四层](/analysis/kernel/sound/imx6ull-asoc-layers)。

### 2.1 录音：`snddmic`

PDM 由 SoC 的 **DMIC 控制器**接收，再转换成 PCM。片外硅麦直接出 PDM，ASoC 用通用的 `codecs/dmic.c` 占位，把卡组起来。

| 层 | 本板文件 / 节点 | 做什么 |
|----|-----------------|--------|
| **Machine** | `sunxi/sunxi-simple-card.c`（`sounddmic`） | 组卡；DTS 里 `simple-audio-card,name = "snddmic"`，只录音 |
| **CPU DAI** | `sunxi/sunxi-dmic.c`（`dmic@…`） | 配 DMIC 时钟与数据脚、启动收数 |
| **Platform** | 同文件内注册 + `sunxi/sunxi-pcm.*`（dtsi：`dmas = <&dma 8>`） | 把 FIFO 里的 PCM 搬进用户缓冲 |
| **Codec** | `codecs/dmic.c`（`dmic_codec`） | 占位，满足 ASoC 组卡 |

录音时数据从麦到用户态：

1. 板上 MSM261 输出 PDM（脚 PD18～20，复用见 §3.1）
2. SoC DMIC 控制器收数、抽成 PCM，放进 FIFO
3. Platform DMA 把 FIFO 拷到用户缓冲
4. `arecord` 从 ALSA PCM 读出

### 2.2 播放：`audiocodec`

播放走片内 Codec：数字 PCM 经 DAC 变成模拟，从 **HPOUTL** 送到 AW8010。AW8010 没有单独的 ASoC Codec 驱动，开关靠 `gpio-spk`（PD17）。

| 层 | 本板文件 / 节点 | 做什么 |
|----|-----------------|--------|
| **Machine** | `sunxi/sun8iw20-sndcodec.c`（`sndcodec`） | 组卡；启动时关掉 `Headphone`、`HpSpeaker` 等 |
| **CPU DAI** | `sunxi/sunxi-dummy-cpudai.c` | 接片内播放 FIFO（本板播放走片内 DAC，不走外置 I2S） |
| **Platform** | 同上 + `sunxi/sunxi-pcm.*`（dtsi：`dmas = <&dma 7>`） | 把用户缓冲里的 PCM 送进 DAC FIFO |
| **Codec** | `sunxi/sun8iw20-codec.c` | DAC、打开/关闭 HPOUT、解析 `gpio-spk` |
| **片外** | AW8010 | 模拟放大；`HpSpeaker` 打开时按 `pa_level` 拉高 PD17 |

播放时数据从用户态到喇叭：

1. `aplay` 把 PCM 写入 ALSA
2. Platform DMA 送到片内 DAC
3. DAC 输出模拟到 **HPOUTL**，再进 AW8010
4. AW8010 推板载喇叭

`aplay` 之外，还要用 `amixer` 打开 `Headphone`（HPOUT）和 `HpSpeaker`（`AMP_EN`），见 §3.2、§3.3。

---

## 3. 板级修改

原理图对上之后，SDK 默认的 `board.dts` 还要对这三处：DMIC 脚、功放使能脚、上电后的两个播放开关。

### 3.1 先把 PD17～20 从 RGB 屏上释放

板载麦用 **PD20 / PD19 / PD18**（时钟、DATA0、DATA1），功放使能用 **PD17**。这四根脚都在 RGB `rgb18` 里（PD18 = LCD CLK，PD19 = DE，PD20 = HSYNC，PD17 = D23），和音频不能同时占用。

麦克风这边：把 `&dmic` 的脚改成 PD 组（**CPU DAI**，`sunxi-dmic.c`）。`100ask` 板级里 `&dmic` / `&sounddmic` 已经是 `okay`，不用再开一遍。  
屏幕这边：关掉 RGB 相关显示，或改用其它显示接口，把 PD17～20 让出来。

板级 DTS 可参考：

| 改什么 | 怎么写 |
|--------|--------|
| `dmic_pins_a` / `dmic_pins_b` | `pins = "PD20", "PD19", "PD18"`，功能选 `dmic`（休眠态用 `io_disabled`） |
| LCD / 显示 | 释放 PD17～20，或改用其它显示接口 |

脚复用成 `dmic` 之后，PDM 才能进控制器，`arecord` 录到的 wav 才有声音。

### 3.2 功放使能脚：`gpio-spk`

原理图上 `AMP_EN` 是 **PD17**，高电平打开 AW8010。  
在 `&codec` 里写上 `gpio-spk`，由 **Codec** 驱动（`sun8iw20-codec.c`）使用：

```txt
pa_level  = <0x01>;
gpio-spk  = <&pio PD 17 GPIO_ACTIVE_HIGH>;
```

之后用 `amixer` 打开 `HpSpeaker` 时，驱动按 `pa_level` 把 PD17 拉高。

### 3.3 播放还要开两个开关

Machine（`sun8iw20-sndcodec.c`）启动时会关掉 `Headphone`、`HpSpeaker`，所以上电后默认没声。  
要用板载喇叭，两个都打开；打开后由 **Codec** 去开 HPOUT，并拉高 `gpio-spk`：

| 控件 | 作用 |
|------|------|
| `Headphone` | 打开片内 HPOUT 模拟输出 |
| `HpSpeaker` | 按 `gpio-spk` 打开 AW8010 |

两个都开：DAC → HPOUTL → 功放 → 喇叭。命令见 §4。

### 3.4 改了哪个文件、改成什么样

板级改动集中在一个文件：

`device/config/chips/t113/configs/100ask/linux-5.4/board.dts`

SDK 默认里，DMIC 脚是 **PB12 / PB11 / PB10**（外加 PE14），对不上本板原理图；`gpio-spk` 注释掉，指向扩展座 **PE11**。按 §1 对齐后，真正要动的是下面几处。

**DMIC 脚（CLK / DATA0 / DATA1 → PD20 / PD19 / PD18）：**

```txt
dmic_pins_a: dmic@0 {
	pins = "PD20", "PD19", "PD18";
	function = "dmic";
	drive-strength = <20>;
	bias-disable;
};

dmic_pins_b: dmic@1 {
	pins = "PD20", "PD19", "PD18";
	allwinner,function = "io_disabled";
	drive-strength = <20>;
	bias-disable;
};
```

`&dmic` / `&sounddmic` 在 SoC `dtsi` 里是 `disabled`，`100ask` 的 `board.dts` 已经写成 `okay`，一般不用再改。`dmic_codec` 在 `dtsi` 里默认就是 okay。

**功放使能（`AMP_EN` = PD17）：** 在 `&codec` 里打开并改成：

```txt
pa_level = <0x01>;
gpio-spk = <&pio PD 17 GPIO_ACTIVE_HIGH>;
```

**给音频让脚：** RGB 占用 PD17～20 时，把对应的 `lcd_used`、`disp_init_enable` 置 `0`，或改用不占这组脚的显示方案（节点名以本板 `board.dts` 里 LCD / disp 段为准）。

§3.3 的 `Headphone` / `HpSpeaker` 不用改 DTS，烧录后在板上用 `amixer` 打开即可（§4）。

---

## 4. 自测

板级按 §3 对齐后：

```bash
amixer -c audiocodec sset Headphone on
amixer -c audiocodec sset HpSpeaker on
aplay -D hw:audiocodec /tmp/out48.wav

arecord -D hw:snddmic -c 2 -r 16000 -f S16_LE -d 5 /tmp/dmic.wav

cat /sys/kernel/debug/pinctrl/*/pinmux-pins | grep -E 'PD17|PD18|PD19|PD20'
```

- 录音时 PD18～20 功能为 `dmic`；已配置 `gpio-spk` 时，打开 `HpSpeaker` 即由驱动拉 PD17。
- 播放采样率优先 **48 kHz / 16 kHz**（本板 44.1 kHz 路径易异常，可另文跟 PLL）。
- 恢复 LCD 时重新规划 PD17～20：麦用 PD18～20，功放使能用 PD17，与 RGB 并行会抢脚。

---

## 附录 A 源码索引

- `sound/soc/sunxi/sun8iw20-codec.c` — `sunxi_codec_parse_params()`（`gpio-spk`）；`sunxi_codec_headphone_event` / `sunxi_codec_hpspeaker_event`
- `sound/soc/sunxi/sun8iw20-sndcodec.c` — Machine；`snd_soc_dapm_disable_pin`
- `sound/soc/sunxi/sunxi-dmic.c` — DMIC CPU DAI / DMA RX
- `sound/soc/codecs/dmic.c` — DMIC 占位 codec
- `sound/soc/sunxi/sunxi-simple-card.c` — `sounddmic` Machine
- `arch/arm/boot/dts/sun8iw20p1.dtsi` — `codec` / `dmic` / `sounddmic` 节点
- 板级 `board.dts` — pinctrl、`gpio-spk`、LCD / DMIC 脚占用

与流程文：[ASoC 四层](/analysis/kernel/sound/imx6ull-asoc-layers)；[DAPM widget 上电](/analysis/kernel/sound/dapm-widget-power)。
