// SPDX-License-Identifier: GPL-2.0
/*
 * Minimal virtual V4L2 capture driver for Linux 6.8+
 *
 * 整体思路：
 *   APP 通过 ioctl/mmap 与 videobuf2 交互；
 *   本驱动用 timer 模拟“硬件每隔一段时间产生一帧”，
 *   把图像写入 APP 已通过 QBUF 交出的 buffer，再通知 APP 取走（DQBUF）。
 */

#include <linux/module.h>
#include <linux/timer.h>
#include <linux/spinlock.h>
#include <linux/mutex.h>
#include <linux/string.h>
#include <linux/list.h>

#include <media/v4l2-device.h>
#include <media/v4l2-ioctl.h>
#include <media/v4l2-fh.h>
#include <media/videobuf2-v4l2.h>
#include <media/videobuf2-vmalloc.h>

#define DRIVER_NAME		"virtual_video"
#define WIDTH			640
#define HEIGHT			480
#define VIRTUAL_FRAME_BYTES	(WIDTH * HEIGHT * 2)	/* RGB565 每像素 2 字节 */
#define MIN_BUFS		2			/* 至少 2 个 buffer 才能流水线采集 */
#define FPS			30

/*
 * 每个 videobuf2 buffer 的私有结构。
 * vb 必须放在第一个成员：vb2 按 buf_struct_size 分配内存，并把它当作 vb2_buffer 使用。
 * list 用于驱动自己维护的“已交给硬件、等待填充”的链表。
 */
struct virtual_buffer {
	struct vb2_v4l2_buffer vb;
	struct list_head list;
};

struct virtual_dev {
	struct video_device vdev;	/* 对应 /dev/videoX */
	struct v4l2_device v4l2_dev;	/* V4L2 核心辅助结构，vdev 需指向它 */
	struct vb2_queue vb_queue;	/* buffer 队列，REQBUFS/QBUF/DQBUF 都走这里 */
	struct mutex lock;		/* 保护 vb2_queue 与 file 操作（vb2 框架要求） */
	spinlock_t buf_lock;		/* 保护 queued_bufs；timer 里要用 spinlock */
	struct list_head queued_bufs;	/* 驱动侧的“空闲/待填充”链表，模拟硬件持有 buffer */
	struct timer_list timer;	/* 模拟硬件定时产生帧 */
	bool streaming;
	u32 frame_seq;			/* 帧序号，APP 可在 DQBUF 时读到 */
};

static struct virtual_dev g_dev;

/* 从驱动队列取出一个 APP 已通过 QBUF 交出的 buffer */
static struct virtual_buffer *virtual_pop_buf(void)
{
	struct virtual_buffer *buf = NULL;
	unsigned long flags;

	spin_lock_irqsave(&g_dev.buf_lock, flags);
	if (!list_empty(&g_dev.queued_bufs)) {
		buf = list_first_entry(&g_dev.queued_bufs, struct virtual_buffer, list);
		list_del(&buf->list);
	}
	spin_unlock_irqrestore(&g_dev.buf_lock, flags);

	return buf;
}

/* 用纯色填充一整帧 RGB565，每秒切换红/绿/蓝，便于肉眼确认采集正常 */
static void virtual_fill_frame(void *vaddr, u32 seq)
{
	u16 color;
	u16 *pixels = vaddr;
	size_t i, count = VIRTUAL_FRAME_BYTES / 2;

	switch ((seq / FPS) % 3) {
	case 0:
		color = 0xF800; /* RGB565 红 */
		break;
	case 1:
		color = 0x07E0; /* RGB565 绿 */
		break;
	default:
		color = 0x001F; /* RGB565 蓝 */
		break;
	}

	for (i = 0; i < count; i++)
		pixels[i] = color;
}

/*
 * timer 回调 = 模拟硬件中断：取 buffer → 填数据 → 还给 vb2 完成队列。
 * APP 侧 poll 会变为可读，随后 DQBUF 取走该 buffer。
 */
