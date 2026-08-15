---
homeTag: Sound · ALSA
homeTitle: ALSA hw_params 参数协商
homeDesc: 本板成功/失败对照；dump 区间与 rule_rate 离散率
sidebarOrder: 8
sidebarTitle: hw_params 参数协商
date: 2026-08-15
---

# ALSA hw_params 参数协商

> **平台**：100ask i.MX6ULL Pro（`wm8960-audio`，SAI2 + WM8960）  
> **内核**：NXP BSP **Linux 4.9.88**（`sound/core/pcm_native.c`、`pcm_lib.c`、`sound/soc/soc-pcm.c`）；与站点多数 6.8 文路径不同，主线若函数名拆分有出入会另行注明  
> **关联**：[PCM 状态机与 XRUN](/analysis/kernel/sound/alsa-pcm-state-xrun) · [播放路径](/analysis/kernel/sound/imx6ull-audio-playback-flow) · [ASoC 四层](/analysis/kernel/sound/imx6ull-asoc-layers)  
> **本文**：在 `hw:0,0` 上对照一次成功播放与三类协商失败，看合法范围从哪来、`snd_pcm_hw_refine` 如何求交

概念对照：[Writing an ALSA Driver · Constraints](https://www.kernel.org/doc/html/latest/sound/kernel-api/writing-an-alsa-driver.html#constraints)（与 4.9 一致）。

---

## 目录

- [1. 本文要回答什么](#1-本文要回答什么)
- [2. 先看本卡合法范围](#2-先看本卡合法范围)
- [3. 成功：48 kHz 与 hw_params 文件](#3-成功48-khz-与-hw_params-文件)
- [4. 失败：96 kHz / U8 / 8 声道](#4-失败96-khz--u8--8-声道)
- [5. 同一请求，aplay 为何只告警不失败](#5-同一请求aplay-为何只告警不失败)
- [6. open：各层 startup 与能力求交](#6-open各层-startup-与能力求交)
- [7. dump 与 rule：上下界之外还有离散限制](#7-dump-与-rule上下界之外还有离散限制)
  - [7.1 complete：dump 表怎样从 runtime->hw 得来](#71-completedump-表怎样从-runtimehw-得来)
  - [7.2 区间内也会失败：rule 比 dump 更严](#72-区间内也会失败rule-比-dump-更严)
- [8. refine：与 hw_constraints 求交](#8-refine与-hw_constraints-求交)
- [9. 和播放路径文的衔接](#9-和播放路径文的衔接)
- [10. 小结](#10-小结)
- [附录 A 源码索引](#附录-a-源码索引)
- [附录 B 常用 constraint API](#附录-b-常用-constraint-api)

---

## 1. 本文要回答什么

> **应用要 48 kHz / S16_LE / 立体声时，内核凭什么说可行？要 96 kHz 或 U8 时，失败发生在哪一步？**

[播放路径](/analysis/kernel/sound/imx6ull-audio-playback-flow) 从 `hw_params` 往下讲到 DMA / SAI / Codec 时钟。本文只讲**参数协商本身**：合法范围如何表示、如何求交，失败时用户态看到什么。

下文命令均在板端对 **`hw:0,0`（播放，`pcmC0D0p`）** 执行；录音侧求交公式相同，仅 stream 方向不同。

---

## 2. 先看本卡合法范围

```bash
aplay -D hw:0,0 --dump-hw-params /dev/zero
```

板端输出（节选）：

```text
HW Params of device "hw:0,0":
--------------------
ACCESS:  MMAP_INTERLEAVED RW_INTERLEAVED
FORMAT:  S16_LE S24_LE S32_LE
CHANNELS: [1 2]
RATE: [8000 48000]
--------------------
aplay: set_params:1341: Sample format non available
```

读法：

| 行 | 含义 | 内核侧对应 |
|----|------|------------|
| `FORMAT: S16_LE S24_LE S32_LE` | 只能选这些位 | **mask**：位图 AND，不支持的位清掉 |
| `CHANNELS: [1 2]`、`RATE: [8000 48000]` | 只能落在区间内 | **interval**：取重叠段 |

`RATE` 这一行只是上下界，**不是**「8000～48000 内任意 Hz 都行」；离散名单由后面的 rules 再收紧（见 §7）。

末尾报错是因为 `aplay` 对 `/dev/zero` 默认按 **U8**（无符号 8 bit PCM）去设参数，而 U8 不在 FORMAT 列表里——这本身就是一次「mask 求交为空」。真正要用 dump 时，看中间那块表即可。

---

## 3. 成功：48 kHz 与 hw_params 文件

用已推到板端的 48 kHz / S16 / 立体声 WAV（与 dump 中 RATE、FORMAT、CHANNELS 都重叠）：

```bash
aplay -D hw:0,0 -d 3 /tmp/out48.wav &
sleep 0.5
cat /proc/asound/card0/pcm0p/sub0/hw_params
```

`aplay`：

```text
Playing WAVE '/tmp/out48.wav' : Signed 16 bit Little Endian, Rate 48000 Hz, Stereo
```

播放过程中 `hw_params`：

```text
access: RW_INTERLEAVED
format: S16_LE
subformat: STD
channels: 2
rate: 48000 (48000/1)
period_size: 4096
buffer_size: 16384
```

若 `cat` 时已显示 `closed`，说明 PCM 已关掉（`-d` 太短或 `sleep` 太晚）。必须在仍在播放时读。

这一步表示：用户态最终参数与约束求交后仍非空，`SNDRV_PCM_IOCTL_HW_PARAMS` 选定一组唯一值，驱动 `hw_params` 回调已跑完，runtime 写入上表。之后才是 prepare / write，见播放路径文。

---

## 4. 失败：96 kHz / U8 / 8 声道

三类请求都落在 §2 合法范围之外，求交结果为空，用户态拿到 `-EINVAL`（或 alsa-lib 转成的英文提示）。

### 4.1 采样率：`speaker-test` 要 96 kHz

```bash
speaker-test -D hw:0,0 -r 96000 -c 2 -t sine -l 1
```

```text
Stream parameters are 96000Hz, S16_LE, 2 channels
Rate 96000Hz not available for playback: Invalid argument
Setting of hwparams failed: Invalid argument
```

对照 dump：`RATE: [8000 48000]`。96 kHz 与该 interval 无重叠 → **interval 求交失败**。

### 4.2 格式：要 U8（无符号 8 bit）

U8 即 `SNDRV_PCM_FORMAT_U8`：每个样点 1 字节、无符号。本卡只声明有符号 16/24/32 bit。

```bash
aplay -D hw:0,0 -r 48000 -f U8 -c 2 -d 1 /dev/zero
```

```text
aplay: set_params:1341: Sample format non available
Available formats:
- S16_LE
- S24_LE
- S32_LE
```

对照 dump：FORMAT 三位图里没有 U8 → **mask 求交失败**。

### 4.3 声道：要 8 声道

```bash
aplay -D hw:0,0 -c 8 -r 48000 -f S16_LE -d 1 /dev/zero
```

```text
aplay: set_params:1347: Channels count non available
```

对照 dump：`CHANNELS: [1 2]` → 同样是 **interval 求交失败**。

归纳：

```text
应用请求（rate / format / channels …）
        │
        ▼
  与 hw_constraints 求交（mask → interval → rules）
        │
        ├─ 仍有合法组合 → HW_PARAMS 选定唯一值（§3）
        └─ 某一维变成空集 → -EINVAL（本节三条）
```

---

## 5. 同一请求，aplay 为何只告警不失败

再对 96 kHz 用 `aplay`（注意与 §4.1 对比）：

```bash
aplay -D hw:0,0 -r 96000 -f S16_LE -c 2 -d 1 /dev/zero
```

```text
Warning: rate is not accurate (requested = 96000Hz, got = 48000Hz)
         please, try the plug plugin
```

`aplay` 对采样率走的是 **`set_rate_near`**：在合法 interval 里找最接近的值（本卡即 48000），协商**成功**，只是结果不是你写的数字。`speaker-test` 按给定 rate 硬设，96 kHz 直接 `-EINVAL`。

写调试笔记时：要观察「空集失败」用 `speaker-test` 或显式拒绝 near 的路径；要观察「near 收窄」用这条 `aplay`。

---

## 6. open：各层 startup 与能力求交

前面 dump、成功和失败，都已经假定卡上有一张合法范围。这张表是在 **open** 里，把 CPU DAI 与 Codec 的能力求交后写出来的。

本板播放：CPU DAI（`fsl_sai` / SAI2）+ Platform（`imx-pcm-dma-v2`）+ Codec DAI（WM8960）+ Machine（`imx-wm8960`）。从节点进到 ASoC 见 [`/dev/snd` 设备节点 §6](/analysis/kernel/sound/imx6ull-snd-devices#6-pcm-节点-open-与-soc_pcm_open)。与协商相关的顺序：

```text
snd_pcm_open_substream()                            // pcm_native.c
  │
  ├─ snd_pcm_hw_constraints_init()                  // 默认 mask/interval + 规则
  │
  ├─ substream->ops->open → soc_pcm_open()          // soc-pcm.c
  │     ├─ cpu_dai->ops->startup → fsl_sai_startup
  │     │     snd_pcm_hw_constraint_list(RATE, fsl_sai_rates)
  │     │     （本 SoC 还可能 constraint_step(PERIOD_SIZE)）
  │     ├─ platform->ops->open → imx_pcm_open
  │     │     snd_soc_set_runtime_hwparams(…, imx_pcm_hardware)
  │     │     snd_pcm_hw_constraint_integer(PERIODS)
  │     ├─ codec_dai->ops->startup → WM8960 通常无
  │     ├─ dai_link->ops->startup → imx_hifi_startup
  │     │     本板 DTS 有 codec-master → 不挂板级 rate list
  │     │     （无 codec-master 时会 constraint_list(8k/16k/32k/48k)）
  │     ├─ soc_pcm_init_runtime_hw()                // 两端 playback 求交 → runtime->hw
  │     └─ 检查 rates / formats / channels 非空
  │
  └─ snd_pcm_hw_constraints_complete()              // 见 §7.1
```

各层 `startup` / `open` **先**追加 constraint、可先写一份 `runtime->hw`；**然后** `soc_pcm_init_runtime_hw` 用 DAI 驱动里的 `playback` 描述求交；**回到** `open_substream` 再 `complete`。

两端能力声明（节选）：

```c
/* sound/soc/codecs/wm8960.c — 用标准位图列出离散率 */
#define WM8960_RATES SNDRV_PCM_RATE_8000_48000
/* = 8k|11.025k|16k|22.05k|32k|44.1k|48k；formats: S16/S20_3/S24/S32_LE */
.playback = {
	.channels_min = 1, .channels_max = 2,
	.rates = WM8960_RATES, .formats = WM8960_FORMATS,
},

/* sound/soc/fsl/fsl_sai.c — rates 标 KNOT，具体名单不在标准位里 */
.playback = {
	.channels_min = 1, .channels_max = 32,
	.rate_min = 8000, .rate_max = 2822400,   /* 只是上下界，不是任意 Hz */
	.rates = SNDRV_PCM_RATE_KNOT, .formats = FSL_SAI_FORMATS,
},
/* 真正离散名单在 startup 挂上： */
static const unsigned int fsl_sai_rates[] = {
	8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000,
	64000, 88200, 96000, /* … 直到 2822400 */
};
/* fsl_sai_startup → snd_pcm_hw_constraint_list(RATE, fsl_sai_rates) */
```

SAI 的 `KNOT` **不是**「这个范围内随便设」。含义是：标准位概括不了我的集合，请看 `rate_min/max` 和 `constraint_list`。CPU DAI 的采样率限制因此有两层：声明里的上下界 + `fsl_sai_rates[]` 名单。

合并逻辑（4.9.88 `soc_pcm_init_runtime_hw`，本板 `num_codecs == 1`）：

```c
/* 先累加 Codec，再与 CPU DAI 求交 → runtime->hw */
formats &= codec_stream->formats;
rates = snd_pcm_rate_mask_intersect(codec_stream->rates, rates);
/* … channels / rate_min/max 同理取紧 … */
hw->formats = formats & cpu_stream->formats;   /* 若已有初值则 &= */
hw->rates = snd_pcm_rate_mask_intersect(rates, cpu_stream->rates);
snd_pcm_limit_hw_rates(runtime);
```

`snd_pcm_rate_mask_intersect` 对 `KNOT` / `CONTINUOUS` 有单独分支（一侧是这类标志时，结果取另一侧的标准位图）。本板 Codec 是 `WM8960_RATES`、CPU 是 `KNOT`，求交后 **`hw->rates` 只留下 Codec 那几颗标准位**，不再带 `KNOT`。  
注意：这只改了 `runtime->hw.rates` 位图；SAI 在 `startup` 挂上的 `fsl_sai_rates` **list 仍在约束表里**，后面 refine 还要再过一遍名单。

合并后若 `rates` / `formats` 为空或 `channels_min > channels_max`，`open` 失败并 `printk` `No matching rates/formats/channels`。例如把 Codec 的 `rates` 改成与 CPU 完全无交集位，会在 **open** 就失败，到不了 §4 那种已经打开后再设参数的阶段。本节板端失败均发生在 open 已成功之后，dmesg 通常没有该行。

求交结果写在 `runtime->hw` 里。还要经 `constraints_complete` 写进约束表，才会变成 §2 那种 dump；且 dump 的上下界之外，还有更严的离散 rule（下两节）。

---

## 7. dump 与 rule：上下界之外还有离散限制

### 7.1 `complete`：dump 表怎样从 `runtime->hw` 得来

`snd_pcm_hw_constraints_complete()`（`pcm_native.c`）把合并后的 `runtime->hw` 写进约束表，例如：

```c
snd_pcm_hw_constraint_mask64(runtime, FORMAT, hw->formats);
snd_pcm_hw_constraint_minmax(runtime, CHANNELS,
			     hw->channels_min, hw->channels_max);
snd_pcm_hw_constraint_minmax(runtime, RATE,
			     hw->rate_min, hw->rate_max);
/* hw->rates 不含 CONTINUOUS/KNOT 时，再挂离散采样率规则： */
snd_pcm_hw_rule_add(…, snd_pcm_hw_rule_rate, hw, RATE, -1);
```

因此 §2 dump 里能直接看到：

- `FORMAT: S16_LE S24_LE S32_LE` ← `hw->formats`（mask）  
- `CHANNELS: [1 2]`、`RATE: [8000 48000]` ← `minmax`（interval）

`RATE` 这一行只反映 **上下界**；是否每个整数 Hz 都合法，还要看 rules。

### 7.2 区间内也会失败：rule 比 dump 更严

本板在 `complete` 时因 `hw->rates` 已是 WM8960 离散位图，会挂上 `snd_pcm_hw_rule_rate`：只允许 `snd_pcm_known_rates` 里对应位置为 1 的标准率（8k / 11.025k / 16k / 22.05k / 32k / 44.1k / 48k 等，**不含** 12k / 24k）。  
`fsl_sai_startup` 另挂的 `constraint_list` 与上述规则一起参与 refine，最终取更紧的一侧。

板端对照（均在 dump 的 `[8000 48000]` 内）：

```bash
speaker-test -D hw:0,0 -r 44100 -c 2 -t sine -l 1   # OK
speaker-test -D hw:0,0 -r 9000  -c 2 -t sine -l 1   # FAIL：不在标准率 / list
speaker-test -D hw:0,0 -r 12000 -c 2 -t sine -l 1   # FAIL：不在 WM8960_RATES 位图
```

```text
44100: Rate set to 44100Hz …
9000 / 12000: Rate … not available … Invalid argument
```

读 dump 时：先看 interval / mask 上下界，再想到 **rules 会再砍一刀**；「在 `[8000 48000]` 里」不等于「任意整数 Hz 都能设」。

---

## 8. refine：与 `hw_constraints` 求交

约束表就绪后，用户态每次 refine / `hw_params` 进入 `snd_pcm_hw_refine()`：

```text
snd_pcm_hw_refine(substream, params)
  │
  ├─ 对每个 mask：snd_mask_refine（§4.2 U8）
  ├─ 对每个 interval：snd_interval_refine（§4.1 96k、§4.3 8ch）
  └─ 循环执行 rules[]（§7.2 的 rate list / rule_rate 等），直到稳定
```

```c
/* sound/core/pcm_native.c — snd_pcm_hw_refine（4.9.88，节选） */
for (k = FIRST_MASK; k <= LAST_MASK; k++)
	changed = snd_mask_refine(m, constrs_mask(constrs, k));
for (k = FIRST_INTERVAL; k <= LAST_INTERVAL; k++)
	changed = snd_interval_refine(i, constrs_interval(constrs, k));
do {
	again = 0;
	for (k = 0; k < constrs->rules_num; k++)
		/* 依赖参数有变则 r->func(params, r) */
} while (again);
```

`HW_PARAMS` 会再 refine 一次，经 `snd_pcm_hw_params_choose` 定唯一值，再进各层 `hw_params`（见播放路径 §3.2）。追加 `constraint_*` 必须落在 §6 树里的 `startup` / `open`；挂晚了不参与当次协商。常用 API 见附录 B。

---

## 9. 和播放路径文的衔接

| 层次 | 动作 | 本文对应 |
|------|------|----------|
| 用户态 | `set_rate` / `set_rate_near` / `set_format` … | §4 硬失败；§5 near；§7.2 离散率 |
| ASoC | `soc_pcm_open` → `init_runtime_hw` →（返回后）`constraints_complete` | §6～§7 |
| ALSA 核心 | `snd_pcm_hw_refine`（含 rules） | §8 |
| 之后 | 各层 `hw_params` 配 SAI / Codec 时钟 | [播放路径](/analysis/kernel/sound/imx6ull-audio-playback-flow) §3.2 |

排查口诀：

1. **`open` 失败且 dmesg 含 `No matching …`** → DAI 能力交集为空（§6）；  
2. **请求在 dump 区间外**（96k / U8 / 8ch）→ mask / interval 空集（§4）；  
3. **请求在区间内仍失败**（9k / 12k）→ rules / 位图比 dump 更严（§7.2）；  
4. **只告警 rate not accurate**（§5）→ near 已改到合法值，不是空集。

---

## 10. 小结

- 本卡 dump：`FORMAT` 三位、`RATE [8000 48000]`、`CHANNELS [1 2]`；48 kHz WAV 可落到 `/proc/.../hw_params`。  
- 96 kHz（`speaker-test`）、U8、8ch：mask / interval 求交为空 → `-EINVAL`。  
- dump 的 RATE 只是上下界；`rule_rate` + SAI `constraint_list` 使 9k / 12k 等在区间内仍失败，44.1k 可行。  
- `aplay -r 96000` 用 near，常收到 48000 并告警。  
- open：`startup` 挂约束 → `init_runtime_hw` 求交 → `constraints_complete` 写入约束表；其后 refine 按 mask → interval → rules。

---

## 附录 A 源码索引

| 文件（相对 BSP 内核树） | 角色 |
|------|------|
| `sound/core/pcm_native.c` — `snd_pcm_hw_constraints_*`、`snd_pcm_hw_refine` | 约束表生命周期与 refine |
| `sound/core/pcm_lib.c` — `snd_pcm_hw_rule_add`、`snd_pcm_hw_constraint_*` | 约束挂接 |
| `sound/soc/soc-pcm.c` — `soc_pcm_open`、`soc_pcm_init_runtime_hw` | ASoC 能力合并；`No matching …` |
| `sound/soc/codecs/wm8960.c` — `WM8960_RATES` / `WM8960_FORMATS` | Codec 能力；求交后留下的 rates 位图 |
| `sound/soc/fsl/fsl_sai.c` — `fsl_sai_startup` | CPU DAI；`constraint_list(RATE)` |
| `sound/soc/fsl/imx-wm8960.c` — `imx_hifi_startup` | Machine；本板 `codec-master` 不挂板级 list |
| `sound/soc/fsl/imx-pcm-dma-v2.c` — `imx_pcm_open` | Platform；`runtime->hw` 初值与 `PERIODS` integer |

---

## 附录 B 常用 constraint API

| API | 作用 | 与本文的关系 |
|-----|------|----------------|
| `snd_pcm_hw_constraint_mask*` | mask 再 AND | 收窄 FORMAT 等 |
| `snd_pcm_hw_constraint_minmax` | interval `[min,max]` | 与 dump 中 RATE/CHANNELS 同类 |
| `snd_pcm_hw_constraint_list` | 离散名单（内部是 rule） | 例如只允许多个固定采样率 |
| `snd_pcm_hw_rule_add` | 参数互相约束 | 官方 Constraints 节有正反各一条示例 |

`runtime->hw` 是驱动/ASoC 声明的能力范围；refine 时真正求交的是 `hw_constraints` 里的 mask / interval / rules。
