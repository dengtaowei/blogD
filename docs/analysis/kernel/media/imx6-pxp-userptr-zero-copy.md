---
homeTag: Media · CSI
homeTitle: PXP USERPTR 双零拷贝
homeDesc: CSI 缓冲直交 PXP，CPU 降至约 15%
sidebarOrder: 4
sidebarTitle: PXP USERPTR 零拷贝
---

# 双零拷贝：USERPTR + 直写 fb0

> **平台**：i.MX6ULL DVP + CSI（百问 Pro 板级对照）  
> **内核**：NXP BSP **Linux 4.9.88**  
> **前置**：[PXP PRIMARY 直写 fb0](/analysis/kernel/media/imx6-pxp-display-fb0)  
> **本文**：CSI→PXP USERPTR、缓冲同步、`-f 30`、实测

---

## 1. 本文回答什么

> **PXP 直写 fb0 后为何 CPU 还有 ~30%？怎么做到 ~8%？**

最后一趟 **CSI→PXP 输入 memcpy**（614KB×15fps）占了大头。用 **V4L2 USERPTR** 把 CSI mmap 指针直接交给 PXP，配合正确的 **PutFrame 顺序**，实现输入/输出双零拷贝。

---

## 2. 最终数据流

```text
OV5640 → CSI DMA → mmap 缓冲
                      ↓ USERPTR QBUF（无 memcpy）
                 PXP YUYV→RGB
                      ↓ PRIMARY DMA（无 memcpy）
                    fb0 → LCD
```

用户态只做 **poll + ioctl** 调度。

---

## 3. 关键代码

### 3.1 初始化：PXP 输入用 USERPTR

`display/pxp_display.c` — 不 mmap PXP 输入缓冲：

```c
req.memory = V4L2_MEMORY_USERPTR;
ioctl(pxp_fd, VIDIOC_REQBUFS, &req);
```

### 3.2 每帧：把 CSI 指针交给 PXP

```c
buf.memory = V4L2_MEMORY_USERPTR;
buf.m.userptr = (unsigned long)ptVideoBuf->tPixelDatas.aucPixelDatas;
buf.length = len;
ioctl(pxp_fd, VIDIOC_QBUF, &buf);
```

CSI 指针来自 `video/v4l2.c`：

```c
ptVideoBuf->tPixelDatas.aucPixelDatas = ptVideoDevice->pucVideBuf[index];
```

### 3.3 同步顺序

```text
GetFrame → PxpDisplaySubmit → PxpDisplayFinish → PutFrame
```

PXP 读完 CSI 缓冲后再 `PutFrame` 归还。

### 3.4 内核（无需新 patch）

PXP 驱动 `videobuf_dma_contig` 对 USERPTR 走 `follow_pfn()` → `s0_param.paddr`。输出侧仍用 PRIMARY patch。

---

## 4. 实测：三种路径 @ 30fps 采集

摄像头统一配置 **30fps**（`video2lcd -f 30 /dev/video1`），板端 100ask IMX6ULL Pro，每路跑稳态约 24s，`top -b -d 2` 采样 `video2lcd` CPU。

| 路径 | 命令 | 实际显示 FPS | CPU（avg） | 说明 |
|------|------|-------------|-----------|------|
| ① 纯软件 | `video2lcd -s -f 30` | **~8** | **~98%** | CPU `yuv2rgb`，单核 A7 几乎打满 |
| ② PRIMARY + MMAP | `video2lcd -m -f 30` | **~30** | **~59%** | PXP 转色 + 直写 fb0，仍有 CSI→PXP **memcpy** |
| ③ PRIMARY + USERPTR | `video2lcd -f 30` | **~30** | **~15%** | 输入/输出双零拷贝，推荐 |

`-m` 强制 PXP 输入走 MMAP+memcpy（跳过 USERPTR），用于对比 ②；日常用 ③ 即可。

**测 CPU 注意**：`top` 里要看 **进程行** `video2lcd -s ...`，不要误匹配含 `video2lcd` 字样的 `sh -c` 包装命令（会把均值拉低到几十 %）。单核板上软件路径 **~95–99%** 才正常。

**相对 ① 的优化效果（@ 30fps）：**

| 对比 | 帧率 | CPU |
|------|------|-----|
| ① → ② PXP + PRIMARY | 8 → **30**（约 **3.8×**） | 98% → **59%** |
| ② → ③ 加 USERPTR | 30 → 30（持平） | 59% → **15%**（约 **4×** 降幅） |
| ① → ③ 全链路 | 8 → **30**（约 **3.8×**） | 98% → **15%**（约 **6.5×** 降幅） |

15fps 采集时软件路径同样 **~97% CPU**、显示仅 **~5～8fps**；PXP+USERPTR 约 **15fps / ~8% CPU**（帧率翻倍时 USERPTR 约 **~15%**）。

成功日志（③）：

```text
camera: 640x480, fourcc=0x56595559, fps=30
input USERPTR(CSI zero-copy)
FPS: 30.0 (... frames, PXP)
```

---

## 5. 还可挖的方向

| 项 | 收益 | 难度 |
|----|------|------|
| 去掉 PXP `mdelay(5)` | CPU 再降几个点 | 低 |
| 内核 CSI→PXP pipeline | 用户态更轻 | 高 |
| 720P/1080P | 分辨率↑，帧率视模式 | 中 |

---

## 6. 系列小结

| 阶段 | 成果 |
|------|------|
| 点亮摄像头 | [DTS + 驱动 → `/dev/video1`](/analysis/kernel/media/imx6-ov5640-dts-video) |
| 图像质量 | [颜色/横纹分离修复](/analysis/kernel/media/imx6-ov5640-artifacts-color-stripes) |
| LCD 预览 | PXP → fb0，15fps 有图 |
| 性能优化 | USERPTR，CPU ~8% |
