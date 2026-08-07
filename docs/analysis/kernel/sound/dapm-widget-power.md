---
homeTag: Sound · ALSA
homeTitle: DAPM widget 何时上电
homeDesc: power_check、complete path、dapm_power_widgets 调用链
sidebarOrder: 7
sidebarTitle: DAPM widget 上电
---

# DAPM widget 上电：谁判、何时判

> **内核**：NXP BSP **Linux 4.9.88**（主文件 `sound/soc/soc-dapm.c`；PCM 侧触发见 `sound/soc/soc-pcm.c`）  
> **对照**：100ask i.MX6ULL + WM8960 上的播放 / `tinymix` 拨开关场景  
> **本文**：普通音频 widget 的上电充要条件，以及 `power_check` 由谁、在何时调用

---

## 目录

- [1. 本文要回答什么](#1-本文要回答什么)
- [2. 先对齐几个词](#2-先对齐几个词)
- [3. 上电充要条件：generic 路径](#3-上电充要条件generic-路径)
- [4. power_check：谁调用](#4-power_check谁调用)
- [5. 何时跑整次供电扫描](#5-何时跑整次供电扫描)
- [6. 一次 dapm_power_widgets 里发生什么](#6-一次-dapm_power_widgets-里发生什么)
- [7. 两条常见触发链](#7-两条常见触发链)
- [8. 特例：SUPPLY / force / always_on](#8-特例supply--force--always_on)
- [9. 小结](#9-小结)
- [附录 A 源码索引](#附录-a-源码索引)
- [附录 B 要点速记](#附录-b-要点速记)

---

## 1. 本文要回答什么

> **Linux 什么时候给 DAPM 图上的 widget 上电？`w->power_check` 被谁调用、在什么事件之后跑起来？**

范围限定 **DAPM 电源决策**（`power_check` → `dapm_power_widgets` → 上下电序列）。不展开某颗 Codec 的模拟连线表，也不展开 PCM DMA 数据面。

---

## 2. 先对齐几个词

| 词 | 含义（本文用法） |
|----|------------------|
| **widget** | DAPM 节点：DAC / ADC / Mixer / 输出脚等，常绑一颗电源位 |
| **path** | 两 widget 之间的运行时边（`snd_soc_dapm_path`）；`connect` 表示是否接通 |
| **端点（endpoint）** | 行走时可当作「路径终点」的 widget：`is_ep` 标明 source/sink，且 `connected` |
| **complete path** | 从有效 source 端点沿 `connect==1` 的边走到有效 sink 端点的整条链 |
| **`power_check`** | 每个 widget 上的函数指针：回答「我现在该不该有电」 |

创建 widget 时按类型挂上不同的 `power_check`（`snd_soc_dapm_new_control_unlocked`）：Mixer / DAC / ADC / PGA / DAI 等用 **`dapm_generic_check_power`**；电源类用 **`dapm_supply_check_power`**；少数 always-on 用 **`dapm_always_on_check_power`**。

---

## 3. 上电充要条件：generic 路径

普通音频块（Mixer、PGA、DAC、ADC、DAI in/out 等）走：

```c
/* sound/soc/soc-dapm.c — dapm_generic_check_power */
in  = is_connected_input_ep(w, NULL, NULL);
out = is_connected_output_ep(w, NULL, NULL);
return out != 0 && in != 0;
```

**充要条件（对 generic、且未 `force`）**：

1. 从该 widget 往 **输入方向** 走，能到达至少一个**有效 source 端点**（`in != 0`）；  
2. 从该 widget 往 **输出方向** 走，能到达至少一个**有效 sink 端点**（`out != 0`）。

两者同时成立 ⇔ 该 widget 落在至少一条 **complete path** 上 ⇔ `new_power = 1`。

行走规则要点（`is_connected_ep`）：

- 只沿 **`path->connect == 1`** 的边前进（闸刀打开或常通边）；  
- 跳过 `weak`、以及标记为 supply 的边（它们不计入这条「音频 complete path」）；  
- 碰到带正确 `is_ep` 且 `connected` 的 widget 时停下，再经 `snd_soc_dapm_suspend_check`（卡在 D3 且未 `ignore_suspend` 则端点作废）。

内核注释对 complete path 的典型形态（`dapm_power_widgets` 上方）：

```text
DAC → 输出脚
输入脚 → ADC
输入脚 → 输出脚（bypass）
DAC → ADC（loopback）
```

**有效端点从哪来（播放直觉）**：

| 角色 | 常见来源 |
|------|----------|
| source | PCM **START** 后，DAI 的 playback widget 被标成 `EP_SOURCE` 且 `active` |
| sink | `OUTPUT` / `HP` / `SPK` 等输出类 widget，且未被 `dapm_nc_pin` 置成未连接 |

因此：只拧音量、中间 Mixer Switch 断开 → 边 `connect=0` → 中间 widget 的 `in` 或 `out` 为 0 → **不上电**。流没起来（DAI 不是有效端点）同理。

---

## 4. `power_check`：谁调用

`w->power_check` **没有**独立的周期性轮询。唯一包装入口：

```c
static int dapm_widget_power_check(struct snd_soc_dapm_widget *w)
{
	if (w->power_checked)
		return w->new_power;

	if (w->force)
		w->new_power = 1;
	else
		w->new_power = w->power_check(w);   /* ★ 真正调用 */

	w->power_checked = true;
	return w->new_power;
}
```

谁调 `dapm_widget_power_check`：

| 调用者 | 目的 |
|--------|------|
| `dapm_power_one_widget` | 给某个 dirty widget 算该上还是该下，再 `dapm_widget_set_power` |
| `dapm_supply_check_power` | SUPPLY 判断自己要不要上电时，递归问下游 sink：`dapm_widget_power_check(path->sink)` |

`dapm_power_one_widget` 再被 **`dapm_power_widgets`** 调用：先扫 `card->dapm_dirty`；电源状态变化时可能把邻居也 `dapm_mark_dirty`，同一次扫描里继续处理。

每次进入 `dapm_power_widgets` 会先 `dapm_reset()`，把全卡 widget 的 `power_checked = false`，于是**这一轮扫描里每个 widget 的 `power_check` 最多执行一次**。

```text
dapm_power_widgets
  → dapm_reset()                    // 清 power_checked
  → 每个 dirty widget:
        dapm_power_one_widget(w)
          → dapm_widget_power_check(w)
                → w->power_check(w)   // generic / supply / …
          → dapm_widget_set_power(...)
```

---

## 5. 何时跑整次供电扫描

所有「该不该上电」的重算，都汇聚到 **`dapm_power_widgets(card, event)`**。常见触发：

| 时机 | 入口（简化） |
|------|----------------|
| PCM 流 START / STOP 等 | `snd_soc_dapm_stream_event` → `soc_dapm_stream_event` → `dapm_power_widgets` |
| 拨 DAPM Mixer 开关 | `snd_soc_dapm_put_volsw` → `soc_dapm_mixer_update_power` → 改 `path->connect` 并 dirty → `dapm_power_widgets` |
| 拨 DAPM MUX | `soc_dapm_mux_update_power` → 同上 |
| 显式同步 | `snd_soc_dapm_sync` / `_unlocked`（probe 结束、jack、改 pin 之后常见） |
| 新建一批 widget | `snd_soc_dapm_new_widgets` 末尾直接调用 |

只 `dapm_enable_pin` / 改 route 而不 `sync` 时，注释写明：**需要随后的 `snd_soc_dapm_sync` 才会真正重算上电**。模式是 **事件驱动 + dirty 列表**，不是定时扫全图。

---

## 6. 一次 `dapm_power_widgets` 里发生什么

```text
dapm_power_widgets(card, event)
  1. 按 idle_bias_off / suspend 定各 dapm context 的目标 bias 初值
  2. dapm_reset()
  3. 遍历 dapm_dirty → dapm_power_one_widget
        （算 new_power；与旧 power 不同则进 up_list / down_list，并可 dirty 邻居）
  4. 根据仍需上电的 widget 抬高 target_bias（多数音频块要 BIAS_ON）
  5. 统一 card 内 bias（非 idle_bias_off 时）
  6. 先跑断电序列 dapm_seq_run(..., false)，再跑上电序列 dapm_seq_run(..., true)
        （写 widget 绑定的电源寄存器，触发 WILL_PMU / PMU 等事件）
```

注释强调：完整路径是「有有效端点的 route」；扫描的目的就是找出谁在 complete path 上，谁该进上电/断电列表。

`dapm_widget_set_power`：若 `w->power` 与目标相同则直接返回；否则更新邻居 dirty，并把 widget 插入 up/down 有序列表，供后面按类型排序写硬件（减轻 pop）。

---

## 7. 两条常见触发链

### 7.1 开始播放（流事件）

PCM 路径在 open/prepare/close 等处会调 `snd_soc_dapm_stream_event`（`soc-pcm.c`）。核心：

```c
/* soc_dapm_dai_stream_event：STREAM_START 时 */
w->active = 1;
w->is_ep = ep;          /* playback → EP_SOURCE；capture → EP_SINK */
dapm_mark_dirty(w, "stream event");

/* soc_dapm_stream_event 末尾 */
dapm_power_widgets(rtd->card, event);
```

对播放：DAI 成为有效 **source** 端点；若输出脚仍是有效 **sink**，且中间 Mixer 等边 `connect==1`，则 DAC / Output Mixer / PGA 等 `in && out` 成立 → 进入上电序列。

### 7.2 `tinymix` 拨路由开关

DAPM 的 `put` 改完寄存器后走 mixer 更新：

```c
/* soc_dapm_mixer_update_power */
soc_dapm_connect_path(path, connect, "mixer update");
/* connect_path 内：path->connect = …；dirty source/sink；invalidate 缓存 */
dapm_power_widgets(card, SND_SOC_DAPM_STREAM_NOP);
```

例如打开 `Left Output Mixer PCM Playback Switch`：对应 path 变为接通 → 若此时流已 START，complete path 被补全 → 沿线 widget 上电。只拨开关、从未 START，则往往仍缺 source 端点，中间块仍可保持断电。

---

## 8. 特例：SUPPLY / force / always_on

| `power_check` | 上电条件（摘要） |
|---------------|------------------|
| `dapm_generic_check_power` | `in != 0 && out != 0`（§3） |
| `dapm_supply_check_power` | 存在已接通且**需要上电**的下游 sink（电源跟着负载走） |
| `dapm_always_on_check_power` | 基本上看 `w->connected` |
| `w->force` | `dapm_widget_power_check` 短路为恒上电 |

WM8960 上的 `MICB` 一类 SUPPLY：麦克风通路上的 ADC/Input 需要电时，才会把偏置拉起来，而不是自己单独构成「DAC→喇叭」那种音频 complete path。

---

## 9. 小结

- 普通 widget 上电 **⇔** 同时能连到有效 source 端点与有效 sink 端点（落在 complete path 上）。  
- `power_check` 只经 `dapm_widget_power_check` 进入；由 `dapm_power_one_widget`（及 SUPPLY 递归）在 **`dapm_power_widgets`** 扫描 dirty 时调用。  
- 扫描由流事件、DAPM 开关/MUX、`snd_soc_dapm_sync`、新建 widget 等触发，属**事件驱动**。  
- 真正写电源寄存器发生在 `dapm_seq_run` 的上电/断电序列，不在 `power_check` 函数内部。

---

## 附录 A 源码索引

| 位置 | 内容 |
|------|------|
| `sound/soc/soc-dapm.c` — `dapm_generic_check_power` / `is_connected_ep` | 上电判定与图行走 |
| 同文件 — `dapm_widget_power_check` / `dapm_power_one_widget` / `dapm_power_widgets` | 调用与扫描 |
| 同文件 — `soc_dapm_mixer_update_power` / `soc_dapm_connect_path` | 开关改 `connect` 后重算 |
| 同文件 — `soc_dapm_stream_event` / `soc_dapm_dai_stream_event` | 流 START/STOP 标端点 |
| 同文件 — `snd_soc_dapm_sync` | 显式触发供电扫描 |
| `sound/soc/soc-pcm.c` | `snd_soc_dapm_stream_event` 的 PCM 侧调用点 |
| `include/sound/soc-dapm.h` — `snd_soc_dapm_widget` / `snd_soc_dapm_path` | `power_check`、`connect`、`is_ep` |

---

## 附录 B 要点速记

1. **generic 上电** = `is_connected_input_ep && is_connected_output_ep`。  
2. **complete path** = 有效端点 + 中间每段 `path->connect == 1`。  
3. **`power_check` ← `dapm_widget_power_check` ← `dapm_power_one_widget` ← `dapm_power_widgets`**。  
4. 触发靠 **dirty + 事件**（流 / 开关 / sync），不是轮询。  
5. 一轮扫描内 `power_checked` 保证每个 widget 的 `power_check` 最多算一次。  
6. SUPPLY 跟下游是否需要电；`force` 可强制上电。
