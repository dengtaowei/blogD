# Out-of-tree module for STM32MP157 Linux-5.4 (classic kprobe demo).
KERNELDIR ?= /home/adminpc/stm32mp157/Linux-5.4
ARCH ?= arm
CROSS_COMPILE ?= /home/adminpc/stm32mp157/ToolChain/arm-buildroot-linux-gnueabihf_sdk-buildroot/bin/arm-buildroot-linux-gnueabihf-

obj-m := kprobe_brk_demo.o

PWD := $(shell pwd)

.PHONY: all clean modules

all: modules

modules:
	$(MAKE) -C $(KERNELDIR) M=$(PWD) ARCH=$(ARCH) \
		CROSS_COMPILE=$(CROSS_COMPILE) KBUILD_MODPOST_WARN=1 modules

clean:
	$(MAKE) -C $(KERNELDIR) M=$(PWD) ARCH=$(ARCH) CROSS_COMPILE=$(CROSS_COMPILE) clean
	rm -f *.ko *.o *.mod.c *.mod.o *.order *.symvers .*.cmd Module.symvers modules.order
