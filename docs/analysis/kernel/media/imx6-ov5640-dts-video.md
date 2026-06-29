---
homeTag: Media · CSI
homeTitle: i.MX6ULL OV5640：设备树到 /dev/video
homeDesc: DVP 设备树、引脚冲突与 mx6s 出现 video 节点
sidebarOrder: 1
sidebarTitle: OV5640 DTS 与 video
date: 2026-06-29
---

# i.MX6ULL OV5640：从设备树到 `/dev/video1`

> **平台**：i.MX6ULL DVP + CSI（百问 Pro 板级对照）  
> **内核**：NXP BSP **Linux 4.9.88**（`ov5640_camera_v2/v3.ko`、`mx6s_capture.ko`）；与站点 V4L2 框架文（Linux 6.8）路径不同，差异处另行注明  
> **关联**：[V4L2 设备注册](/analysis/kernel/media/v4l2-device-registration) · [V4L2 ioctl 分发](/analysis/kernel/media/v4l2-ioctl-dispatch) · [videobuffer2 队列](/analysis/kernel/media/v4l2-vb2-queue) · [IMX6ULL SPI 片选 GPIO](/analysis/kernel/debug/gpio/imx6ull-spi-cs-gpio-runtime-pm)  
> **本文**：DTS、引脚冲突、驱动加载、V4L2 节点

---

## 目录

