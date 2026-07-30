---
homeTag: Media · CSI
homeTitle: PXP PRIMARY 直写 fb0
homeDesc: YUYV→RGB 硬件显示与内核 patch
sidebarOrder: 3
sidebarTitle: PXP PRIMARY 直写 fb0
---

# PXP 硬件显示：PRIMARY 直写 fb0

> **平台**：i.MX6ULL DVP + CSI（百问 Pro 板级对照）  
> **内核**：NXP BSP **Linux 4.9.88**（PXP 编进内核）  
> **前置**：[OV5640 横纹与偏色](/analysis/kernel/media/imx6-ov5640-artifacts-color-stripes)  
> **本文**：PXP v4l2、PRIMARY 直写 fb0、内核 patch

---

## 1. 本文回答什么

> **怎样用 i.MX6 PXP 做 YUYV→RGB，并稳定显示到 LCD？**

用 `/dev/video0`（PXP V4L2）替代 CPU `yuv2rgb`，通过 **PRIMARY** 让 PXP 输出 **DMA 直写 fb0**，LCD 始终扫描 framebuffer。

### 优化效果：纯软件 → PXP + PRIMARY

摄像头统一 **30fps** 采集（`video2lcd -f 30`），100ask IMX6ULL Pro 板端实测：

| | 纯软件 `-s -f 30` | PXP + PRIMARY `-m -f 30` | 变化 |
|--|-------------------|--------------------------|------|
| **实际显示 FPS** | ~8 | **~30** | **约 3.8×** |
| **CPU** | ~98% | **~59%** | 单核从打满降到约六成 |

15fps 采集时趋势相同：软件路径 **~5～8fps / ~97% CPU** → PRIMARY **~15fps / ~30% CPU**。

PRIMARY 做的是两件事：**色彩转换从 CPU 挪到 PXP**，**RGB 输出 DMA 直写 fb0**（不再经 outbuf 再拷贝）。输入侧 CSI→PXP 仍有一趟 memcpy（614KB/帧），所以 CPU 还没到最低；去掉这最后一趟拷贝见 [PXP USERPTR 零拷贝](/analysis/kernel/media/imx6-pxp-userptr-zero-copy)。

```bash
video2lcd -s -f 30 /dev/video1    # 优化前：~8fps，~98% CPU
video2lcd -m -f 30 /dev/video1    # 加 PRIMARY：~30fps，~59% CPU
```

---

## 2. 数据流

```text
CSI → PXP（/dev/video0）──DMA──→ fb0 → LCD
```

应用侧：`display/pxp_display.c`，`config.h` 里 `USE_PXP 1`。

---

## 3. 应用配置

```c
fbuf.flags = V4L2_FBUF_FLAG_PRIMARY;
ioctl(pxp_fd, VIDIOC_S_FBUF, &fbuf);
```

`VIDIOC_S_OUTPUT(1)` 选 Virtual Output；`VIDIOC_S_CROP` 设置 fb0 上居中区域。

---

## 4. 内核 patch（`mxc_pxp_v4l2.c` / `.h`）

NXP 原版 PXP 驱动不处理 `V4L2_FBUF_FLAG_PRIMARY`，输出 DMA 固定写内部 `outbuf`。  
以下 5 处改动让应用 `S_FBUF PRIMARY` 后，PXP **直写 fb0 物理地址**。

完整 diff：`backup/video2lcd_pxp_direct_fb_20260628/kernel_pxp_fb_direct.patch`

### 4.1 `mxc_pxp_v4l2.h` — 增加标志位

```c
struct pxps {
	/* ... */
	int fb_blank;
	int fb_direct_output; /* S_FBUF PRIMARY: write to fb0, no outbuf */
};
```

### 4.2 `pxp_s_fbuf()` — 识别 PRIMARY

应用 `ioctl(VIDIOC_S_FBUF)` 置 `V4L2_FBUF_FLAG_PRIMARY` 时，记下直写 fb0 模式：

