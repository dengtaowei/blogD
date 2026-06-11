# V4L2 虚拟采集驱动

Linux 6.8+ 下的最小 **V4L2 capture** 实验：`virtual_video.ko` 用 timer 模拟硬件填帧，用户态 `capture_test` 走 mmap + QBUF/DQBUF 流程。

| 项目 | 说明 |
|------|------|
| 分辨率 | 640×480 |
| 像素格式 | RGB565（`V4L2_PIX_FMT_RGB565`） |
| 节点 | 加载后出现 `/dev/videoX`（多为 `video0`） |

## 环境

- 已安装当前内核对应的 **headers**：`linux-headers-$(uname -r)`
- 编译模块需要 **gcc** 与 **make**
- 用户态示例只需 **gcc**
- 实时预览需要 **ffmpeg**（`ffplay`）

```bash
# Ubuntu / Debian 示例
sudo apt install build-essential linux-headers-$(uname -r)
sudo apt install ffmpeg    # 可选，用于 ffplay 预览
```

## 编译

```bash
cd code/v4l2-virtual
make          # 内核模块 virtual_video.ko + 用户程序 capture_test
make modules  # 仅编译 .ko
make app      # 仅编译 capture_test
make clean    # 清理 .ko、.o 与 capture_test
```

交叉编译示例（需自备对应架构的 `KDIR`）：

```bash
make KDIR=/path/to/linux-6.8 ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu-
```

## 加载与卸载

本驱动依赖内核里的 **videodev / videobuf2**，需先 `modprobe` 再 `insmod`（只加载 `videobuf2-vmalloc` 不够）。

```bash
make load          # load-deps + insmod virtual_video.ko
# 或分步：
make load-deps
sudo insmod ./virtual_video.ko

dmesg | tail -1    # 期望看到：virtual_video: registered as /dev/videoX
ls -l /dev/video*
```

卸载：

```bash
make unload
# 或：sudo rmmod virtual_video
```

依赖模块（`videodev`、`videobuf2-*`）可保留，不影响下次加载。

### 权限

`/dev/videoX` 属组为 `video`。临时用 `sudo` 运行测试程序，或：

```bash
sudo usermod -aG video $USER   # 重新登录后生效
```

## 用户态采集（保存 .raw）

```bash
./capture_test /dev/video0        # 默认采 5 帧
./capture_test /dev/video0 10     # 采 10 帧
```

生成 `capture_000.raw` … 为**无文件头的裸 RGB565**（每文件 614400 字节）。查看示例：

```bash
ffmpeg -f rawvideo -pixel_format rgb565le -video_size 640x480 \
  -i capture_000.raw -frames:v 1 capture_000.png
xdg-open capture_000.png
```

## 实时预览（播放 /dev/video0）

需已 `make load`，并在**有图形界面**的终端执行（`DISPLAY` 可用）：

```bash
sudo ffplay -f v4l2 -input_format rgb565 -video_size 640x480 /dev/video0
```

或：

```bash
sudo make play
```

按 `q` 退出。画面为红 / 绿 / 蓝纯色每秒切换，用于确认采集链路正常。

## 文件

| 文件 | 说明 |
|------|------|
| `virtual_video.c` | 虚拟 V4L2 驱动（vb2 + timer） |
| `capture_test.c` | 最小 mmap 采集应用 |
| `Makefile` | 编译、`load` / `unload` / `play` 目标 |

## 关联

- [V4L2 设备注册与 video 节点](/analysis/kernel/media/v4l2-device-registration)
- [V4L2 ioctl 分发](/analysis/kernel/media/v4l2-ioctl-dispatch)
