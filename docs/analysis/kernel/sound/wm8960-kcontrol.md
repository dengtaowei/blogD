---
homeTag: Sound · ALSA
homeTitle: WM8960 kcontrol 构造与使用
homeDesc: tinymix 里那些音量名字是怎么来的
sidebarOrder: 5
sidebarTitle: WM8960 kcontrol
date: 2026-08-03
---

# WM8960 kcontrol 构造与使用

> **平台**：100ask i.MX6ULL Pro
> **内核**：NXP BSP **Linux 4.9.88**
> **本文**：本板 Codec 侧 mixer 控制项如何用 `SOC_*` 宏构造、如何挂到声卡，以及用户态读写时内核怎么走到寄存器

---

## 目录

- [1. 本文要回答什么](#1-本文要回答什么)
- [2. kcontrol 在声卡里扮演什么角色](#2-kcontrol-在声卡里扮演什么角色)
- [3. 如何构造：从宏到 snd_kcontrol_new](#3-如何构造从宏到-snd_kcontrol_new)
- [4. 如何注册：挂进 card→controlC0](#4-如何注册挂进-cardcontrolc0)
- [5. 如何使用：用户态到寄存器](#5-如何使用用户态到寄存器)
- [6. DAPM 带出的控制项](#6-dapm-带出的控制项)
- [7. 小结](#7-小结)
- [附录 A 源码索引](#附录-a-源码索引)

---

## 1. 本文要回答什么

> **WM8960 驱动里那些「Headphone Playback Volume」是怎么定义出来的？`tinymix` / `amixer` 改音量时，内核经过哪些函数写到 Codec 寄存器？**

范围限定 **Codec 驱动 `wm8960.c` 的 kcontrol**（含随 DAPM mixer 挂上的开关）。

---

## 2. kcontrol 在声卡里扮演什么角色

ALSA 把「可调参数」抽象成 **kcontrol**（kernel control）：

| 对象 | 含义 |
|------|------|
| `snd_kcontrol_new` | 驱动里的**静态模板**（名字、`info`/`get`/`put`、寄存器描述） |
| `snd_kcontrol` | 注册到 `snd_card` 后的**运行时实例** |
| `/dev/snd/controlC0` | 用户态枚举、读、写这些实例的入口 |

WM8960 上，音量 / 静音 / ALC 等几乎都是 Codec 用 `SOC_*` 宏填好模板，再在 `wm8960_probe` 里一次性加入声卡。

---

## 3. 如何构造：从宏到 `snd_kcontrol_new`

### 3.1 控制表

主表在 `sound/soc/codecs/wm8960.c`：

```c
static const struct snd_kcontrol_new wm8960_snd_controls[] = {
	SOC_DOUBLE_R_TLV("Capture Volume", WM8960_LINVOL, WM8960_RINVOL,
			 0, 63, 0, inpga_tlv),
	SOC_DOUBLE_R_TLV("Playback Volume", WM8960_LDAC, WM8960_RDAC,
			 0, 255, 0, dac_tlv),
	SOC_DOUBLE_R_TLV("Headphone Playback Volume", WM8960_LOUT1, WM8960_ROUT1,
			 0, 127, 0, out_tlv),
	/* … ALC / 3D / Boost / Switch … */
	SOC_SINGLE_BOOL_EXT("DAC Deemphasis Switch", 0,
			    wm8960_get_deemph, wm8960_put_deemph),
};
```

每个宏展开成一个 `struct snd_kcontrol_new` 初值。

### 3.2 以 `SOC_DOUBLE_R_TLV` 为例

宏（`include/sound/soc.h`）展开后大致是：

| 字段 | 作用 |
|------|------|
| `.iface` | `SNDRV_CTL_ELEM_IFACE_MIXER` |
| `.name` | 用户可见名，如 `"Headphone Playback Volume"` |
| `.access` | 可读可写，并带 `TLV_READ` |
| `.tlv.p` | dB 换算表（如 `out_tlv`） |
| `.info` / `.get` / `.put` | 通用 `snd_soc_info_volsw` / `get_volsw` / `put_volsw` |
| `.private_value` | 打包成 `soc_mixer_control`：左右寄存器、移位、`max`、是否 invert |

换句话说：定义控制项时，一般不用自己写读写函数；只要用宏填好「读哪个寄存器、从哪一位开始、最大多少」，ASoC 自带的音量回调（`get_volsw` / `put_volsw`）就会按这些信息去改芯片寄存器。

### 3.3 常见宏对照（本驱动用到的）

| 宏 | 典型用途 |
|----|----------|
| `SOC_SINGLE` | 单寄存器一位开关或单值 |
| `SOC_SINGLE_TLV` | 单通道音量 + TLV |
| `SOC_DOUBLE_R` / `SOC_DOUBLE_R_TLV` | 左右各一寄存器（本板音量主力） |
| `SOC_ENUM` | 枚举（极性、ALC 模式等） |
| `SOC_SINGLE_BOOL_EXT` | 自定义 get/put（如 Deemphasis） |

另外还有一类宏 `SOC_DAPM_SINGLE`：它不写在上面的 `wm8960_snd_controls[]` 主表里，而是挂在 DAPM 混音器的开关数组上（见 §6）。注册路径不同，但 `tinymix` / `amixer` 里同样能看到这些开关。

### 3.4 `private_value` 与 get/put

`snd_soc_get_volsw` / `snd_soc_put_volsw` 会：

1. 把 `kcontrol->private_value` 还原成 `struct soc_mixer_control`；
2. `snd_soc_component` 读写 Codec 寄存器（经 regmap / I2C）；
3. 把硬件值与用户态 `snd_ctl_elem_value` 的 `integer.value[]` 互转（含 invert、立体声第二通道）。

自定义项（如 Deemphasis）则直接指定自己的 `get`/`put`，不再走 volsw。

---

## 4. 如何注册：挂进 card→`controlC0`

绑卡成功、Codec 的 ASoC probe 跑起来后，`wm8960_probe` 末尾：

```c
snd_soc_add_codec_controls(codec, wm8960_snd_controls,
			   ARRAY_SIZE(wm8960_snd_controls));
wm8960_add_widgets(codec);
```

调用关系：

```text
wm8960_probe
  → snd_soc_add_codec_controls
      → snd_soc_add_component_controls
          → snd_soc_add_controls
                for each snd_kcontrol_new:
                  → snd_soc_cnew（基于模板建 snd_kcontrol）
                  → snd_ctl_add(card, kctl)   // 挂到 snd_card->controls
  → wm8960_add_widgets
      → 注册 DAPM widget；mixer 上的 SOC_DAPM_SINGLE 一并成为 kcontrol
```

之后用户打开 **`/dev/snd/controlC0`**，枚举到的就是这张卡上已 `snd_ctl_add` 的全部项（含 Codec 主表 + DAPM 路由开关等）。

---

## 5. 如何使用：用户态到寄存器

### 5.1 用户态

常见工具：

```bash
tinymix                  # 列出 numid / 名字 / 当前值
tinymix "Headphone Playback Volume" 100 100
amixer -c 0 sset 'Headphone' 80%
```

底层都是对 `controlC0` 发 ioctl（`ELEM_LIST` / `ELEM_INFO` / `ELEM_READ` / `ELEM_WRITE`，以及可选 `TLV_READ`）。

### 5.2 内核读写路径

以写音量为例：

```text
ioctl(controlC0, SNDRV_CTL_IOCTL_ELEM_WRITE)
  → snd_ctl_elem_write_user                 // sound/core/control.c
      → snd_ctl_elem_write
          → snd_ctl_find_id(card, &id)      // 按名字 / numid 找 snd_kcontrol
          → kctl->put(kctl, ucontrol)
                → 通常 snd_soc_put_volsw
                    → 解 private_value → 写 WM8960 左右寄存器
          → 若 put 返回 >0：snd_ctl_notify（值变更事件）
```

读音量对称：发 `ELEM_READ`，走到该控件的 `get`（一般是 `snd_soc_get_volsw`），从寄存器读出当前值，填回给用户态。

`tinymix` 列出「范围多大、是整数还是开关」时，发的是 `ELEM_INFO`，走控件的 `info` 回调。若要按分贝显示，再走 TLV 相关 ioctl，用表里的 `.tlv` 把整数换算成 dB。

---

## 6. DAPM 带出的控制项

除 `wm8960_snd_controls[]` 外，`wm8960_add_widgets` 会注册诸如：

```c
SND_SOC_DAPM_MIXER("Left Output Mixer", ...,
		   wm8960_loutput_mixer, ARRAY_SIZE(wm8960_loutput_mixer));
```

其中 `wm8960_loutput_mixer[]` 使用 `SOC_DAPM_SINGLE("PCM Playback Switch", …)` 等。这些开关也会出现在 `tinymix` 列表里，用于选择模拟混音支路是否接通。

理解上可以分成两类：

| 类型 | 来源 | 例子 |
|------|------|------|
| 静态 mixer 表 | `wm8960_snd_controls[]` | Headphone / Speaker / Capture Volume |
| DAPM mixer 控件 | widget 附带的 `SOC_DAPM_SINGLE` | `Left Output Mixer PCM Playback Switch` |

构造手段仍是 `snd_kcontrol_new` + 注册进同一张 `snd_card`。

---

## 7. 小结

- **构造**：`SOC_*` 宏生成 `snd_kcontrol_new`；寄存器与范围进 `private_value`，多数用通用 volsw 的 `info/get/put`。  
- **注册**：`wm8960_probe` → `snd_soc_add_codec_controls` → `snd_ctl_add`；DAPM widget 再补路由类控制。  
- **使用**：用户态经 `controlC0` ioctl；内核 `find_id` 后调 `get`/`put`，最终读写 WM8960 寄存器。

---

## 附录 A 源码索引

| 文件 | 内容 |
|------|------|
| `sound/soc/codecs/wm8960.c` | `wm8960_snd_controls[]`、DAPM mixer、`wm8960_probe` |
| `include/sound/soc.h` | `SOC_SINGLE` / `SOC_DOUBLE_R_TLV` 等宏 |
| `sound/soc/soc-ops.c` | `snd_soc_get_volsw` / `snd_soc_put_volsw` |
| `sound/soc/soc-core.c` | `snd_soc_add_codec_controls` / `snd_soc_add_controls` / `snd_soc_cnew` |
| `sound/core/control.c` | `snd_ctl_add`、`ELEM_READ` / `ELEM_WRITE` |
| `include/sound/control.h` | `snd_kcontrol` / `snd_kcontrol_new` |
