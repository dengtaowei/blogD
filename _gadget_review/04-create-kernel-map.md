# 04 · create 内核对照

| | |
|---|---|
| **前置** | [`03-configfs-assembly.md`](03-configfs-assembly.md) |
| **本文** | `create()` 每行 shell ↔ 内核函数、三阶段边界 |
| **下一步** | [`05-kernel-reference.md`](05-kernel-reference.md) → [`06-udc-core-bind.md`](06-udc-core-bind.md) |

> 结构体组装视角见 [`03-configfs-assembly.md`](03-configfs-assembly.md)。系列索引：[`README.md`](README.md)。

---

## 1. 三个阶段

`create()` 里各命令并非立刻等价于「USB 设备上线」，内核侧分三阶段：

| 阶段 | 脚本范围 | 内核在做什么 | USB 总线上可见？ |
|------|----------|--------------|----------------|
| **A. 搭骨架** | `modprobe` … `ln -sf` | configfs 建对象、写内存中的描述符字段 | 否 |
| **B. 绑定 UDC** | `echo $UDC > UDC` | composite bind、acm 注册端点、pullup | 是（可被 Host 发现） |
| **C. Host 枚举** | （Host 自动） | EP0 读描述符、`SET_CONFIGURATION` | 是（`/dev/ttyGS0`、Host COM 口） |

下面按 `create()` **逐行**说明阶段 A、B；阶段 C 在最后一节简述。

---

## 2. 逐行对照

### 2.1 `modprobe libcomposite`

| 项 | 说明 |
|----|------|
| **用户态** | 加载 composite / configfs gadget 相关模块（若未编进内核） |
| **内核** | `gadget_cfs_init()` → `configfs_register_subsystem()`，注册 `/sys/kernel/config/usb_gadget/` |
| **结果** | 出现空的 `usb_gadget` 根目录，尚无具体 gadget |
| **USB** | 无变化 |

---

### 2.2 `mkdir -p "$G"`  
（`G=/sys/kernel/config/usb_gadget/deferred_fb_serial`）

| 项 | 说明 |
|----|------|
| **路径** | VFS → `configfs_mkdir()` → `gadgets_make()` |
| **分配** | `kzalloc(struct gadget_info)` |
| **configfs 子目录** | 自动创建 `functions/`、`configs/`、`strings/`、`os_desc/` |
| **设备描述符** | 初始化 `gi->cdev.desc`：`bLength=18`、`bDescriptorType=DEVICE`、默认 `bcdDevice` |
| **驱动模板** | 挂 `configfs_driver_template`，function 名 = `deferred_fb_serial` |
| **sysfs 属性** | 暴露 `idVendor`、`idProduct`、`bcdUSB`、`bcdDevice`、`UDC` 等 |
| **USB** | 无变化（未 bind UDC） |

---

### 2.3 `echo 0x1d6b > idVendor`  
### 2.4 `echo 0x0104 > idProduct`  
### 2.5 `echo 0x0100 > bcdDevice`  
### 2.6 `echo 0x0200 > bcdUSB`

| 脚本 | 写入字段 | 存储位置 |
|------|----------|----------|
| `idVendor` | 厂商 ID | `gi->cdev.desc.idVendor` |
| `idProduct` | 产品 ID | `gi->cdev.desc.idProduct` |
| `bcdDevice` | 设备版本 BCD（1.00） | `gi->cdev.desc.bcdDevice`（经 `is_valid_bcd` 校验） |
| `bcdUSB` | USB 版本 BCD（2.00） | `gi->cdev.desc.bcdUSB` |

- 回调：`gadget_dev_desc_*_store()`，`kstrtou16` 解析后写入。
- **仅改内存**；Host 读到的时机在 bind 后 `GET_DESCRIPTOR(DEVICE)`。
- 注：枚举时 `composite.c` 可能按实际链路速度微调 `bcdUSB`（HS 常为 2.00）。

---

### 2.7 `mkdir -p strings/0x409`

| 项 | 说明 |
|----|------|
| **路径** | `gadget_strings_strings_make()` |
| **语言 ID** | 目录名 `0x409` → `0x0409`（en-US） |
| **分配** | `struct gadget_strings`，加入 `gi->string_list` |
| **sysfs** | 出现 `manufacturer`、`product`、`serialnumber` 三个空属性 |
| **USB** | 字符串索引 `iManufacturer/iProduct/iSerial` 尚未写入 Device Descriptor |

---