static void virtual_timer_fn(struct timer_list *t)
{
	struct virtual_dev *dev = from_timer(dev, t, timer);
	struct virtual_buffer *buf;
	void *vaddr;

	if (!dev->streaming)
		return;

	buf = virtual_pop_buf();
	if (buf) {
		/* 通过 vmalloc 映射得到内核虚拟地址，往 APP mmap 的同一块内存写数据 */
		vaddr = vb2_plane_vaddr(&buf->vb.vb2_buf, 0);
		if (vaddr) {
			virtual_fill_frame(vaddr, dev->frame_seq);
			vb2_set_plane_payload(&buf->vb.vb2_buf, 0, VIRTUAL_FRAME_BYTES);
			buf->vb.sequence = dev->frame_seq++;
			buf->vb.field = V4L2_FIELD_NONE;
			buf->vb.vb2_buf.timestamp = ktime_get_ns();
		}
		/* 放入 vb2 的 done_list，唤醒正在 poll / DQBUF 的 APP */
		vb2_buffer_done(&buf->vb.vb2_buf, VB2_BUF_STATE_DONE);
	}

	/* 周期性触发，模拟 30fps */
	mod_timer(&dev->timer, jiffies + HZ / FPS);
}

static int virtual_querycap(struct file *file, void *fh,
			    struct v4l2_capability *cap)
{
	strscpy(cap->driver, DRIVER_NAME, sizeof(cap->driver));
	strscpy(cap->card, "Virtual Video Device", sizeof(cap->card));
	strscpy(cap->bus_info, "platform:virtual", sizeof(cap->bus_info));

	cap->device_caps = V4L2_CAP_VIDEO_CAPTURE | V4L2_CAP_STREAMING;
	/* DEVICE_CAPS 表示 capabilities 里 device_caps 字段有效（V4L2 新设备写法） */
	cap->capabilities = cap->device_caps | V4L2_CAP_DEVICE_CAPS;

	return 0;
}

static int virtual_enum_fmt(struct file *file, void *fh, struct v4l2_fmtdesc *f)
{
	/* index=0 返回唯一支持的格式，index>0 表示枚举结束 */
	if (f->index)
		return -EINVAL;

	f->pixelformat = V4L2_PIX_FMT_RGB565;
	strscpy(f->description, "RGB565", sizeof(f->description));

	return 0;
}

static int virtual_g_fmt(struct file *file, void *fh, struct v4l2_format *f)
{
	struct v4l2_pix_format *pix = &f->fmt.pix;

	if (f->type != V4L2_BUF_TYPE_VIDEO_CAPTURE)
		return -EINVAL;

	pix->width = WIDTH;
	pix->height = HEIGHT;
	pix->field = V4L2_FIELD_NONE;
	pix->pixelformat = V4L2_PIX_FMT_RGB565;
	pix->bytesperline = WIDTH * 2;
	pix->sizeimage = VIRTUAL_FRAME_BYTES;
	pix->colorspace = V4L2_COLORSPACE_SRGB;

	return 0;
}

static int virtual_s_fmt(struct file *file, void *fh, struct v4l2_format *f)
{
	/* 虚拟驱动只支持固定格式；真实驱动里可能会把 APP 请求调整到最接近的硬件能力 */
	if (f->type != V4L2_BUF_TYPE_VIDEO_CAPTURE)
		return -EINVAL;
	if (f->fmt.pix.pixelformat != V4L2_PIX_FMT_RGB565)
		return -EINVAL;

	return virtual_g_fmt(file, fh, f);
}

/* 无多路输入的采集设备也应实现 G_INPUT，否则 ffplay/VLC 等会失败 */
static int virtual_g_input(struct file *file, void *fh, unsigned int *i)
{
	*i = 0;
	return 0;
}

static int virtual_s_input(struct file *file, void *fh, unsigned int i)
{
	return i ? -EINVAL : 0;
}

static int virtual_enum_input(struct file *file, void *fh,
			      struct v4l2_input *inp)
{
	if (inp->index)
		return -EINVAL;

	strscpy(inp->name, "Camera", sizeof(inp->name));
	inp->type = V4L2_INPUT_TYPE_CAMERA;

	return 0;
}

static int virtual_try_fmt(struct file *file, void *fh, struct v4l2_format *f)
{
	return virtual_s_fmt(file, fh, f);
}

static int virtual_enum_framesizes(struct file *file, void *fh,
				   struct v4l2_frmsizeenum *fsize)
{
	if (fsize->index)
		return -EINVAL;
	if (fsize->pixel_format != V4L2_PIX_FMT_RGB565)
		return -EINVAL;