```c
static int pxp_s_fbuf(struct file *file, void *priv,
			const struct v4l2_framebuffer *fb)
{
	struct pxps *pxp = video_get_drvdata(video_devdata(file));

	/* ... overlay / alpha / chromakey 原有逻辑 ... */

	pxp->fb_direct_output =
		(fb->flags & V4L2_FBUF_FLAG_PRIMARY) != 0;

	return 0;
}
```

### 4.3 `pxp_s_output()` — 保存 output 索引

```c
	if (i > 1)
		return -EINVAL;

	pxp->output = i;   /* 新增：记录 Virtual(1) / Display(0) */

	/* Output buffer is same format as fbdev */
```

### 4.4 `pxp_buf_prepare()` — 输出地址改指 fb0

**（1）PRIMARY 模式下允许不分配 outbuf：**

```c
	if (!pxp->outbuf.paddr && !pxp->fb_direct_output) {
		dev_err(&pxp->pdev->dev, "Not allocate memory for "
			"PxP Out buffer?\n");
		return -ENOMEM;
	}
```

**（2）配置 PXP 输出层 DMA 目标：**

```c
			} else if (i == 1) { /* Output */
				pxp_conf->out_param.width = pxp->fb.fmt.width;
				pxp_conf->out_param.height = pxp->fb.fmt.height;

				if (pxp->fb_direct_output && pxp->fb.base)
					pxp_conf->out_param.paddr =
						(dma_addr_t)pxp->fb.base;
				else
					pxp_conf->out_param.paddr =
						pxp->outbuf.paddr;
				memcpy(&desc->layer_param.out_param,
					&pxp_conf->out_param,
					sizeof(struct pxp_layer_param));
```

`pxp->fb.base` 来自 `pxp_set_fbinfo()` 里读的 fb0 `smem_start`（与 `/dev/fb0` 同一块显存）。

### 4.5 `pxp_streamon()` — PRIMARY 时不 pan 到 outbuf

Display Output 时原版会 `pan_display(outbuf)` 切 LCD 扫描地址；PRIMARY 下 LCD 本就在扫 fb0，需跳过：

```c
	ret = videobuf_streamon(&pxp->s0_vbq);

	if (!ret && (pxp->output == 0) && !pxp->fb_direct_output)
		pxp_show_buf(pxp, pxp->outbuf.paddr);

	return ret;
```

### 4.6 编译部署

PXP 编进内核（`CONFIG_VIDEO_MXC_PXP_V4L2=y`），改完后在内核树：

```bash
make -j$(nproc) zImage
```

刷 `arch/arm/boot/zImage` 到板子。仅改应用、未刷带 patch 的内核时，`S_FBUF PRIMARY` 会失败。

---

## 5. 板端运行

```bash
killall mxapp2 video2lcd v4l2-ctl 2>/dev/null
insmod .../ov5640_camera_v2.ko
insmod .../mx6s_capture.ko
video2lcd -m -f 30 /dev/video1    # 本篇：PXP + PRIMARY（对比软件路径用 -s）
```

期望：

```text
PXP: direct-fb0 phys 0x8c100000, dst 640x480 @(...), input MMAP+memcpy
FPS: 30.0 (... frames, PXP)
```

日常推荐再加 USERPTR（`video2lcd -f 30`，不带 `-m`），见下一篇。

---

## 6. 小结

| 项 | 纯软件 `-s` | PXP + PRIMARY `-m` |
|------|-------------|---------------------|
| 色彩转换 | CPU yuv2rgb | **PXP 硬件** |
| 输出 | PicMerge → fb0 | **DMA 直写 fb0** |
| FPS（30fps 采集） | ~8 | **~30** |
| CPU（30fps 采集） | ~98% | **~59%** |

本篇解决 **算力瓶颈** 和 **输出直写显存**；USERPTR 再降 CPU，见下一篇。
