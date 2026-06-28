# 03 · Configfs 组装

| | |
|---|---|
| **前置** | [`02-architecture-overview.md`](02-architecture-overview.md) §7 |
| **本文** | configfs 脚本如何填 `gadget_info` / `cdev` / `composite` |
| **下一步** | [`04-create-kernel-map.md`](04-create-kernel-map.md) |

> 脚本：`deferred_fb_serial` + `acm.0`。系列索引：[`README.md`](README.md)。

---

## 1. 一句话

```
用户空间 create()
    = 往 gadget_info 里拼装 cdev（设备长什么样）
    + 配置 composite（谁驱动这台设备）
    → echo UDC = 组装完成，注册到 UDC、pullup
    → Host 枚举 = 对外呈现 USB 设备
```

**最重要的两个成员：**

```c
struct gadget_info {
    ...
    struct usb_composite_driver composite;  /* 驱动壳 → 挂 UDC */
    struct usb_composite_dev    cdev;       /* 设备体 → 描述符 + 配置 + 功能 */
    ...
};
```

定义于 `drivers/usb/gadget/configfs.c`。

---

## 2. 结构体层次

```
gadget_info                          ← mkdir deferred_fb_serial 分配
├── cdev                             ← 设备本体（Host 看到的「东西」）
│   ├── desc                         ← Device Descriptor（VID/PID/字符串索引…）
│   ├── configs ──→ config_usb_cfg   ← 每个 mkdir configs/c.N
│   │                 ├── c          ← usb_configuration（MaxPower、iConfiguration…）
│   │                 ├── string_list → configuration 字符串
│   │                 └── func_list  → usb_function（acm）
│   └── gstrings / string_list       ← 设备级 manufacturer/product/serial
│
├── composite                        ← 驱动壳
│   ├── bind = configfs_composite_bind
│   └── gadget_driver                ← 含 udc_name；probe 时注册
│
├── available_func                   ← mkdir functions/acm.0 的实例
└── string_list                      ← mkdir strings/0x409
```

辅助结构（零件，最终都汇入 `cdev` 或 `composite`）：

| 结构体 | 脚本操作 | 汇入 |
|--------|----------|------|
| `gadget_strings` | `strings/0x409` + echo | `cdev` 设备字符串 |
| `config_usb_cfg` | `configs/c.1` | `cdev.configs` |
| `gadget_config_name` | `configs/c.1/strings/0x409` | `usb_configuration.iConfiguration` |
| `usb_function_instance` | `functions/acm.0` | `available_func` |
| `usb_function` | `ln acm.0 → configs/c.1/` | `cfg->func_list` → bind 时 `usb_add_function` |

---

## 3. 组装 `cdev`（设备体）

### 3.1 分配与初始化 — `mkdir deferred_fb_serial`

`gadgets_make()`：

```c
gi = kzalloc(sizeof(*gi), ...);
composite_init_dev(&gi->cdev);           /* configs、gstrings 空链表 */
gi->cdev.desc.bLength = USB_DT_DEVICE_SIZE;
gi->cdev.desc.bDescriptorType = USB_DT_DEVICE;
gi->cdev.desc.bcdDevice = default;
```

此时 `cdev` 只有**空的设备壳**，无 configuration、无 function。

---

### 3.2 填 Device Descriptor — `echo idVendor / idProduct / …`

| 脚本 | 写入 |
|------|------|
| `idVendor` | `gi->cdev.desc.idVendor` |
| `idProduct` | `gi->cdev.desc.idProduct` |
| `bcdDevice` | `gi->cdev.desc.bcdDevice` |
| `bcdUSB` | `gi->cdev.desc.bcdUSB` |

仍在**内存**；`iManufacturer / iProduct / iSerialNumber` 此时为 0，等字符串 bind 时再填。

---

### 3.3 填设备字符串 — `strings/0x409`

