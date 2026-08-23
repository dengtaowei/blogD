CROSS   ?= aarch64-linux-gnu-
CC      := $(CROSS)gcc
CFLAGS  := -O0 -g -fno-omit-frame-pointer -fno-stack-protector -Wall
LDFLAGS := -static

TARGET  := hello_arm64

.PHONY: all run clean

all: $(TARGET)

$(TARGET): main.c
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $^

run: $(TARGET)
	qemu-aarch64 ./$(TARGET)

clean:
	rm -f $(TARGET)
