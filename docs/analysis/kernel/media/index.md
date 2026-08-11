---
home: false
---

# Media / V4L2

摄像头和 V4L2。i.MX6 几篇用的是百问 Linux 4.9.88 BSP，框架几篇以 6.8 为主，文首都有写。

## 文章

- [i.MX6ULL OV5640：设备树到 /dev/video](/analysis/kernel/media/imx6-ov5640-dts-video) — DVP DTS、引脚冲突、mx6s 出 video 节点
- [OV5640 横纹与偏色](/analysis/kernel/media/imx6-ov5640-artifacts-color-stripes) — CSI 同步极性、ffplay 像素格式
- [PXP PRIMARY 直写 fb0](/analysis/kernel/media/imx6-pxp-display-fb0) — YUYV→RGB、内核 patch
- [PXP USERPTR 零拷贝](/analysis/kernel/media/imx6-pxp-userptr-zero-copy) — CSI 缓冲直接给 PXP
- [V4L2 设备注册与 video 节点](/analysis/kernel/media/v4l2-device-registration)
- [V4L2 ioctl 分发](/analysis/kernel/media/v4l2-ioctl-dispatch)
- [videobuffer2：Buffer 状态机与双链表](/analysis/kernel/media/v4l2-vb2-queue)
