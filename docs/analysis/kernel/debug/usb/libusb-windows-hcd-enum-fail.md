---
homeTag: 调试 · USB
homeTitle: libusb Windows 枚举失败
homeDesc: 一个没有子节点的虚拟 root hub 让 HCD pass 直接失败，整张设备列表为空
sidebarOrder: 50
sidebarTitle: libusb Windows 枚举失败
date: 2026-08-16
---

# libusb 在 Windows 上枚举不到设备

> **环境**：Windows 主机侧下载工具（基于 libusb）· libusb 1.0.22（2018-03-25）· 目标机 USB Device 侧工作正常  
> **关联**：[USB 2.0 枚举流程](/analysis/kernel/usb/usb-enumeration) · [hub_port_init 调用链](/analysis/kernel/usb/hub-port-init)  
> **状态**：已解决（升级 libusb，取上游对 HCD pass 的容错修复）

---

## 目录

- [1. 现象](#1-现象)
- [2. 结论先行](#2-结论先行)
- [3. 先定位在哪一侧](#3-先定位在哪一侧)
- [4. libusb 在 Windows 上分几轮扫描](#4-libusb-在-windows-上分几轮扫描)
- [5. 卡在 HCD pass 的一个虚拟 root hub](#5-卡在-hcd-pass-的一个虚拟-root-hub)
- [6. 为什么一个坏 root hub 能让整张列表为空](#6-为什么一个坏-root-hub-能让整张列表为空)
- [7. 修法](#7-修法)
- [8. 小结](#8-小结)
- [附录 A 调试输出逐行解读](#附录-a-调试输出逐行解读)
- [附录 B 要点速记](#附录-b-要点速记)

---

## 1. 现象

一台客户机器上，Windows 侧的 USB 下载工具打不开目标设备，报：

```text
Error geting device list: LIBUSB_ERROR_NO_DEVICE
dev open failed
```

同一台机器上：设备管理器里目标设备**在**，驱动状态正常；同一根线、同一个目标板换到其他 PC 上下载正常；这台机器换其他 USB 设备也能被系统识别。也就是说，**枚举在操作系统层面是成功的，失败的是工具这一层**。

`LIBUSB_ERROR_NO_DEVICE` 的字面意思是"设备不存在"，很容易顺着"设备没插好 / 驱动没装对"往下查。但它是 `libusb_get_device_list()` 的返回值——这个函数返回的是**整机 USB 设备列表**，不针对某一个设备。列表整体拿不到，和某一个设备找不到，是两回事。

---

## 2. 结论先行

| 问题 | 答案 |
|------|------|
| 报错的是哪一步 | `libusb_get_device_list()`，不是 `libusb_open()`；拿不到的是**整张列表** |
| 根因 | 这台机器上装了第三方 USB 主机驱动，注册了一个**没有子节点**的虚拟 root hub（`ROOT\NXUSBH\0000`） |
| 为什么会全盘失败 | libusb 1.0.22 在 HCD 扫描轮里遇到"root hub 找不到子节点"时按硬错误处理，直接终止整次枚举 |
| 目标设备本身有问题吗 | 没有。它挂在另一条控制器上，后面那一轮扫描就能找到 |
| 怎么修 | 升级 libusb，取上游把这个硬错误改成"跳过该 HCD 继续"的修复 |

---

## 3. 先定位在哪一侧

在改任何代码之前，先用三组对照把范围收窄：

| 对照 | 结果 | 排除掉什么 |
|------|------|-----------|
| 同一目标板 + 同一根线 → 换一台 PC | 下载正常 | 目标设备侧、线缆 |
| 同一台 PC → 换其他 USB 设备 | 系统正常识别 | 这台 PC 的 USB 硬件、系统 USB 栈 |
| 同一台 PC → 设备管理器查看目标设备 | 在，且驱动正常 | 驱动安装、WinUSB 绑定 |

三组做完，问题只能出在**这台 PC 上的 libusb 枚举过程**——而且它跟"目标设备是谁"无关，是**这台机器的 USB 拓扑**里有什么东西让枚举走不下去。

这个判断很重要：如果继续在目标设备上找原因，方向就错了。

---

## 4. libusb 在 Windows 上分几轮扫描

Linux 上 libusb 直接读 sysfs 拿设备树；Windows 上没有这样一处现成的树，libusb 需要自己从 SetupAPI 把拓扑拼出来。它的做法是**分几轮（pass）扫描不同的设备接口类**，逐轮把节点填进一张列表：

| pass | 名称 | 扫描内容 |
|------|------|----------|
| 0 | HUB | USB hub |
| 1 | DEV | USB 设备节点 |
| 2 | HCD | 主机控制器（root hub 在这一轮建立父子关系） |
| 3 | GEN | 通用设备接口 |
| 4 | HID | HID 类 |
| 5 | EXT | 扩展 |

打开 libusb 调试输出后，这台机器的实际情况是：

```text
pass 0 (HUB) discdevs_len = 0
pass 1 (DEV) discdevs_len = 0
pass 2 (HCD) discdevs_len = 0
pass 3 (GEN) discdevs_len = 5
```

**前三轮一个都没扫到，第 4 轮（GEN）才出现 5 个设备**——目标设备就在这 5 个里面。所以只要枚举能走到 pass 3，一切正常；问题在于原版走不到那里。

---

## 5. 卡在 HCD pass 的一个虚拟 root hub

在 HCD 那一轮补上打印后，看到了具体是哪一项出的问题：

```text
HCD skip: child not found for 'ROOT\NXUSBH\0000'
```

`ROOT\NXUSBH\0000` 是这台机器上一个**第三方 USB 主机驱动**注册出来的虚拟控制器。它以主机控制器的身份出现在 HCD 这一轮里，但底下**没有挂任何子节点**。

libusb 在 HCD pass 的职责是给每个 root hub 找到对应的子节点，把父子关系建起来。找不到子节点这件事，对一个真实控制器来说确实反常；1.0.22 于是按硬错误处理，让整次 `libusb_get_device_list()` 返回失败。

于是链条完整了：

```text
第三方虚拟 root hub 无子节点
  → HCD pass 判定为错误并终止枚举
  → 后面的 GEN pass 不会执行
  → 那 5 个设备（含目标设备）从未进入列表
  → libusb_get_device_list() 返回 LIBUSB_ERROR_NO_DEVICE
  → 工具报 dev open failed
```

---

## 6. 为什么一个坏 root hub 能让整张列表为空

值得单独说一句的是这里的**失败放大**：出问题的是一条与目标设备**完全无关**的控制器，代价却是整机设备一个都看不到。

原因在于 libusb 的分轮扫描是**串行且共享同一张结果列表**的：任何一轮返回错误就中止后面所有轮，已扫到的部分也一并作废。目标设备本来会在 pass 3 被找到，但 pass 2 先失败了。

上游后来的判断是：一个 root hub 找不到子节点，并不构成"整机枚举不可继续"的理由，合理的处理是**跳过这一项**继续扫描。相关修复见 libusb 的 [PR #483](https://github.com/libusb/libusb/pull/483)。

这也是为什么同样的工具在其他 PC 上正常——那些机器上没有装这个第三方主机驱动，HCD 这一轮里就没有这样一个空 root hub。**触发条件是客户机器的软件环境，不是工具本身的输入。**

---

## 7. 修法

工具依赖里的 libusb 停在 **1.0.22（2018-03-25）**，比这个修复早。修法是把依赖升上去，让 HCD pass 的处理从"终止"变成"跳过"。

改后同一台机器的调试输出：

```text
pass 2 (HCD) HCD skip: child not found for 'ROOT\NXUSBH\0000'
pass 2 (HCD) discdevs_len = 0
pass 3 (GEN) discdevs_len = 5
match 1:3
download: 100%
```

`HCD skip` 这一行仍在——**那个空 root hub 依然存在，只是不再让枚举中止**。pass 3 正常执行，5 个设备进入列表，目标设备被匹配到并完成下载。

顺带的一点：这类"依赖库停在很多年前的版本、上游早已修过"的问题，靠读自己的代码是查不出来的。定位到具体失败的那一行之后，**先去上游仓库搜同样的报错或函数名**，通常比自己写 workaround 快得多。

---

## 8. 小结

- `LIBUSB_ERROR_NO_DEVICE` 来自 `libusb_get_device_list()`，含义是**整张列表拿不到**，不是"某个设备不在"。
- 三组对照（换 PC / 换设备 / 看设备管理器）先把范围收窄到"这台 PC 的 libusb 枚举过程"，避免在目标设备上空转。
- 根因是一个第三方 USB 主机驱动注册的虚拟 root hub 没有子节点，libusb 1.0.22 把它当硬错误，终止了整次枚举。
- 目标设备原本会在后一轮（GEN）被扫到，被前一轮的失败连累。
- 修法是升级 libusb，取上游"跳过该 HCD 继续扫描"的处理；空 root hub 依旧存在，只是不再致命。

---

## 附录 A 调试输出逐行解读

```text
pass 0 (HUB) discdevs_len = 0     → 没有可枚举的 hub
pass 1 (DEV) discdevs_len = 0     → 没有直接匹配的 USB 设备接口
pass 2 (HCD) HCD skip: child not found for 'ROOT\NXUSBH\0000'
                                  → 第三方虚拟 root hub 无子节点
                                    1.0.22 在此终止；修复后仅跳过
pass 2 (HCD) discdevs_len = 0     → 这一轮没有新增
pass 3 (GEN) discdevs_len = 5     → 通用接口类扫到 5 个，目标设备在其中
match 1:3                         → 按 VID:PID 匹配到目标
download: 100%                    → 下载完成
```

`discdevs_len` 是累计的已发现设备数，逐轮增加；它在最后一轮才由 0 变 5，说明**前面几轮都不是关键，被中断的恰恰是通往关键那一轮的路**。

---

## 附录 B 要点速记

1. 先分清报错来自**列表接口**还是**单设备接口**：前者的范围是整机，后者才是某个设备。
2. Windows 上 libusb 的枚举是**分轮串行**的，任何一轮出错会让后面几轮不再执行。
3. "换台 PC 就正常" 通常指向**客户机器的软件环境**（第三方驱动、虚拟控制器），而不是工具或目标设备。
4. 打开库自带的调试输出，比在自己代码里加打印更快定位到库内部的失败点。
5. 定位到具体报错字符串后**先搜上游仓库**；停留在多年前版本的依赖，问题往往早已被修复。
