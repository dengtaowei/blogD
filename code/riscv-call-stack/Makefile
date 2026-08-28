# 无帧指针（默认，对齐笔记里 nofp 那份录制）：
#   make
# 有帧指针：
#   make fp

CROSS   ?= riscv64-unknown-elf-
CC      := $(CROSS)gcc
CFLAGS  ?= -march=rv32imac -mabi=ilp32 -O1 -g -fno-inline -Wall
LDFLAGS ?=

ELF     := main.elf

.PHONY: all fp dump run clean

all: $(ELF)

$(ELF): main.c
	$(CC) $(CFLAGS) -fomit-frame-pointer $(LDFLAGS) -o $@ $<

fp:
	$(CC) $(CFLAGS) -fno-omit-frame-pointer $(LDFLAGS) -o $(ELF) main.c

dump: $(ELF)
	$(CROSS)objdump -d $<

run: $(ELF)
	qemu-riscv32 ./$(ELF)

clean:
	rm -f $(ELF)
