# Out-of-tree build for Linux 6.8+
#
# Kernel module:
#   make
#   make load          # 先加载 V4L2/vb2 依赖，再 insmod
#   sudo rmmod virtual_video   # 卸载本驱动（依赖模块可保留）
#
# Userspace app:
#   make app
#   ./capture_test /dev/videoX
#
# Cross build example:
#   make KDIR=/path/to/linux-6.8 ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu-

KDIR ?= /lib/modules/$(shell uname -r)/build
# 与 distro 内核构建一致的编译器，避免 kbuild “compiler differs” 告警
KBUILD_CC ?= $(shell command -v x86_64-linux-gnu-gcc-12 2>/dev/null \
	|| command -v gcc-12 2>/dev/null || echo gcc)
CC ?= gcc

obj-m := virtual_video.o

all: modules app

modules:
	$(MAKE) -C $(KDIR) M=$(CURDIR) modules \
		$(if $(CROSS_COMPILE),,CC=$(KBUILD_CC))

app: capture_test

capture_test: capture_test.c
	$(CC) -Wall -O2 -o $@ $<

clean:
	$(MAKE) -C $(KDIR) M=$(CURDIR) clean
	rm -f capture_test capture_*.raw

# 加载 videodev / videobuf2 等符号提供方（仅 modprobe videobuf2-vmalloc 不够）
load-deps:
	-modprobe videobuf2-common
	-modprobe videobuf2-v4l2
	-modprobe videodev
	-modprobe videobuf2-vmalloc

load: modules load-deps
	-insmod $(CURDIR)/virtual_video.ko

unload:
	-rmmod virtual_video

# 预览 /dev/video0（需已 make load；rgb565 640x480）
play:
	ffplay -hide_banner -loglevel warning -f v4l2 \
		-input_format rgb565 -video_size 640x480 /dev/video0

.PHONY: all modules app clean load-deps load unload play