### 2.8 `echo "DEMO0002" > strings/0x409/serialnumber`  
### 2.9 `echo "DemoVendor" > strings/0x409/manufacturer`  
### 2.10 `echo "DeferredFB Serial" > strings/0x409/product`

| 项 | 说明 |
|----|------|
| **回调** | `GS_STRINGS_W` → `usb_string_copy()` → `kstrdup()` |
| **存储** | `gs->serialnumber`、`gs->manufacturer`、`gs->product` |
| **限制** | 单条最长 126 字节 |
| **USB** | bind 前 Host 不可见；bind 时见下节 |

---

### 2.11 `mkdir -p configs/c.1/strings/0x409`

| 项 | 说明 |
|----|------|
| **`configs/c.1`** | `config_desc_make()`：解析 `c` + 配置号 `1` |
| **分配** | `struct config_usb_cfg`，`bConfigurationValue=1` |
| **默认值** | `MaxPower = CONFIG_USB_GADGET_VBUS_DRAW`，`bmAttributes = USB_CONFIG_ATT_ONE` |
| **挂接** | `usb_add_config_only()` 把 configuration 链入 `gi->cdev.configs` |
| **子目录** | `configs/c.1/strings/` 用于配置级字符串 |
| **`strings/0x409`** | `gadget_config_name_strings_make()`，语言 0x0409，加入 `cfg->string_list` |

---

### 2.12 `echo "CDC ACM Config" > configs/c.1/strings/0x409/configuration`

| 项 | 说明 |
|----|------|
| **回调** | `gadget_config_name` 的 `configuration` store → `usb_string_copy()` |
| **存储** | `cn->configuration = "CDC ACM Config"` |
| **USB** | bind 时 `usb_gstrings_attach()` 分配索引 → `c->iConfiguration` |

---

### 2.13 `echo 250 > configs/c.1/MaxPower`

| 项 | 说明 |
|----|------|
| **回调** | `gadget_config_desc_MaxPower_store()` |
| **存储** | `cfg->c.MaxPower = 250`（USB 描述符单位 2mA → **500mA**） |
| **USB** | `GET_DESCRIPTOR(CONFIGURATION)` 时 Host 看到 MaxPower |

---

### 2.14 `mkdir -p functions/acm.0`

| 项 | 说明 |
|----|------|
| **路径** | `function_make()`：解析 `acm` + 实例 `0` |
| **调用** | `usb_get_function_instance("acm")` → `acm_alloc_instance()`（`f_acm.c`） |
| **端口** | `gserial_alloc_line(&port_num)` → 分配 **ttyGS 端口号**（通常 0） |
| **注册** | `fi` 加入 `gi->available_func` 链表 |
| **sysfs** | 只读属性 `port_num`（对应 `/dev/ttyGS0`） |
| **USB** | 尚未生成 interface/endpoint 描述符（要等 bind + `usb_add_function`） |

---

### 2.15 `ln -sf functions/acm.0 configs/c.1/acm.0`

| 项 | 说明 |
|----|------|
| **路径** | configfs link → `config_usb_cfg_link()` |
| **校验** | `acm.0` 必须属于本 gadget 的 `available_func` |
| **动作** | `usb_get_function(fi)` → `acm_alloc_func()` 得到 `struct usb_function` |
| **挂接** | `f` 加入 `cfg->func_list`（**尚未** `usb_add_function`，等 bind UDC） |
| **含义** | 声明：configuration `c.1` 包含 ACM 功能 |

---

### 2.16 `echo "$UDC" > UDC`  
（如 `49000000.usb-otg`）

**阶段 B 起点。** 回调 `gadget_dev_desc_UDC_store()`：

```
gadget_dev_desc_UDC_store
  → kstrdup(udc_name)
  → usb_gadget_probe_driver(&gi->composite.gadget_driver)
       → udc_bind_to_driver(udc, driver)
            → driver->bind() 即 configfs_composite_bind()
            → usb_gadget_udc_start()   // dwc2 gadget 启动
            → usb_udc_connect_control() // pullup，Host 可发现设备
```

#### `configfs_composite_bind()` 内部（摘要）

| 顺序 | 动作 |
|------|------|
| 1 | `composite_dev_prepare()` |
| 2 | 检查至少 1 个 configuration、每个 config 至少 1 个 function |
| 3 | **设备字符串**：`usb_gstrings_attach()` → 分配 string ID 1/2/3 → 写 `iManufacturer/iProduct/iSerialNumber` |
| 4 | **配置字符串**：对 `c.1` 的 `"CDC ACM Config"` 分配 `iConfiguration` |
| 5 | OTG 描述符（若 gadget 支持 OTG） |
| 6 | 对每个 function：`usb_add_function(c, f)` → **acm_bind()**：注册 CDC Communication + CDC Data 两个 interface、Bulk/Interrupt 端点 |
| 7 | `usb_ep_autoconfig_reset()` |

