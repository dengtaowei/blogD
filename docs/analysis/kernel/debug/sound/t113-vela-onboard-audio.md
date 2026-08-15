---
homeTag: 调试 · Sound
homeTitle: T113 Vela 板载麦与喇叭
homeDesc: DMIC 脚复用、gpio-spk、Headphone 与 HpSpeaker
sidebarOrder: 1
sidebarTitle: T113 Vela 麦与喇叭
date: 2026-08-15
---

# T113 Vela：板载麦与喇叭通路对齐

> **环境**：百问网 T113s3 Industrial / Vela DevKit · Tina · Linux 5.4 · 原理图 `T113S3_Vela_DevKit_V11`  
> **关联**：[ASoC 四层](/analysis/kernel/sound/imx6ull-asoc-layers) · [播放路径](/analysis/kernel/sound/imx6ull-audio-playback-flow) · [DAPM widget 上电](/analysis/kernel/sound/dapm-widget-power)  
> **状态**：已按原理图完成板级 `board.dts` 配置，播录可用

---

## 现象

| 操作 | 可观测结果 |
|------|------------|
| `arecord -D hw:snddmic …` | 设备可打开；WAV 样点能量为 0 |
| `aplay -D hw:audiocodec …` | 进度推进；喇叭无输出 |
| `amixer … sset HpSpeaker on` 后播放 | 仍可能无输出 |
| 再关闭 `Headphone` 后播放 | 喇叭无输出 |

预期：板载 MSM261 有能量；板载喇叭有声。

---

## 环境

| 项 | 值 |
|----|-----|
| 内核 | Tina SDK · Linux 5.4 |
| 板级 DTS | `device/config/chips/t113/configs/100ask/linux-5.4/board.dts` |
| SoC DTS | `arch/arm/boot/dts/sun8iw20p1.dtsi` |
| 硬件 / 拓扑 | 见下节；复现频率：必现（脚 / 通路未对齐时） |

本板相对站内 i.MX6ULL + WM8960 文：录、放分属两张 ALSA 声卡。

| 方向 | ALSA | 硬件 |
|------|------|------|
| 板载麦 | `hw:snddmic` | MSM261（PDM）→ DMIC：`PD20` CLK、`PD19` DATA0、`PD18` DATA1 |
| 喇叭 | `hw:audiocodec` | 片内 DAC → `HPOUTL/R`（模拟）→ AW8010 → SPK；`AMP_EN`=`PD17` → `SHUTDOWN#`（高电平工作） |