```
mkdir strings/0x409
  → gadget_strings 入 gi->string_list
  → gs->stringtab_dev.language = 0x0409

echo → manufacturer / product / serialnumber
  → kstrdup 到 gs->manufacturer 等（尚未挂到 cdev.desc 索引）
```

**bind 时**（`configfs_composite_bind`）才完成：

```c
gs->strings[USB_GADGET_MANUFACTURER_IDX].s = gs->manufacturer;
...
usb_gstrings_attach(&gi->cdev, gi->gstrings, ...);
gi->cdev.desc.iManufacturer = s[0].id;   /* 通常 = 1 */
gi->cdev.desc.iProduct      = s[1].id;   /* 通常 = 2 */
gi->cdev.desc.iSerialNumber = s[2].id;   /* 通常 = 3 */
```

---

### 3.4 填 Configuration — `configs/c.1`

```
mkdir configs/c.1
  → config_usb_cfg
  → cfg->c.bConfigurationValue = 1
  → cfg->c.label = "c"
  → usb_add_config_only(&gi->cdev, &cfg->c)   /* 链入 cdev.configs */

echo 250 > MaxPower  → cfg->c.MaxPower = 250
mkdir configs/c.1/strings/0x409
echo "CDC ACM Config" > configuration
  → 配置字符串，bind 时 → c->iConfiguration
```

此时 `cdev.configs` 里有一个 configuration，但 **还没有 interface**（func_list 为空）。

---

### 3.5 填 Function — `functions/acm.0` + symlink

**实例（零件仓库）：**

```
mkdir functions/acm.0
  → usb_function_instance 入 gi->available_func
  → gserial_alloc_line() → port_num = 0  →  /dev/ttyGS0 节点
```

**装入 configuration（组装）：**

```
ln -s functions/acm.0 configs/c.1/
  → config_usb_cfg_link()
  → acm_alloc_func() → usb_function
  → 入 cfg->func_list（仍非 cdev 正式成员，待 bind）
```

`cdev` 在 bind 前：**有 config 骨架 + func_list 里的 acm，描述符尚未生成。**

---

## 4. 组装 `composite`（驱动壳）

`mkdir` 时一并初始化：

```c
gi->composite.gadget_driver = configfs_driver_template;
gi->composite.gadget_driver.function = "deferred_fb_serial";
gi->composite.bind   = configfs_composite_bind;   /* 最初 gadgets_make 里为 do_nothing，
                                                       模板里改为 composite_bind */
```

| 字段 | 含义 | 何时确定 |
|------|------|----------|
| `composite.bind` | 把 `cdev` 里攒好的 configs/functions/strings 真正绑到 `usb_gadget` | `echo UDC` |
| `composite.gadget_driver.setup` | EP0 控制传输 → `composite_setup()` | 模板固定 |
| `composite.gadget_driver.udc_name` | 绑哪颗 UDC | `echo UDC` 写入 |

**`composite` 自己不存 VID/PID**；它通过 `bind(cdev)` 操作嵌入在同一 `gadget_info` 里的 `cdev`。

---

## 5. 提交组装结果 — `echo UDC > UDC`

```c
gadget_dev_desc_UDC_store()
  → gi->composite.gadget_driver.udc_name = "49000000.usb-otg"
  → usb_gadget_probe_driver(&gi->composite.gadget_driver)
       → udc_bind_to_driver()
            → composite.bind(gadget)    /* configfs_composite_bind */
            → usb_gadget_udc_start()    /* dwc2 启动 */
            → pullup                    /* Host 可发现 */
```

### `configfs_composite_bind()` 如何把零件焊进 `cdev`

| 步骤 | 对 `cdev` / composite 的作用 |
|------|-------------------------------|
| `composite_dev_prepare()` | `cdev->gadget = dwc2` |
| `usb_gstrings_attach()` | 设备字符串 ID → `cdev.desc.i*` |
| 配置字符串 attach | `c->iConfiguration` |
| `usb_add_function(c, f)` | acm 生成 **2 interface + 3 endpoint** 描述符，挂到 configuration |
| OTG 描述符（若适用） | 附加到 configuration |