#### bind 之后、Host 枚举之前

- dwc2 **D+ pullup**，Host 可复位、读 Device/Config 描述符。
- **`/dev/ttyGS0` 设备节点通常已存在**（`gserial_alloc_line` 时 `tty_register_device`）。
- USB 数据路径 **尚未联通**（要等 Host `SET_CONFIGURATION`）。

---

## 3. 阶段 C：Host 枚举（脚本外自动）

Host 插入并复位后，典型顺序：

```
GET_DESCRIPTOR(DEVICE)        ← gi->cdev.desc（VID/PID/字符串索引）
GET_DESCRIPTOR(CONFIG)        ← 2 interfaces、MaxPower、IAD
SET_CONFIGURATION(1)
  → acm_set_alt() / acm_enable()
  → gserial_connect()         ← USB bulk 与 ttyGS 联通
```

此后：

- 板子：`/dev/ttyGS0` 可读写  
- Linux Host：`/dev/ttyACM0`  
- Windows：COM 口  

内核日志可见 dwc2：`new device is high-speed`、`new address N`。

---

## 4. 总览图

```
create() 用户态                          内核
─────────────────────────────────────────────────────────
modprobe libcomposite          →  注册 configfs usb_gadget 子系统
mkdir deferred_fb_serial       →  gadgets_make() → gadget_info
echo idVendor/Product/...      →  gi->cdev.desc（内存）
mkdir strings/0x409 + echo     →  gadget_strings + kstrdup 文本
mkdir configs/c.1 + echo       →  config_usb_cfg + 配置字符串 + MaxPower
mkdir functions/acm.0          →  acm_alloc_instance + gserial_alloc_line
ln acm.0 → configs/c.1/        →  config_usb_cfg_link → func_list
echo UDC > UDC                 →  configfs_composite_bind
                                  → usb_gstrings_attach
                                  → usb_add_function(acm)
                                  → dwc2 pullup
─────────────────────────────────────────────────────────
Host 枚举                      →  GET_DESCRIPTOR / SET_CONFIGURATION
                                  → gserial_connect → ttyGS0 ⟷ USB
```

---

## 5. `create()` 结束时内核状态检查

| 检查项 | 期望 |
|--------|------|
| `cat .../deferred_fb_serial/UDC` | `49000000.usb-otg` |
| `cat .../functions/acm.0/port_num` | `0` |
| `ls /dev/ttyGS0` | 存在 |
| `cat /sys/class/udc/.../state` | 插线枚举后 `configured` |
| Host `lsusb -d 1d6b:0104` | 2 interfaces，CDC ACM |

---

## 6. 源码索引

| 内容 | 路径 |
|------|------|
| gadget mkdir / UDC | `drivers/usb/gadget/configfs.c` — `gadgets_make`、`gadget_dev_desc_UDC_store`、`configfs_composite_bind` |
| function / config link | 同上 — `function_make`、`config_desc_make`、`config_usb_cfg_link` |
| 字符串宏 | `include/linux/usb/gadget_configfs.h` — `USB_CONFIG_STRINGS_LANG`、`GS_STRINGS_RW` |
| ACM function | `drivers/usb/gadget/function/f_acm.c` — `acm_alloc_instance`、`acm_bind`、`gserial_connect` |
| ttyGS | `drivers/usb/gadget/function/u_serial.c` — `gserial_alloc_line` |
| 描述符响应 | `drivers/usb/gadget/composite.c` — `composite_setup`、`GET_DESCRIPTOR` |
| UDC bind | `drivers/usb/gadget/udc/core.c` — `usb_gadget_probe_driver`、`udc_bind_to_driver` |

---

## 7. 与 `destroy()` 的逆序关系

| `destroy()` | 内核 |
|-------------|------|
| `echo "" > UDC` | `unregister_gadget()` → unbind → 断开 pullup |
| `rm configs/c.1/acm.0` | `config_usb_cfg_unlink()` → `usb_put_function()` |
| `rmdir functions/acm.0` | `function_drop()` → `gserial_free_line()` |
| `rmdir configs/...`、`strings/...` | 释放 configuration / 字符串对象 |
| `rmdir $G` | `gadgets_drop()` → 释放 `gadget_info` |