- [1. 本文要回答什么](#1-本文要回答什么)
- [2. 硬件拓扑](#2-硬件拓扑与-evk-的差异)
- [3. 软件栈](#3-软件栈)
- [4. 设备树改了什么](#4-设备树改了什么)
- [5. 编译与部署](#5-编译与部署)
- [6. 板端验证](#6-板端验证)
- [7. 小结](#7-小结)
- [8. 关联文档](#8-关联文档)

---

## 1. 本文要回答什么

> **CAMERA_PORT 走 DVP 并行 + I2C1 时，怎样改设备树和 BSP 模块，才能在板子上出现可用的 `/dev/video1`？**

本文覆盖：硬件依据 → DTS → 模块 → `v4l2-ctl`。`mx6s_capture` 注册 video 节点的框架语义见 [V4L2 设备注册](/analysis/kernel/media/v4l2-device-registration)。

---

## 2. 硬件拓扑（与 EVK 的差异）

### 2.1 接口与 I2C

| 项目 | 本板（百问 Pro 对照） | NXP EVK 参考 |
|------|----------------------|--------------|
| 数据接口 | **DVP 8-bit** + CSI | 同为 CSI，但板级接线不同 |
| 配置总线 | **I2C1** → Linux **`/dev/i2c-0`** | 常挂在 i2c2 |
| OV5640 地址 | **0x3c** | 0x3c |

### 2.2 电源 / 复位（74HC595）

| 原理图 | HC595 位 | DTS |
|--------|----------|-----|
| CSI_PWREN | QF（第 5 位） | `pwn-gpios = <&gpio_spi 5 1>` |
| CSI_RST | QE（第 4 位） | `rst-gpios = <&gpio_spi 4 0>` |

### 2.3 引脚冲突

原 DTS 把 CSI 引脚给了 UART6 / ECSPI1。启用摄像头必须：

- 新增 `pinctrl_csi1`，CSI 引脚改回复用
- `&uart6 { status = "disabled"; }`
- `&ecspi1 { status = "disabled"; }`

---

## 3. 软件栈

```text
OV5640 ──I2C──► ov5640_camera_v2.ko（或 v3）
   │
   └──DVP──► mx6s_capture.ko ──► /dev/video1 (V4L2, YUYV)
```

| 模块 | 说明 |
|------|------|
| `ov5640_camera_v2.ko` | 默认，VGA 稳定 |
| `ov5640_camera_v3.ko` | 可选，多分辨率 |
| `mx6s_capture.ko` | CSI 采集，**须后加载** |

v2 / v3 **不能同时 insmod**（I2C 设备名冲突）。模块为 **NXP BSP 外置驱动**，非 mainline `drivers/media/i2c/ov5640.c`。

---

## 4. 设备树改了什么

文件：`arch/arm/boot/dts/100ask_imx6ull-14x14.dts`  
参考 NXP `imx6ull-14x14-evk.dts` 的 CSI/OV5640 写法，但 **I2C 按本板原理图挂在 `&i2c1`**（不是 EVK 的 i2c2）。

### 4.1 新增 CSI pinctrl（`pinctrl_csi1`）

**改了什么：**

```dts
pinctrl_csi1: csi1grp {
    fsl,pins = <
        MX6UL_PAD_CSI_MCLK__CSI_MCLK        0x1b088
        MX6UL_PAD_CSI_PIXCLK__CSI_PIXCLK    0x1b088
        MX6UL_PAD_CSI_VSYNC__CSI_VSYNC      0x1b088
        MX6UL_PAD_CSI_HSYNC__CSI_HSYNC      0x1b088
        MX6UL_PAD_CSI_DATA00__CSI_DATA02    0x1b088
        MX6UL_PAD_CSI_DATA01__CSI_DATA03    0x1b088
        MX6UL_PAD_CSI_DATA02__CSI_DATA04    0x1b088
        MX6UL_PAD_CSI_DATA03__CSI_DATA05    0x1b088
        MX6UL_PAD_CSI_DATA04__CSI_DATA06    0x1b088
        MX6UL_PAD_CSI_DATA05__CSI_DATA07    0x1b088
        MX6UL_PAD_CSI_DATA06__CSI_DATA08    0x1b088
        MX6UL_PAD_CSI_DATA07__CSI_DATA09    0x1b088
    >;
};
```

**为什么要改：**

- 原 DTS 里，这组 PAD 被 **`pinctrl_uart6`**、**`pinctrl_ecspi1`** 占作 UART6 / ECSPI1，引脚处于串口/SPI 复用，CSI 硬件收不到 MCLK、PIXCLK、VSYNC/HSYNC 和 8 路数据线。
- 必须新增 `pinctrl_csi1`，把这些 PAD **改回复用为 CSI 功能**，摄像头 DVP 才有物理通路。
- `CSI_DATA00` 映射到 SoC 的 `CSI_DATA02` 是 i.MX6UL/ULL 的硬件设计（D0/D1 未引出到 CAMERA_PORT），与 EVK 一致，不是写错。

### 4.2 在 `&i2c1` 下新增 OV5640 节点

**改了什么：**

```dts
&i2c1 {
    clock-frequency = <100000>;
    pinctrl-names = "default";
    pinctrl-0 = <&pinctrl_i2c1>;
    status = "okay";

    ov5640: ov5640@3c {
        compatible = "ovti,ov5640";
        reg = <0x3c>;
        pinctrl-names = "default";
        pinctrl-0 = <&pinctrl_csi1>;
        clocks = <&clks IMX6UL_CLK_CSI>;
        clock-names = "csi_mclk";
        pwn-gpios = <&gpio_spi 5 1>;   /* 74595_CSI_PWREN，原理图 QF bit5 */
        rst-gpios = <&gpio_spi 4 0>;   /* 74595_CSI_RST，原理图 QE bit4 */
        csi_id = <0>;
        mclk = <24000000>;
        mclk_source = <0>;
        status = "okay";
        port {
            ov5640_ep: endpoint {
                remote-endpoint = <&csi1_ep>;
            };
        };
    };
};
```

**为什么要改：**

| 属性 | 是否必须 | 驱动是否读取 | 作用 |
|------|----------|--------------|------|
| 挂在 **`&i2c1`** | 是 | I2C 核心 | 原理图 CAMERA_PORT 走 **I2C1**（Linux **`/dev/i2c-0`**）；挂错总线则 `i2cdetect` 永远看不到 0x3c |
| `compatible = "ovti,ov5640"` | 是 | v3 `of_match`；v2 靠 `id_table` | 匹配 `ov5640_camera_v2.ko` / `ov5640_camera_v3.ko` |
| `pinctrl-0 = <&pinctrl_csi1>` | 是 | v2/v3 `devm_pinctrl_get_select_default()` | CSI 引脚复用；probe 失败则驱动不加载 |
| `clocks` / `mclk = <24000000>` | 是 | v2/v3 `clk_set_rate()` | 给 OV5640 **24MHz** MCLK |
| `pwn-gpios` / `rst-gpios` | 是 | v2/v3 GPIO 请求 | 74HC595 控制电源/复位 |
| `mclk_source = <0>` | probe 必填 | **读了未用** | NXP 遗留字段，DVP 路径逻辑上不参与配置 |
| `csi_id = <0>` | probe 必填 | **读了未用**（DVP） | MIPI 驱动才用；DVP 删掉会 probe 失败 |
| `port` + `remote-endpoint` | 是 | `mx6s` `of_graph` | 连接 sensor ↔ CSI，否则 CSI 找不到子设备 |

### 4.3 使能 CSI 控制器（`&csi`）

**改了什么：**

```dts
&csi {
    status = "okay";

    port {
        csi1_ep: endpoint {
            remote-endpoint = <&ov5640_ep>;
        };
    };
};
```

**为什么要改：**

- `imx6ull.dtsi` 里 CSI 默认可能是 `disabled` 或未完成与传感器的图连接；不改则 **`mx6s_capture` 不会注册 `/dev/video*`**。
- `status = "okay"` 打开 CSI 控制器。
- `csi1_ep` ↔ `ov5640_ep` 与 4.2 成对，形成 **sensor → CSI** 的 media graph，驱动 probe 时才能 `Registered sensor subdevice: ov5640`。

### 4.4 禁用引脚冲突外设（UART6 / ECSPI1）

**改了什么：**

```dts
&uart6 {
    pinctrl-names = "default";
    pinctrl-0 = <&pinctrl_uart6>;
    status = "disabled";
};

&ecspi1 {
    pinctrl-names = "default";
    pinctrl-0 = <&pinctrl_ecspi1>;
    fsl,spi-num-chipselects = <2>;
    cs-gpios = <&gpio4 26 GPIO_ACTIVE_LOW>, <&gpio4 24 GPIO_ACTIVE_LOW>;
    status = "disabled";
    /* ... */
};
```

**为什么要改：**

| 外设 | 占用的 CSI 相关 PAD | 不禁用会怎样 |
|------|---------------------|--------------|
| **UART6** | MCLK、PIXCLK 等 | 引脚仍为 UART 功能，CSI 无时钟/同步 |
| **ECSPI1** | DATA03～DATA07 等 | SPI 与 CSI 数据线冲突，采图乱码或无 `/dev/video` |

i.MX6UL 一组 PAD 只能一种复用。启用摄像头就必须 **关掉** 占用同引脚的外设——这是硬件约束。若业务还需要 UART6/ECSPI1，只能把功能迁到其他未占用的 UART/SPI 引脚（需改板级设计或 DTS pinctrl）。

### 4.5 与 EVK 的关键差异（小结）

| 项目 | 本板（百问 Pro 对照） | NXP EVK 常见写法 |
|------|----------------------|------------------|
| OV5640 I2C 父节点 | **`&i2c1`** | 常为 `&i2c2` |
| Linux I2C 设备 | **`/dev/i2c-0`** | 可能是 i2c-1 |
| 电源/复位 GPIO | **74HC595 扩展** `gpio_spi` | 可能是 SoC 直连 GPIO |

改 DTS 后需重新编译并更新 **`100ask_imx6ull-14x14.dtb`**，否则板子仍跑旧引脚配置。

---

## 5. 编译与部署

```bash
cd Linux-4.9.88
export ARCH=arm
export CROSS_COMPILE=arm-buildroot-linux-gnueabihf-   # 或你的 arm-linux-gnueabihf-

# 首次编译、或没有 .config 时：
make 100ask_imx6ull_defconfig

# 改了设备树（或内核/PXP 编进内核）：
make -j$(nproc) zImage dtbs

# 只改了 ov5640 / mx6s 等外部模块、未改 DTS：
make M=drivers/media/platform/mxc/capture -j$(nproc) modules

adb push arch/arm/boot/dts/100ask_imx6ull-14x14.dtb /boot/
adb push drivers/media/platform/mxc/capture/*.ko /lib/modules/4.9.88/extra/
```

产物路径：

| 文件 | 路径 |
|------|------|
| 设备树 | `arch/arm/boot/dts/100ask_imx6ull-14x14.dtb` |
| 内核镜像 | `arch/arm/boot/zImage`（改 PXP 进内核时需刷） |

---

## 6. 板端验证

### 6.1 I2C

```bash
i2cdetect -y 0
# 插摄像头后应见 0x3c
```

### 6.2 加载驱动

```bash
killall mjpg_streamer video2lcd 2>/dev/null
rmmod mx6s_capture ov5640_camera_v2 ov5640_camera_v3 2>/dev/null
insmod /lib/modules/4.9.88/extra/ov5640_camera_v2.ko
insmod /lib/modules/4.9.88/extra/mx6s_capture.ko
dmesg | tail -5
# CSI: Registered sensor subdevice: ov5640 0-003c
```

### 6.3 V4L2

```bash
v4l2-ctl --list-devices
v4l2-ctl -d /dev/video1 --list-formats-ext
# 640x480 YUYV

# 采 5 帧验证（5×614400 = 3072000 字节）
v4l2-ctl -d /dev/video1 --set-fmt-video=width=640,height=480,pixelformat=YUYV \
  --stream-mmap --stream-count=5 --stream-to=/tmp/test.yuv
ls -l /tmp/test.yuv
```

`--stream-mmap` 与 buffer 队列机制见 [videobuffer2 队列](/analysis/kernel/media/v4l2-vb2-queue)；ioctl 路径见 [V4L2 ioctl 分发](/analysis/kernel/media/v4l2-ioctl-dispatch)。

---

## 7. 小结

| 检查项 | 通过标准 |
|--------|----------|
| I2C | `0x3c` 可见 |
| 驱动 | dmesg 注册 ov5640 + csi |
| 节点 | `/dev/video1`，YUYV 640×480 |

---

## 8. 关联文档

| 文档 | 内容 |
|------|------|
| [V4L2 设备注册](/analysis/kernel/media/v4l2-device-registration) | `video_register_device` 与 `/dev/video*` 框架语义 |
| [V4L2 ioctl 分发](/analysis/kernel/media/v4l2-ioctl-dispatch) | `v4l2-ctl` 底层 ioctl 路径 |
| [videobuffer2 队列](/analysis/kernel/media/v4l2-vb2-queue) | `--stream-mmap` 与 buffer 状态机 |
| [UVC 驱动分析](/analysis/kernel/usb/uvc-driver) | USB 摄像头对照（Host 侧 UVC） |
| [IMX6ULL SPI 片选 GPIO](/analysis/kernel/debug/gpio/imx6ull-spi-cs-gpio-runtime-pm) | 同 BSP 下 GPIO / 扩展 IO 调试 |
