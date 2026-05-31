/*
 * Minimal V4L2 capture app for virtual_video.ko (640x480 RGB565)
 *
 * Usage: ./capture_test /dev/videoX [frame_count]
 *
 * 对应课程 01_V4L2应用程序开发.md 1.2 节的 mmap 采集流程。
 */

#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

#include <linux/videodev2.h>

#define WIDTH		640
#define HEIGHT		480
#define FOURCC		V4L2_PIX_FMT_RGB565
#define BUF_COUNT	4		/* 向驱动申请 4 个 buffer；驱动可能给更少 */
#define DEFAULT_FRAMES	5

/*
 * 包装 ioctl：被信号中断（EINTR）时自动重试。
 * V4L2 阻塞 ioctl 在收到信号时可能返回 EINTR，直接当失败处理不合适。
 */
static int xioctl(int fd, unsigned long req, void *arg)
{
	int ret;

	do {
		ret = ioctl(fd, req, arg);
	} while (ret == -1 && errno == EINTR);

	return ret;
}

static void save_frame(const char *path, const void *data, size_t len)
{
	int out = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
	ssize_t n;

	if (out < 0) {
		perror(path);
		return;
	}

	n = write(out, data, len);
	if (n < 0 || (size_t)n != len)
		fprintf(stderr, "%s: write failed\n", path);
	else
		printf("saved %s (%zu bytes)\n", path, len);

	close(out);
}

