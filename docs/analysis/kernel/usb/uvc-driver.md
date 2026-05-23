# UVC 驱动分析

> **Linux 内核 · USB 子系统** · 类驱动  
> 前置：[枚举与两轮 Probe](/analysis/kernel/usb/enumeration-and-probe)

## 背景

UVC（USB Video Class）是 USB 摄像头的标准协议。Linux 内核中的 `uvcvideo` 驱动实现了对该类设备的识别、格式协商与视频流采集。

本文梳理 UVC 类驱动的整体架构（设备完成枚举、interface probe 绑定之后）。

## 核心数据结构

```c
struct uvc_device {
    struct usb_device *udev;
    struct uvc_video_chain *chain;
    atomic_t users;
    /* ... */
};

struct uvc_streaming {
    struct uvc_device *dev;
    struct uvc_header bh;  /* Bulk header */
    __u16 maxpsize;
    /* ... */
};
```

## 驱动加载流程（概略）

1. USB 子系统匹配 UVC 设备（VID/PID 或 Interface Class）
2. `uvc_probe()` 解析设备描述符与格式
3. 注册 V4L2 设备节点（如 `/dev/video0`）
4. 用户空间通过 `VIDIOC_STREAMON` 启动视频流

## 待深入

- [ ] 控制请求（UVC Control Request）的处理路径
- [ ] isochronous vs bulk 传输差异
- [ ] 格式描述符（Format Descriptor）解析

## 相关代码

示例与分析代码见仓库 [`code/uvc-capture/`](https://github.com/dengtaowei/blog/tree/main/code/uvc-capture)。

## 参考

- [USB Video Class Specification](https://www.usb.org/document-library/video-class-v15-document-set)
- Linux 内核源码：`drivers/media/usb/uvc/`
