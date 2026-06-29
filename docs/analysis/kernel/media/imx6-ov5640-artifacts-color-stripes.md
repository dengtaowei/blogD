---
homeTag: Media · CSI
homeTitle: OV5640 横纹与偏色排查
homeDesc: CSI 同步极性 vs ffplay 像素格式
sidebarOrder: 2
sidebarTitle: OV5640 横纹与偏色
---

# OV5640 图像问题实录：横纹是驱动，偏色是播放格式

> **平台**：i.MX6ULL DVP + CSI（百问 Pro 板级对照）  
> **内核**：NXP BSP **Linux 4.9.88**  
> **前置**：[OV5640 DTS 与 video 节点](/analysis/kernel/media/imx6-ov5640-dts-video)  
> **本文**：横纹 vs 偏色、驱动改动

---

## 1. 本文回答什么

摄像头点亮后，PC 上回放 YUV 常见两种现象：

| 现象 | 很多人第一反应 | 实际根因 |
|------|----------------|----------|
| 整屏偏绿/洋红 | 传感器格式错了 | **ffplay 像素格式** 与 YUYV 不符 |
| 水平横纹、帧被拆段 | 也是格式问题？ | **CSI 与 OV5640 同步极性** 不匹配 |

两类问题**独立**，修法也独立。混为一谈会浪费大量时间。

---

## 2. 现象与根因对照

| 现象 | 根因 | 正确修复 | 错误做法 |
|------|------|----------|----------|
| PC 回放偏色 | `uyvy422` ≠ 源数据 YUYV | `ffplay -pixel_format yuyv422` | 改 `0x4300` 或驱动 fourcc |
| 水平横纹 | VSYNC/HREF 极性与 CSI 采样不一致 | 修改后的 mx6s + ov5640 模块 | 只改 ffplay |

---

## 3. 驱动改了什么

### 3.1 `mx6s_capture.c`

`csi_init_interface()` 里**不再**置位 `BIT_SOF_POL`、`BIT_HSYNC_POL`。

- **POL** = polarity（极性）：高电平算有效还是低电平算有效。  
  `BIT_SOF_POL` 管 **VSYNC**（场同步），`BIT_HSYNC_POL` 管 **HREF**（行同步）。
- **原版**：两个 bit 都置 1，CSI **反转** VSYNC/HREF 的理解（按 active low 采样）。
- **Pro + OV5640**：`0x4740=0x23` 下 VSYNC/HREF 为 **active high**，CSI 应 **不反转**，与传感器一致。
- **极性不对**：行/场边界错位 → 水平横纹（与 PC 播放格式无关）。

| | 原版 | patch |
|--|------|-------|
| SOF/HSYNC_POL | 置 1（反转） | 清 0（一致采样） |

### 3.2 `ov5640_v2.c`

初始化寄存器表增加：

```c
{0x4740, 0x23},  /* VSYNC/HREF/PCLK 极性与 DVP 输出一致 */
```

---

## 4. PC 端正确回放

板端采集：

```bash
v4l2-ctl -d /dev/video1 --set-fmt-video=width=640,height=480,pixelformat=YUYV \
  --stream-mmap=3 --stream-count=150 --stream-to=/tmp/cam.yuv
adb pull /tmp/cam.yuv .
```

PC 回放：

```bash
ffplay -f rawvideo -pixel_format yuyv422 -video_size 640x480 -framerate 15 cam.yuv
```

**不要用 `uyvy422`**，除非你在做字节序对比实验。

---

## 5. 部署注意

rootfs 里常有**旧版** `.ko`。务必 push 到固定路径并显式 insmod：

```bash
insmod /lib/modules/4.9.88/extra/ov5640_camera_v2.ko
insmod /lib/modules/4.9.88/extra/mx6s_capture.ko
```

只 `modprobe` 而不更新文件，会出现「以为改了驱动、实际还是旧的」。

---

## 6. 小结

- 横纹：刷 **新 mx6s + ov5640**  
- 偏色：PC 用 **`yuyv422`**  
- 两者互不替代