	fsize->type = V4L2_FRMSIZE_TYPE_DISCRETE;
	fsize->discrete.width = WIDTH;
	fsize->discrete.height = HEIGHT;

	return 0;
}

/*
 * REQBUFS 时 vb2 会调用 queue_setup，可能调用两次：
 *   第一次：驱动告诉框架需要几个 buffer、每个 plane 多大；
 *   第二次：内存分配完成后，再确认一次参数是否合法。
 * *nplanes != 0 时表示第二次调用。
 */
static int virtual_queue_setup(struct vb2_queue *vq, unsigned int *nbuffers,
			       unsigned int *nplanes, unsigned int sizes[],
			       struct device *alloc_devs[])
{
	if (*nplanes)
		return sizes[0] < VIRTUAL_FRAME_BYTES ? -EINVAL : 0;

	if (vq->num_buffers + *nbuffers < MIN_BUFS)
		*nbuffers = MIN_BUFS - vq->num_buffers;

	*nplanes = 1;
	sizes[0] = VIRTUAL_FRAME_BYTES;

	return 0;
}

/*
 * APP 调用 QBUF 后 vb2 会调到 buf_queue。
 * 这里把 buffer 挂到驱动链表，表示“硬件（timer）可以拿去填数据”。
 * 注意：此时 buffer 同时还在 vb2 的 queued_list 中，两套链表职责不同。
 */
static void virtual_buf_queue(struct vb2_buffer *vb)
{
	struct vb2_v4l2_buffer *vbuf = to_vb2_v4l2_buffer(vb);
	/* 从嵌入的 vb2_v4l2_buffer 反查我们的 virtual_buffer */
	struct virtual_buffer *buf =
		container_of(vbuf, struct virtual_buffer, vb);
	unsigned long flags;

	spin_lock_irqsave(&g_dev.buf_lock, flags);
	list_add_tail(&buf->list, &g_dev.queued_bufs);
	spin_unlock_irqrestore(&g_dev.buf_lock, flags);
}

static int virtual_start_streaming(struct vb2_queue *vq, unsigned int count)
{
	g_dev.streaming = true;
	g_dev.frame_seq = 0;
	mod_timer(&g_dev.timer, jiffies + HZ / FPS);

	return 0;
}

static void virtual_stop_streaming(struct vb2_queue *vq)
{
	struct virtual_buffer *buf;
	unsigned long flags;

	g_dev.streaming = false;
	del_timer_sync(&g_dev.timer);

	/*
	 * 停止时把仍在驱动队列里、尚未填充的 buffer 全部归还 vb2。
	 * vb2_buffer_done 可能睡眠，不能持 spinlock 调用，所以先解锁再还 buffer。
	 */
	spin_lock_irqsave(&g_dev.buf_lock, flags);
	while (!list_empty(&g_dev.queued_bufs)) {
		buf = list_first_entry(&g_dev.queued_bufs, struct virtual_buffer, list);
		list_del(&buf->list);
		spin_unlock_irqrestore(&g_dev.buf_lock, flags);
		vb2_buffer_done(&buf->vb.vb2_buf, VB2_BUF_STATE_ERROR);
		spin_lock_irqsave(&g_dev.buf_lock, flags);
	}
	spin_unlock_irqrestore(&g_dev.buf_lock, flags);
}

static const struct vb2_ops virtual_vb2_ops = {
	.queue_setup = virtual_queue_setup,
	.buf_queue = virtual_buf_queue,
	.start_streaming = virtual_start_streaming,
	.stop_streaming = virtual_stop_streaming,
	/* 下面两个是 vb2 等待 buffer 时释放/重新获取 queue->lock 的标准写法 */
	.wait_prepare = vb2_ops_wait_prepare,
	.wait_finish = vb2_ops_wait_finish,
};

