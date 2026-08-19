---
date: 2026-08-17
homeTag: Display · 笔记
homeTitle: 双缓冲：解压快还是写屏快
homeDesc: 双缓冲下解压与写屏谁更快，帧率会被哪一端拖住
sidebarOrder: 20
sidebarTitle: 双缓冲：解压与写屏
---

# 双缓冲：解压快还是写屏快

> **平台**：MCU + 硬件解压 + 双帧缓冲 + i8080 面板 + TE  
> **关联**：[ST7789 TE 信号实测](/notes/display/st7789-te-signal)

## 1. 背景

双缓冲让解压和写屏叠在两块帧缓冲上，帧率本该接近较慢的那一端。要确认的是瓶颈落在哪：解压更快时，写屏会占住帧缓冲，下一张解不了，吞吐被写屏拖住；写屏更快时，解压器可以连续转，吞吐被解压拖住。

压缩图先由硬件解压到其中一块帧缓冲；解完等到 TE，再经 i8080 写到屏 GRAM。

下一张要开始解压，需要同时满足：

1. 显示通路在跑  
2. 解压器空闲  
3. 有一张压缩图在等着解  
4. 有空闲帧缓冲（没在解、不是已解完等写屏、也没在写屏）

## 2. 对照动画

应用侧一直有待解的下一张，TE 每 17 ms 一次。左：解压 20 ms / 写屏 50 ms；右：解压 53 ms / 写屏 23 ms（一组 320×480 RGB565 的量级）。蓝是解压，绿是写屏，红是没有空闲帧缓冲。

<a href="/files/double-buffer-unzip-vs-write.html" target="_blank" rel="noopener">单独打开动画</a>

<iframe src="/files/double-buffer-unzip-vs-write.html" title="双缓冲：解压快 vs 写屏快" style="width:100%;height:980px;border:1px solid var(--vp-c-divider);background:#1b1b1d;"></iframe>