手册：[MSM261](https://github.com/dengtaowei/blogD/blob/main/refs/datasheets/MSM261D4030H1CPM_Datasheet.pdf) · [AW8010A](https://github.com/dengtaowei/blogD/blob/main/refs/datasheets/AW8010A.pdf)

AW8010 侧为模拟输入 + GPIO 使能。PCM 在 SoC 内经 DAC 转为模拟后再进功放。

```text
麦:   arecord → snddmic → sunxi-dmic → PDM @ PD18~20
喇叭: aplay  → audiocodec → sun8iw20-codec DAC → HPOUT → AW8010 (PD17)
```

分层含义见 [ASoC 四层](/analysis/kernel/sound/imx6ull-asoc-layers)。本板录 / 放对应关系如下（路径均相对 `sound/soc/`）。

| 层 | 播放（`audiocodec`） | 录音（`snddmic`） |
|----|----------------------|-------------------|
| **Machine** | `sunxi/sun8iw20-sndcodec.c`（`sndcodec`） | `sunxi/sunxi-simple-card.c`（`sounddmic`） |
| **Platform（DMA）** | `sunxi/sunxi-dummy-cpudai.c` + `sunxi/sunxi-pcm.*`（DMA 7） | `sunxi/sunxi-dmic.c` 内注册 Platform + `sunxi/sunxi-pcm.*`（DMA 8） |
| **CPU DAI** | `sunxi/sunxi-dummy-cpudai.c`（对接片内 codec FIFO） | `sunxi/sunxi-dmic.c`（DMIC 控制器） |
| **Codec** | `sunxi/sun8iw20-codec.c`（片内 DAC / HPOUT） | `codecs/dmic.c`（占位 codec，无片外数字 codec 芯片） |
| **片外器件** | AW8010（模拟功放，`gpio-spk`=PD17） | MSM261 ×2（PDM，PD20/19/18） |

SDK 中 RGB LCD 默认也可占用 **PD18～PD20**，与 DMIC 同脚；板载麦要用这些脚时，需在设备树中让显示子系统释放该组脚（或改用其它显示接口）。

---

## 复现步骤

1. 使用未按原理图改脚的板级镜像上电。  
2. `arecord -D hw:snddmic -c 2 -r 16000 -f S16_LE -d 3 /tmp/dmic.wav`，检查文件能量。  
3. `aplay -D hw:audiocodec <48k-wav>`，听喇叭。  
4. `amixer -c audiocodec sset HpSpeaker on` 后重复播放；再 `sset Headphone off` 后播放，对照有无输出。  
5. `cat /sys/kernel/debug/pinctrl/*/pinmux-pins | grep -E 'PD17|PD18|PD19|PD20'`，对照复用功能。

---

## 根因

三处条件需同时满足原理图与驱动约定。

### 1. DMIC 脚与显示占用

原理图要求 DMIC 在 PD 组；板级 pinctrl 与节点状态应对齐为：

| 项 | 应配置为 |
|----|----------|
| `dmic_pins_a` / `dmic_pins_b` | `pins = "PD20", "PD19", "PD18"`，`function = "dmic"`（sleep 侧可为 `io_disabled`） |
| `&dmic` / `&sounddmic` | `status = "okay"`（dtsi 默认可为 `disabled`，由板级打开） |
| 与 DMIC 争用 PD18～20 的 LCD / disp | 释放该组脚，例如 `lcd_used = <0>`、`disp_init_enable = <0>`，或改到不占用 PD18～20 的接口 |

脚与原理图一致后，PDM 比特流进入 DMIC 控制器，录到的 WAV 才有能量。

### 2. 功放使能：`gpio-spk`

原理图 `AMP_EN` = **PD17**，接 AW8010 `SHUTDOWN#`（高电平工作）。板级 `&codec`：

```txt
pa_level  = <0x01>;
gpio-spk  = <&pio PD 17 GPIO_ACTIVE_HIGH>;
```

`sun8iw20-codec.c` 的 `sunxi_codec_parse_params()` 通过 `of_get_named_gpio(..., "gpio-spk", 0)` 解析；`HpSpeaker` DAPM 上电时输出 `pa_level`。扩展座 **PE11** 与该使能脚无关。

### 3. 播放通路：`Headphone` 与 `HpSpeaker`

Machine（`sun8iw20-sndcodec.c`）初始化会对 `Headphone`、`HpSpeaker`（及 HPOUT 相关 pin）做 `disable_pin`。板载喇叭对应的用户态开关：

| 控件 | 驱动回调 | 作用 |
|------|----------|------|
| `Headphone` | `sunxi_codec_headphone_event` | 打开 HPOUT 模拟驱动（如 `HP_DRVEN` / `HP_DRVOUTEN` 等） |
| `HpSpeaker` | `sunxi_codec_hpspeaker_event` | 按 `gpio-spk` 使能 AW8010 |

两条都打开后，DAC → HPOUT → 功放 → 喇叭完整。

---

## 关联源码

- `sound/soc/sunxi/sun8iw20-codec.c` — `sunxi_codec_parse_params()`（`gpio-spk`）；`sunxi_codec_headphone_event` / `sunxi_codec_hpspeaker_event`
- `sound/soc/sunxi/sun8iw20-sndcodec.c` — Machine；`snd_soc_dapm_disable_pin`
- `sound/soc/sunxi/sunxi-dmic.c` — DMIC CPU DAI / DMA RX
- `sound/soc/codecs/dmic.c` — DMIC 占位 codec
- `sound/soc/sunxi/sunxi-simple-card.c` — `sounddmic` Machine
- `arch/arm/boot/dts/sun8iw20p1.dtsi` — `codec` / `dmic` / `sounddmic` 节点
- 板级 `board.dts` — pinctrl、`gpio-spk`、LCD / DMIC 脚占用

与流程文对应关系：[ASoC 四层](/analysis/kernel/sound/imx6ull-asoc-layers)（Machine / Codec）；[DAPM widget 上电](/analysis/kernel/sound/dapm-widget-power)（pin switch 如何参与供电）。

---

## 结论与备忘

板级对齐后的自测：

```bash
amixer -c audiocodec sset Headphone on
amixer -c audiocodec sset HpSpeaker on
aplay -D hw:audiocodec /tmp/out48.wav

arecord -D hw:snddmic -c 2 -r 16000 -f S16_LE -d 5 /tmp/dmic.wav

cat /sys/kernel/debug/pinctrl/*/pinmux-pins | grep -E 'PD17|PD18|PD19|PD20'
```

- 录音时 PD18～20 功能为 `dmic`；已配置 `gpio-spk` 时，打开 `HpSpeaker` 即由驱动拉 PD17。  
- 播放采样率优先 **48 kHz / 16 kHz**（本板 44.1 kHz 路径易异常，可另文跟 PLL）。  
- 恢复 LCD 时需重新规划 PD18～20，避免与 DMIC 并行占用同一组脚。
