# Pinctrl / GPIO · 调试与实践

GPIO / Pinctrl 子系统相关的具体问题排查与实验记录。

**流程分析**（成体系阅读）：[STM32 Pinctrl 分析](/analysis/kernel/pinctrl/stm32-pinctrl) · [STM32 GPIO 分析](/analysis/kernel/gpio/stm32-gpio)

---

## 记录

- [IMX6ULL SPI 片选 GPIO「时好时坏」（runtime PM）](/analysis/kernel/debug/gpio/imx6ull-spi-cs-gpio-runtime-pm) — `gpio-mxc` runtime PM 在 `request` 时 resume+restore，覆盖 `spi-imx` 先设的 CS output

---

## 常用手段（备忘）

| 手段 | 典型用途 |
|------|----------|
| `/sys/kernel/debug/gpio` | 查 bank、line 占用与方向 |
| `/sys/kernel/debug/pinctrl/` | pin 复用、group、range 映射 |
| `cat /sys/kernel/debug/pm_genpd/*` · `pm_runtime` | 排查 runtime PM 挂起/恢复 |
| `trace-cmd` / ftrace | `rpm_*`、`gpio` 事件时序 |
| 源码 + `printk` | 定点验证寄存器写入时刻 |
