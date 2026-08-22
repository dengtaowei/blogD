---
homeTag: 调试 · Sound
homeTitle: T113 Vela 板载麦与喇叭
homeDesc: 先对原理图，再对齐 DMIC 脚与 gpio-spk
sidebarOrder: 1
sidebarTitle: T113 Vela 麦与喇叭
date: 2026-08-15
---

# T113 Vela：板载麦与喇叭通路调试

> **环境**：百问网 T113S3 Vela DevKit · Tina Linux 5.4 · 原理图 `T113S3_Vela_DevKit_V11` · 板级目录 `100ask`  
> **关联**：[ASoC 四层](/analysis/kernel/sound/imx6ull-asoc-layers) · [播放路径](/analysis/kernel/sound/imx6ull-audio-playback-flow) · [DAPM widget 上电](/analysis/kernel/sound/dapm-widget-power)  
> **状态**：已按原理图完成板级 `board.dts` 配置，播录正常

---

## 目录

- [1. 原理图：板载麦与喇叭](#1-原理图板载麦与喇叭)
  - [1.1 板载麦：MSM261 ×2（PDM）](#11-板载麦msm261-2pdm)
  - [1.2 喇叭：HPOUTL → AW8010](#12-喇叭hpoutl--aw8010)
  - [1.3 脚位总览](#13-脚位总览)
- [2. 调试前的现象](#2-调试前的现象)
- [3. 软件分析](#3-软件分析)
  - [3.1 录音：`snddmic`](#31-录音snddmic)
  - [3.2 播放：`audiocodec`](#32-播放audiocodec)
- [4. 板级修改](#4-板级修改)
  - [4.1 先把 PD17～20 从 RGB 屏上释放](#41-先把-pd1720-从-rgb-屏上释放)
  - [4.2 功放使能脚：`gpio-spk`](#42-功放使能脚gpio-spk)
  - [4.3 代码修改总览](#43-代码修改总览)
- [附录 A 源码索引](#附录-a-源码索引)

---

## 1. 原理图：板载麦与喇叭

这块板录音和播放各走一条硬件通路，所以录音和播放也走不同的 ALSA 声卡：录音 `hw:snddmic`，播放 `hw:audiocodec`。

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

两个麦都是 **MSM261D4030H1CPM**。

| 板级位号 | DATA 信号 | 时钟 |
|----------|-----------|----------|
| **MIC4** | `DMIC_D0`（经 47 Ω） | `DMIC_CLK` |
| **MIC3** | `DMIC_D1`（经 47 Ω） | 同上 |

手册里 `L/R` 用来选择在哪个时钟边沿驱动 DATA。本板两个麦的 `L/R` 都接到 VDD，并且 **各占一根 DATA**（`D0` / `D1`），共用一根 `CLK`。  
这些信号接到 SoC：**`PD20` = CLK，`PD19` = DATA0，`PD18` = DATA1**。

### 1.2 喇叭：HPOUTL → AW8010

![AW8010：HPOUT 入、AMP_EN 使能、差分出到板载喇叭](/files/t113-vela-spk-aw8010.png)

片内 codec 的 **`HPOUTL`** 经 0 Ω、电容和 `Rin`（图中 47 kΩ）进入 **AW8010AFCR**（`U6`）模拟输入；功放差分输出到板载喇叭 `SPK+` / `SPK-`。原理图上 `HPOUTR` 的 0 Ω（`R26`）标为空贴，本板喇叭只接收左声道模拟信号。

| 信号 | 接到 | 约定 |
|------|------|------|
| `AMP_EN` | AW8010 `SHUTDOWN#`（经 10 kΩ，另有下拉） | 高电平工作；SoC **`PD17`** |

PCM 到模拟由片内 DAC 完成。

### 1.3 脚位总览

| 功能 | 原理图信号 | SoC 脚 | 软件里对应 |
|------|--------------|--------|------------|
| DMIC 时钟 | `DMIC_CLK` | **PD20** | `dmic` pinctrl |
| DMIC 数据 0 | `DMIC_D0`（MIC4） | **PD19** | 同上 |
| DMIC 数据 1 | `DMIC_D1`（MIC3） | **PD18** | 同上 |
| 功放使能 | `AMP_EN` | **PD17** | `&codec` 的 `gpio-spk` |
| 模拟音频 | `HPOUTL`（`HPOUTR` 空贴） | 片内模拟脚 | codec DAPM（`Headphone`） |

---

## 2. 调试前的现象

`snddmic` 是我们要调试的录音声卡，使用 `arecord -V stereo` 看不到有声音被录入。

```shell
root@TinaLinux:/# arecord -l
**** List of CAPTURE Hardware Devices ****
card 0: audiocodec [audiocodec], device 0: SUNXI-CODEC 2030000.codec-0 []
  Subdevices: 1/1
  Subdevice #0: subdevice #0
card 1: snddmic [snddmic], device 0: 2031000.dmic-dmic-hifi dmic-hifi-0 []
  Subdevices: 1/1
  Subdevice #0: subdevice #0
root@TinaLinux:/# arecord -D hw:snddmic -c 2 -r 16000 -f S16_LE -V stereo /dev/null
Recording WAVE '/dev/null' : Signed 16 bit Little Endian, Rate 16000 Hz, Stereo
```

audiocodec 是我们要调试的播放声卡，使用 aplay 播放 16 kHz/44.1 kHz/48 kHz 都没有声音。

```shell
root@TinaLinux:/# aplay -l
**** List of PLAYBACK Hardware Devices ****
card 0: audiocodec [audiocodec], device 0: SUNXI-CODEC 2030000.codec-0 []
  Subdevices: 1/1
  Subdevice #0: subdevice #0
root@TinaLinux:/# amixer -c audiocodec sset Headphone on
Simple mixer control 'Headphone',0
  Capabilities: pswitch pswitch-joined
  Playback channels: Mono
  Mono: Playback [on]
root@TinaLinux:/# amixer -c audiocodec sset HpSpeaker on
Simple mixer control 'HpSpeaker',0
  Capabilities: pswitch pswitch-joined
  Playback channels: Mono
  Mono: Playback [on]
root@TinaLinux:/# aplay -D hw:audiocodec /tmp/alsa_16000.wav
Playing WAVE '/tmp/alsa_16000.wav' : Signed 16 bit Little Endian, Rate 16000 Hz, Stereo
^CAborted by signal Interrupt...
```

## 3. 软件分析

§1 两条硬件通路，在内核里分别注册成两张 ALSA 声卡。分层含义见 [ASoC 四层](/analysis/kernel/sound/imx6ull-asoc-layers)。

### 3.1 录音：`snddmic`

PDM 由 SoC 的 **DMIC 控制器**接收，再转换成 PCM。板载麦 MSM261 直接出 PDM，片外没有要配置的 Codec 芯片，ASoC 用通用的 `codecs/dmic.c` 占位，把卡组起来。

| 层 | 本板文件 / 节点 | 做什么 |
|----|-----------------|--------|
| **Machine** | `sunxi/sunxi-simple-card.c`（`sounddmic`） | 组卡；DTS 里 `simple-audio-card,name = "snddmic"`，只录音 |
| **CPU DAI** | `sunxi/sunxi-dmic.c`（`dmic@…`） | 配 DMIC 时钟与数据脚、启动收数 |
| **Platform** | 同文件内注册 + `sunxi/sunxi-pcm.*`（dtsi：`dmas = <&dma 8>`） | 把 FIFO 里的 PCM 搬进用户缓冲 |
| **Codec** | `codecs/dmic.c`（`dmic_codec`） | 占位，满足 ASoC 组卡 |

录音时数据从麦到用户态：

1. 板上 MSM261 输出 PDM
2. SoC DMIC 控制器收数、转换成 PCM，放进 FIFO
3. Platform DMA 把 FIFO 拷到用户缓冲
4. `arecord` 从 ALSA PCM 读出

### 3.2 播放：`audiocodec`

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

---

## 4. 板级修改

### 4.1 先把 PD17～20 从 RGB 屏上释放

对照原理图，首先要对引脚复用进行配置。

板载麦用 **PD20 / PD19 / PD18**（时钟、DATA0、DATA1），功放使能 `AMP_EN` 用 **PD17**。这四根脚都在 RGB `rgb18` 里（PD18 = LCD CLK，PD19 = DE，PD20 = HSYNC，PD17 = D23），和音频不能同时占用。

麦克风这边：把 `&dmic` 的脚改成 PD 组（**CPU DAI**，`sunxi-dmic.c`）。`100ask` 板级里 `&dmic` / `&sounddmic` 已经是 `okay`，不用再开一遍。  
屏幕这边：关掉 RGB 相关显示，或改用其它显示接口，把 PD17～20 让出来。

板级 DTS 可参考：

| 改什么 | 怎么写 |
|--------|--------|
| `dmic_pins_a` / `dmic_pins_b` | `pins = "PD20", "PD19", "PD18"`，功能选 `dmic`（休眠态用 `io_disabled`） |
| LCD / 显示 | 释放 PD17～20，或改用其它显示接口 |

脚复用成 `dmic` 之后，PDM 才能进控制器，`arecord` 录到的 wav 才有声音。

确认录音相关引脚复用正确。

```shell
root@TinaLinux:/# cat /sys/kernel/debug/pinctrl/*/pinmux-pins | grep -E 'PD17|PD18|PD19|PD20'
pin 113 (PD17): UNCLAIMED
pin 114 (PD18): device 2031000.dmic function io_disabled group PD18
pin 115 (PD19): device 2031000.dmic function io_disabled group PD19
pin 116 (PD20): device 2031000.dmic function io_disabled group PD20
```

再录音，可以看到声音能量显示。

```shell
root@TinaLinux:/# arecord -D hw:snddmic -c 2 -r 16000 -f S16_LE -V stereo /dev/null
Recording WAVE '/dev/null' : Signed 16 bit Little Endian, Rate 16000 Hz, Stereo
                       +           33%|33%           +                        ^CAborted by signal Interrupt...
                       +         # 33%|33%#          +                        r
```

但是播放仍然不行，PD17 仍是 UNCLAIMED。

### 4.2 功放使能脚：`gpio-spk`

前面配置了 AMP_EN 的引脚复用，但是没有使能。原理图上 `AMP_EN` 是 **PD17**，高电平打开 AW8010。  
在 `&codec` 里配置 `gpio-spk`，由 **Codec** 驱动（`sun8iw20-codec.c`）使用：

```txt
pa_level  = <0x01>;
gpio-spk  = <&pio PD 17 GPIO_ACTIVE_HIGH>;
```
引脚复用配置成功，但是现在是输入，而且是低电平。

```shell
root@TinaLinux:/# cat /sys/kernel/debug/pinctrl/*/pinmux-pins | grep PD17
pin 113 (PD17): GPIO 2000000.pinctrl:113
root@TinaLinux:/# cat /sys/kernel/debug/gpio | grep 113
 gpio-113 (                    |SPK                 ) in  lo
```

查看源码 `gpio-spk` 是由 HpSpeaker 控件来控制的。

```c
static int sunxi_codec_hpspeaker_event(struct snd_soc_dapm_widget *w,
				struct snd_kcontrol *k, int event)
{
    // ...
    gpio_direction_output(spk_cfg->spk_gpio, 1);
		gpio_set_value(spk_cfg->spk_gpio, spk_cfg->pa_level);
}

/*audio dapm widget */
static const struct snd_soc_dapm_widget sunxi_codec_dapm_widgets[] = {
    // ...
    SND_SOC_DAPM_SPK("HpSpeaker", sunxi_codec_hpspeaker_event),
}
```
设置 HpSpeaker 为开，此时看 gpio-spk 仍然是输入，不用担心，因为此时还没有正式播放。

```shell
root@TinaLinux:/# amixer -c audiocodec sget HpSpeaker
Simple mixer control 'HpSpeaker',0
  Capabilities: pswitch pswitch-joined
  Playback channels: Mono
  Mono: Playback [off]
root@TinaLinux:/# amixer -c audiocodec sset HpSpeaker on
Simple mixer control 'HpSpeaker',0
  Capabilities: pswitch pswitch-joined
  Playback channels: Mono
  Mono: Playback [on]
root@TinaLinux:/# cat /sys/kernel/debug/gpio | grep 113
 gpio-113 (                    |SPK                 ) in  lo 
```

现在再尝试播放，喇叭已经能正常发出声音了。播放的时候查看 gpio-spk，输出高电平。

```shell
root@TinaLinux:/# aplay -D hw:audiocodec /tmp/alsa_16000.wav
```

```shell
root@TinaLinux:/# cat /sys/kernel/debug/gpio | grep 113
 gpio-113 (                    |SPK                 ) out hi
```

### 4.3 代码修改总览

```diff
--- a/device/config/chips/t113/configs/100ask/linux-5.4/board.dts
+++ b/device/config/chips/t113/configs/100ask/linux-5.4/board.dts
@@ -270,15 +270,15 @@
 
 
 	dmic_pins_a: dmic@0 {
-		/* DMIC_PIN: CLK, DATA0, DATA1, DATA2, DATA3*/
-		pins = "PB12", "PB11", "PB10", "PE14", "PB8";
+		/* DMIC_PIN: CLK, DATA0, DATA1 — Vela 板载麦 PD20/PD19/PD18 */
+		pins = "PD20", "PD19", "PD18";
 		function = "dmic";
 		drive-strength = <20>;
 		bias-disable;
 	};
 
 	dmic_pins_b: dmic@1 {
-		pins = "PB12", "PB11", "PB10", "PE14", "PB8";
+		pins = "PD20", "PD19", "PD18";
 		allwinner,function = "io_disabled";
 		drive-strength = <20>;
 		bias-disable;
@@ -1002,7 +1002,7 @@
                    in display.
 ----------------------------------------------------------------------------------*/
 &disp {
-	disp_init_enable         = <1>;
+	disp_init_enable         = <0>;
 	disp_mode                = <0>;
 
 	screen0_output_type      = <1>;
@@ -1271,7 +1271,7 @@
 
 &lcd0 {
 		/* part 1 */
-        lcd_used            = <1>;
+        lcd_used            = <0>;
         lcd_driver_name     = "default_lcd";
 	lcd_backlight	    = <100>;
 
@@ -1408,7 +1408,7 @@
 	pa_level 		= <0x01>;
 	pa_pwr_level 	= <0x01>;
 	pa_msleep_time 	= <0x78>;
-	/* gpio-spk	= <&pio PE 11 GPIO_ACTIVE_LOW>; */
+	gpio-spk		= <&pio PD 17 GPIO_ACTIVE_HIGH>;
 	/* CMA config about */
 	playback_cma	= <128>;
 	capture_cma	= <256>;
```

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