**组装完成标志：** `cdev` 具备完整 Device + Configuration + Interface 描述符树，且已连上 `usb_gadget`。

---

## 6. Host 枚举 — 运行时激活（非 configfs 组装）

configfs 组装的是**静态描述符与 function 对象**；Host 插线后：

```
GET_DESCRIPTOR(DEVICE)     ← 读 cdev.desc
GET_DESCRIPTOR(CONFIG)     ← 读 cdev.configs + acm 描述符
SET_CONFIGURATION(1)
  → acm_enable()
  → gserial_connect()      ← USB bulk 与 ttyGS0 数据路径打通
```

**`gserial_connect` 不属于 configfs 组装**，是 Host 选中 configuration 后的运行时步骤。

---

## 7. 脚本 → 结构体 速查表

| 脚本 | 组装的结构 / 字段 |
|------|-------------------|
| `modprobe libcomposite` | 注册 configfs `usb_gadget` 子系统 |
| `mkdir deferred_fb_serial` | `gadget_info`；初始化 `cdev`、`composite` 骨架 |
| `echo … > idVendor` 等 | `cdev.desc.*` |
| `mkdir strings/0x409` + echo | `gadget_strings` → `gi->string_list` |
| `mkdir configs/c.1` | `config_usb_cfg` → `cdev.configs` |
| `echo MaxPower / configuration` | `cfg->c.*`、`gadget_config_name` |
| `mkdir functions/acm.0` | `usb_function_instance` → `available_func` |
| `ln acm.0 configs/c.1/` | `usb_function` → `cfg->func_list` |
| `echo UDC` | `composite.gadget_driver.udc_name`；执行 bind，**焊合** `cdev` 与 `gadget` |

---

## 8. 与 legacy composite 的对应

| Legacy（代码写死） | Configfs（脚本组装） |
|--------------------|----------------------|
| 静态 `usb_composite_driver` | `gi->composite` + 模板 |
| 静态 `device_desc` | `gi->cdev.desc`（echo 填写） |
| `usb_add_config()` in module init | `mkdir configs` + `usb_add_config_only` |
| `usb_add_function()` in bind | `ln` + bind 时 `usb_add_function` |
| `usb_composite_probe()` | `echo UDC` → `usb_gadget_probe_driver` |

**本质相同：** 都是填满 `usb_composite_dev` + 注册 `usb_composite_driver`；configfs 把「写结构体」暴露成 sysfs。

---

## 9. 总图

```
                    ┌─────────────────────────────────────┐
                    │         struct gadget_info          │
                    │  ┌───────────────────────────────┐  │
  strings/0x409 ──→ │  │    usb_composite_dev cdev     │  │
  configs/c.1    ──→ │  │  desc / configs / gstrings    │  │
  ln acm.0       ──→ │  └───────────────────────────────┘  │
                    │  ┌───────────────────────────────┐  │
  echo UDC       ──→ │  │ usb_composite_driver composite│──┼──→ UDC (dwc2)
                    │  │  gadget_driver + bind()       │  │
                    │  └───────────────────────────────┘  │
                    └─────────────────────────────────────┘
                                      │
                              Host GET_DESCRIPTOR
                                      ▼
                              lsusb / ttyACM0 / COM
                              板子 /dev/ttyGS0（SET_CONFIGURATION 后通）
```

---

## 10. 源码索引

| 主题 | 文件 |
|------|------|
| `gadget_info`、`gadgets_make` | `drivers/usb/gadget/configfs.c` |
| `configfs_composite_bind` | 同上 |
| `usb_composite_dev` / `usb_composite_driver` 定义 | `include/linux/usb/composite.h` |
| EP0 读描述符 | `drivers/usb/gadget/composite.c` |
| ACM function | `drivers/usb/gadget/function/f_acm.c` |
| ttyGS | `drivers/usb/gadget/function/u_serial.c` |
| UDC bind | `drivers/usb/gadget/udc/core.c` |
