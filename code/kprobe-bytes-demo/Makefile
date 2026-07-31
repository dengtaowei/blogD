# Out-of-tree build against the running kernel.
#   make
#   sudo insmod ./kprobe_bytes_demo.ko
#   sudo dmesg | tail -50
#   sudo rmmod kprobe_bytes_demo

obj-m += kprobe_bytes_demo.o

KDIR ?= /lib/modules/$(shell uname -r)/build
PWD  := $(shell pwd)

.PHONY: all clean

all:
	$(MAKE) -C $(KDIR) M=$(PWD) modules

clean:
	$(MAKE) -C $(KDIR) M=$(PWD) clean