int main(int argc, char **argv)
{
	int fd, i, type, frame_goal, got;
	char path[64];
	struct v4l2_capability cap;
	struct v4l2_format fmt;
	struct v4l2_requestbuffers req;
	struct v4l2_buffer buf;
	struct pollfd pfd;
	/*
	 * maps[i] 保存每个 buffer 在用户空间的 mmap 地址。
	 * DQBUF 返回 buf.index，用 maps[buf.index] 访问这一帧数据。
	 */
	void *maps[BUF_COUNT];

	if (argc < 2) {
		fprintf(stderr, "Usage: %s </dev/videoX> [frame_count]\n", argv[0]);
		return 1;
	}

	frame_goal = (argc >= 3) ? atoi(argv[2]) : DEFAULT_FRAMES;
	if (frame_goal <= 0)
		frame_goal = DEFAULT_FRAMES;

	fd = open(argv[1], O_RDWR);
	if (fd < 0) {
		perror("open");
		return 1;
	}

	/* ---------- 1. 查询设备能力 ---------- */
	memset(&cap, 0, sizeof(cap));
	if (xioctl(fd, VIDIOC_QUERYCAP, &cap) < 0) {
		perror("VIDIOC_QUERYCAP");
		goto out_close;
	}

	/* 必须支持视频捕获 + streaming（mmap 方式），否则后面 QBUF/DQBUF 不可用 */
	if (!(cap.capabilities & V4L2_CAP_VIDEO_CAPTURE) ||
	    !(cap.capabilities & V4L2_CAP_STREAMING)) {
		fprintf(stderr, "%s: capture or streaming not supported\n", argv[1]);
		goto out_close;
	}

	printf("device: %s (%s)\n", cap.card, cap.driver);

	/* ---------- 2. 设置格式（需与驱动一致） ---------- */
	memset(&fmt, 0, sizeof(fmt));
	fmt.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
	fmt.fmt.pix.width = WIDTH;
	fmt.fmt.pix.height = HEIGHT;
	fmt.fmt.pix.pixelformat = FOURCC;
	fmt.fmt.pix.field = V4L2_FIELD_NONE;

	if (xioctl(fd, VIDIOC_S_FMT, &fmt) < 0) {
		perror("VIDIOC_S_FMT");
		goto out_close;
	}

	/* 驱动可能调整宽高；虚拟驱动会固定为 640x480 */
	printf("format: %ux%u, sizeimage=%u\n",
	       fmt.fmt.pix.width, fmt.fmt.pix.height, fmt.fmt.pix.sizeimage);

	/* ---------- 3. 申请 buffer ---------- */
	memset(&req, 0, sizeof(req));
	req.count = BUF_COUNT;
	req.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
	req.memory = V4L2_MEMORY_MMAP;	/* 使用 mmap 方式，与驱动 vb2_queue 配置对应 */

	if (xioctl(fd, VIDIOC_REQBUFS, &req) < 0) {
		perror("VIDIOC_REQBUFS");
		goto out_close;
	}

	/* req.count 是驱动实际分配的数量，可能小于我们请求的值 */
	if (req.count < 2) {
		fprintf(stderr, "not enough buffers\n");
		goto out_close;
	}

	/* ---------- 4. 查询每个 buffer 并 mmap 到用户空间 ---------- */
	for (i = 0; i < req.count; i++) {
		memset(&buf, 0, sizeof(buf));
		buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
		buf.memory = V4L2_MEMORY_MMAP;
		buf.index = i;

		if (xioctl(fd, VIDIOC_QUERYBUF, &buf) < 0) {
			perror("VIDIOC_QUERYBUF");
			goto out_close;
		}

		/*
		 * buf.m.offset 是驱动提供的 mmap 偏移；
		 * 映射后用户态可直接读写，与内核/timer 填充的是同一块物理/虚拟内存。
		 */
		maps[i] = mmap(NULL, buf.length, PROT_READ | PROT_WRITE,
			       MAP_SHARED, fd, buf.m.offset);
		if (maps[i] == MAP_FAILED) {
			perror("mmap");
			goto out_close;
		}
	}

	/* ---------- 5. 把所有 buffer 放入驱动的“空闲队列”（QBUF） ---------- */
	for (i = 0; i < req.count; i++) {
		memset(&buf, 0, sizeof(buf));
		buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
		buf.memory = V4L2_MEMORY_MMAP;
		buf.index = i;

		if (xioctl(fd, VIDIOC_QBUF, &buf) < 0) {
			perror("VIDIOC_QBUF");
			goto out_close;
		}
	}

	/* ---------- 6. 启动采集；驱动 timer 开始往 QBUF 交出的 buffer 写帧 ---------- */
	type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
	if (xioctl(fd, VIDIOC_STREAMON, &type) < 0) {
		perror("VIDIOC_STREAMON");
		goto out_close;
	}

	/* ---------- 7. 循环：等待 → 取帧 → 处理 → 还 buffer ---------- */
	for (got = 0; got < frame_goal; got++) {
		memset(&pfd, 0, sizeof(pfd));
		pfd.fd = fd;
		pfd.events = POLLIN;	/* 有帧可读时驱动会让 poll 返回 POLLIN */

		if (poll(&pfd, 1, 3000) <= 0) {
			fprintf(stderr, "poll timeout\n");
			break;
		}

		memset(&buf, 0, sizeof(buf));
		buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
		buf.memory = V4L2_MEMORY_MMAP;

		/* 从驱动“完成队列”取出一帧；buf.index 指示用的是哪个 buffer */
		if (xioctl(fd, VIDIOC_DQBUF, &buf) < 0) {
			perror("VIDIOC_DQBUF");
			break;
		}

		printf("frame %d: index=%u seq=%u bytesused=%u\n",
		       got, buf.index, buf.sequence, buf.bytesused);

		snprintf(path, sizeof(path), "capture_%03d.raw", got);
		save_frame(path, maps[buf.index], buf.bytesused);

		/*
		 * 处理完后必须 QBUF 归还 buffer，否则驱动可用 buffer 越来越少，
		 * 最终无法继续采集。
		 */
		if (xioctl(fd, VIDIOC_QBUF, &buf) < 0) {
			perror("VIDIOC_QBUF");
			break;
		}
	}

	/* ---------- 8. 停止采集 ---------- */
	xioctl(fd, VIDIOC_STREAMOFF, &type);

out_close:
	close(fd);
	return 0;
}