static const struct v4l2_ioctl_ops virtual_ioctl_ops = {
	.vidioc_querycap = virtual_querycap,
	.vidioc_enum_input = virtual_enum_input,
	.vidioc_g_input = virtual_g_input,
	.vidioc_s_input = virtual_s_input,
	.vidioc_enum_fmt_vid_cap = virtual_enum_fmt,
	.vidioc_g_fmt_vid_cap = virtual_g_fmt,
	.vidioc_s_fmt_vid_cap = virtual_s_fmt,
	.vidioc_try_fmt_vid_cap = virtual_try_fmt,
	.vidioc_enum_framesizes = virtual_enum_framesizes,
	/* buffer 相关 ioctl 直接复用 vb2 标准实现，内部会回调 virtual_vb2_ops */
	.vidioc_reqbufs = vb2_ioctl_reqbufs,
	.vidioc_create_bufs = vb2_ioctl_create_bufs,
	.vidioc_prepare_buf = vb2_ioctl_prepare_buf,
	.vidioc_querybuf = vb2_ioctl_querybuf,
	.vidioc_qbuf = vb2_ioctl_qbuf,
	.vidioc_dqbuf = vb2_ioctl_dqbuf,
	.vidioc_streamon = vb2_ioctl_streamon,
	.vidioc_streamoff = vb2_ioctl_streamoff,
};

static const struct v4l2_file_operations virtual_fops = {
	.owner = THIS_MODULE,
	.open = v4l2_fh_open,
	.release = vb2_fop_release,
	.poll = vb2_fop_poll,		/* APP poll 等待 done_list 有 buffer */
	.mmap = vb2_fop_mmap,		/* 把 videobuf2 内存映射到用户空间 */
	.unlocked_ioctl = video_ioctl2,	/* ioctl 入口，分发给 v4l2_ioctl_ops */
};

static int __init virtual_video_init(void)
{
	struct virtual_dev *dev = &g_dev;
	int ret;

	mutex_init(&dev->lock);
	spin_lock_init(&dev->buf_lock);
	INIT_LIST_HEAD(&dev->queued_bufs);
	timer_setup(&dev->timer, virtual_timer_fn, 0);

	/* 1. 初始化 videobuf2 队列 */
	dev->vb_queue.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
	dev->vb_queue.io_modes = VB2_MMAP | VB2_DMABUF;
	dev->vb_queue.drv_priv = dev;
	dev->vb_queue.buf_struct_size = sizeof(struct virtual_buffer);
	dev->vb_queue.ops = &virtual_vb2_ops;
	dev->vb_queue.mem_ops = &vb2_vmalloc_memops; /* 不依赖 DMA 的虚拟内存分配 */
	dev->vb_queue.timestamp_flags = V4L2_BUF_FLAG_TIMESTAMP_MONOTONIC;
	dev->vb_queue.lock = &dev->lock;

	ret = vb2_queue_init(&dev->vb_queue);
	if (ret)
		return ret;

	/* 2. 注册 v4l2_device；parent 为 NULL 时必须预先填写 name */
	strscpy(dev->v4l2_dev.name, DRIVER_NAME, sizeof(dev->v4l2_dev.name));
	ret = v4l2_device_register(NULL, &dev->v4l2_dev);
	if (ret)
		return ret;

	/* 3. 设置并注册 video_device，生成 /dev/videoX */
	dev->vdev.v4l2_dev = &dev->v4l2_dev;
	dev->vdev.fops = &virtual_fops;
	dev->vdev.ioctl_ops = &virtual_ioctl_ops;
	dev->vdev.release = video_device_release_empty;
	dev->vdev.lock = &dev->lock;
	dev->vdev.device_caps = V4L2_CAP_VIDEO_CAPTURE | V4L2_CAP_STREAMING;
	strscpy(dev->vdev.name, "Virtual Video", sizeof(dev->vdev.name));
	dev->vdev.queue = &dev->vb_queue;

	ret = video_register_device(&dev->vdev, VFL_TYPE_VIDEO, -1);
	if (ret) {
		v4l2_device_unregister(&dev->v4l2_dev);
		return ret;
	}

	pr_info(DRIVER_NAME ": registered as /dev/video%d\n", dev->vdev.num);
	return 0;
}

static void __exit virtual_video_exit(void)
{
	struct virtual_dev *dev = &g_dev;

	video_unregister_device(&dev->vdev);
	v4l2_device_unregister(&dev->v4l2_dev);
	del_timer_sync(&dev->timer);
}

module_init(virtual_video_init);
module_exit(virtual_video_exit);

MODULE_AUTHOR("100ask");
MODULE_DESCRIPTION("Minimal virtual V4L2 capture driver");
MODULE_LICENSE("GPL");
