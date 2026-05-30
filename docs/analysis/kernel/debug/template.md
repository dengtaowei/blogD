---
home: false
homeTag: 示例
homeTitle: 首页卡片标题（可选）
homeDesc: 首页卡片摘要（可选，不填则尝试从引用块提取）
---

# 标题：简短描述问题（例如 UVC open 失败 / 枚举超时）

> **环境**：Linux 6.x · 架构 · 板型 / 虚拟机  
> **关联**：[枚举与两轮 Probe](/analysis/kernel/usb/enumeration-and-probe)（按需改成你的流程文）  
> **状态**：已解决 / 进行中 / 待复现

---

## 现象

- 用户可见的错误信息、日志摘要
- 预期行为 vs 实际行为

## 环境

| 项 | 值 |
|----|-----|
| 内核版本 | |
| 相关配置 | `CONFIG_xxx=y` |
| 硬件 / 拓扑 | |
| 复现频率 | 必现 / 偶发 |

## 复现步骤

1.
2.
3.

## 排查过程

按时间或假设顺序记录，保留**关键命令与输出**（可截断无关行）。

```bash
# 示例
dmesg | tail -50
lsusb -t
trace-cmd record -e usb:usb_* ...
```

```text
（关键 log / trace 片段）
```

## 根因

一句话结论，再展开机制说明。可指向具体函数、返回值、时序。

## 关联源码

- `drivers/usb/core/hub.c` — `hub_port_init()`
- 与 [流程分析某节](/analysis/kernel/usb/enumeration-and-probe) 的对应关系

## 结论与备忘

- 最终解决办法或 workaround
- 尚未弄清的点、下次可试的方向

---

<!-- 发布前删除本行：复制本文件到 debug/<子系统>/ 并重命名 -->
