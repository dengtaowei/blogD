---
homeTag: Sound · ALSA
homeTitle: i.MX6ULL /dev/snd 设备节点
homeDesc: ls /dev/snd 看到的那些文件是干什么的
sidebarOrder: 1
sidebarTitle: /dev/snd 节点
date: 2026-08-01
---

# i.MX6ULL `/dev/snd` 设备节点

> **平台**：100ask i.MX6ULL Pro（`wm8960-audio`，SAI2 + WM8960）  
> **内核**：NXP BSP **Linux 4.9.88**（`imx-wm8960` / `fsl_sai` / `wm8960`）；与站点多数 6.8 文路径不同，差异处另行注明  
> **关联**：[播放路径](/analysis/kernel/sound/imx6ull-audio-playback-flow) · [录音路径](/analysis/kernel/sound/imx6ull-audio-capture-flow)  
> **本文**：板上 `/dev/snd` 节点含义、与 `dai_link` 对应、创建路径、`file_operations`，以及 PCM 节点 `open` 如何进到 `soc_pcm_open`

---

## 目录

- [1. 本文要回答什么](#1-本文要回答什么)
- [2. 板上节点一览](#2-板上节点一览)
- [3. 节点与三条 dai_link](#3-节点与三条-dai_link)
  - [3.1 ASRC（device 1）](#31-asrcdevice-1)
- [4. 内核如何创建这些节点](#4-内核如何创建这些节点)
- [5. 对应的 file_operations](#5-对应的-file_operations)
- [6. PCM 节点 open 与 soc_pcm_open](#6-pcm-节点-open-与-soc_pcm_open)
- [7. 小结](#7-小结)

---

## 1. 本文要回答什么

> **板上 `/dev/snd` 里每个节点对应什么能力？和 Machine 的三条 `dai_link`、打开时的 `file_operations` 如何对应？`open(pcm…)` 之后 ASoC 做了什么？**

---

## 2. 板上节点一览

板端实测：

```text
/dev/snd/
  controlC0
  pcmC0D0c  pcmC0D0p
  pcmC0D1c  pcmC0D1p
```

命名规则：`C` = card 号，`D` = device 号，`p` = playback，`c` = capture。

与 `aplay -l` 对应：

```text
card 0: wm8960audio [wm8960-audio]
  device 0: HiFi wm8960-hifi-0     → pcmC0D0p / pcmC0D0c
  device 1: HiFi-ASRC-FE (*)       → pcmC0D1p / pcmC0D1c
```

卡名来自设备树 `model = "wm8960-audio"`。device 1 为 ASRC 前端，说明见 [§3.1](#31-asrcdevice-1)。

---

## 3. 节点与三条 `dai_link`

Machine 驱动 `sound/soc/fsl/imx-wm8960.c` 里注册三条 `dai_link`，再加一张卡级控制节点：

| 角色 | 名称 | `/dev` 节点 | 用途 |
|------|------|-------------|------|
| `dai_link[0]` | HiFi | `pcmC0D0p` / `pcmC0D0c` | SAI2 ↔ WM8960 直连；日常播 / 录用 `hw:0,0` |
| `dai_link[1]` | HiFi-ASRC-FE | `pcmC0D1p` / `pcmC0D1c` | ASRC 前端，见 [§3.1](#31-asrcdevice-1) |
| `dai_link[2]` | HiFi-ASRC-BE | 无（`no_pcm`） | ASRC 后端，见 [§3.1](#31-asrcdevice-1) |
| 卡级控制 | — | `controlC0` | mixer（音量、通路等），不传 PCM；`amixer` / `tinymix` 等 |

HiFi（D0）典型命令：

| 节点 | 方向 | 示例 |
|------|------|------|
| `pcmC0D0p` | 播放 | `aplay -D hw:0,0 xxx.wav` |
| `pcmC0D0c` | 录音 | `arecord -D hw:0,0 -f cd rec.wav` |

### 3.1 ASRC（device 1）

本板 DTS 挂了 `asrc-controller` 时，Machine 会多建两条 `dai_link`：前端 FE 对应 `pcmC0D1*`，后端 BE 标 `no_pcm`，**不会**出现独立 `/dev` 节点。

数据路径：

```text
应用 ↔ D1（HiFi-ASRC-FE）↔ ASRC ↔ BE（SAI / WM8960）
```

`aplay -l` 里 device 1 旁的 `(*)` 表示该 PCM 还有 DPCM 子设备，不是故障。需要经 ASRC 做采样率转换时再用 `hw:0,1`：

| 节点 | 方向 | 示例 |
|------|------|------|
| `pcmC0D1p` | 播放 | `aplay -D hw:0,1 xxx.wav` |
| `pcmC0D1c` | 录音 | `arecord -D hw:0,1 ...` |

打开 `pcmC0D1*` 时，`substream->ops->open` 是 **`dpcm_fe_dai_open`**（不是下文的 `soc_pcm_open`）；内部再挂上 BE。下文 §6 只展开日常用的 HiFi / D0。

---

## 4. 内核如何创建这些节点

### 4.1 总流程

```text
imx_wm8960_probe
  → snd_soc_register_card / snd_soc_instantiate_card
      → snd_card_new
          → snd_ctl_create()           预备 control 设备
      → soc_probe_link_dais / soc_new_pcm
          → snd_pcm_new()              为有 PCM 的 link 创建 snd_pcm
      → snd_card_register
          → snd_device_register_all
              → control: snd_ctl_dev_register
              → pcm:     snd_pcm_dev_register
                  → snd_register_device(...)
                      → device_add → 出现 /dev/snd/xxx
```

关键文件：

| 步骤 | 文件 |
|------|------|
| 注册到字符设备 | `sound/core/sound.c` — `snd_register_device()` |
| control 注册 | `sound/core/control.c` — `snd_ctl_dev_register()` |
| PCM 注册 | `sound/core/pcm.c` — `snd_pcm_dev_register()` |
| ASoC 创建 PCM | `sound/soc/soc-pcm.c` — `soc_new_pcm()` |
| 建卡 | `sound/core/init.c` — `snd_card_new()` / `snd_card_register()` |

说明：`snd_card_new()` 里会调用 `snd_ctl_create()` **预备** `controlC0`，但用户态真正可访问要等 `snd_card_register()`。

### 4.2 打开时的统一入口

所有 ALSA 节点先挂在总入口 `snd_fops` 上（`sound/core/sound.c`）：

```text
open("/dev/snd/xxx")
  → snd_fops.open = snd_open
  → 按 minor 查 snd_minors[]
  → replace_fops 换成真正的 file_operations
  → 调用对应 open（如 snd_pcm_playback_open）
```

---

## 5. 对应的 `file_operations`

| `/dev/snd` 节点 | file_operations | 定义位置 | 主要接口 |
|-----------------|-----------------|----------|----------|
| **controlC0** | `snd_ctl_f_ops` | `sound/core/control.c` | `open` / `unlocked_ioctl` / `read` / `poll` |
| **pcmC0D0p**、**pcmC0D1p** | `snd_pcm_f_ops[0]` | `sound/core/pcm_native.c` | `write`、`snd_pcm_playback_ioctl`、`snd_pcm_playback_open` |
| **pcmC0D0c**、**pcmC0D1c** | `snd_pcm_f_ops[1]` | `sound/core/pcm_native.c` | `read`、`snd_pcm_capture_ioctl`、`snd_pcm_capture_open` |

PCM 注册核心代码（`sound/core/pcm.c`）：

```c
snd_register_device(devtype, pcm->card, pcm->device,
                    &snd_pcm_f_ops[cidx], pcm,
                    &pcm->streams[cidx].dev);
```

- `cidx = 0`（playback）→ `...p`
- `cidx = 1`（capture）→ `...c`

control 注册（`sound/core/control.c`）：

```c
snd_register_device(SNDRV_DEVICE_TYPE_CONTROL, card, -1,
                    &snd_ctl_f_ops, card, &card->ctl_dev);
```

---

## 6. PCM 节点 open 与 `soc_pcm_open`

§4.2 / §5 说到首次 `open` 会换成 `snd_pcm_playback_open` / `snd_pcm_capture_open`。对 **HiFi（`pcmC0D0p` / `pcmC0D0c`）**，真正接到 ASoC 各层的是 `substream->ops->open` → **`soc_pcm_open`**（`sound/soc/soc-pcm.c`）。建 PCM 时在 `soc_new_pcm` 里写入：`rtd->ops.open = soc_pcm_open`。（D1 / ASRC-FE 的 open 见 [§3.1](#31-asrcdevice-1)。）

### 6.1 从节点到 `soc_pcm_open`

以打开 `pcmC0D0p` 为例（录音把 `playback` 换成 `capture` / `f_ops[1]` 即可）：

```text
open("/dev/snd/pcmC0D0p")
  → snd_open → replace_fops → snd_pcm_f_ops[0]
  → snd_pcm_playback_open
      → snd_pcm_open(..., PLAYBACK)          // pcm_native.c：卡引用、open_mutex、忙则等待
          → snd_pcm_open_file
              → snd_pcm_open_substream
                  → attach substream、hw 约束初值
                  → substream->ops->open
                      → soc_pcm_open         // 本板 HiFi
```

`snd_pcm_open` 负责「这个 PCM 设备能不能被占上」；`soc_pcm_open` 负责「这条 `rtd` 上的 CPU DAI / Platform / Codec / Machine 如何 startup」。

### 6.2 `soc_pcm_open` 在做什么（本板）

`substream->private_data` 即绑卡得到的 **`rtd`（`snd_soc_pcm_runtime`）**，其上已挂好 `cpu_dai` / `platform` / `codec_dai`。函数大致分四段：

```text
soc_pcm_open(substream)
  │
  ├─ 1. pinctrl 默认态 + pm_runtime_get（CPU DAI / Codec / Platform 设备）
  ├─ 2. 持 rtd->pcm_mutex，按序 startup / open
  │     → cpu_dai->ops->startup     → fsl_sai_startup
  │     → platform->ops->open       → imx_pcm_open（imx-pcm-dma-v2）
  │     → codec_dai->ops->startup   → WM8960 通常无，跳过
  │     → dai_link->ops->startup    → imx_hifi_startup
  ├─ 3. 非 DPCM：soc_pcm_init_runtime_hw（CPU/Codec 能力求交 → runtime->hw）
  │     检查 rates / formats / channels；对称率等
  └─ 4. snd_soc_runtime_activate；失败则反向 shutdown / close + runtime_put
```

本板各回调侧重点：

| 调用 | 文件 | open 阶段做什么 |
|------|------|-----------------|
| `fsl_sai_startup` | `fsl_sai.c` | 占住该方向流；加速率等 hw 约束 |
| `imx_pcm_open` | `imx-pcm-dma-v2.c` | 按 `"tx"`/`"rx"` 申请 SDMA 通道，设 PCM hardware |
| `imx_hifi_startup` | `imx-wm8960.c` | 与 SAI 流占用对齐；非 codec-master 时再加板级速率约束 |

此阶段 **一般不** 配具体采样率、不开环形 DMA 传数；那些在后续 `hw_params` / `prepare` / `trigger`（见播/录路径文）。

---

## 7. 小结

- 日常播 / 录用 **D0（HiFi）**；另有 ASRC 时见 [§3.1](#31-asrcdevice-1)。
- 节点在 `snd_card_register` → `snd_register_device` 后出现在 `/dev/snd`。
- 首次 `open` 经 `snd_open` 再 `replace_fops` 到 control / PCM 各自的 `file_operations`。
- PCM（D0）再经 `snd_pcm_open` → **`soc_pcm_open`**：启动 SAI / `imx_pcm` / Machine，并求交 `runtime->hw`。
