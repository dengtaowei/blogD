<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'

const ROWS = 24
const ROW_H = 14
const PANEL_H = ROWS * ROW_H
const PANEL_W = 140
const CYCLE_MS = 12000

const progress = ref(0)
const playing = ref(false)

let raf = 0
let lastTs = 0

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function scanTopPct(p: number): number {
  if (p < 0.44) return lerp(0, 100, p / 0.44)
  if (p < 0.5) return 100
  if (p < 0.94) return lerp(0, 100, (p - 0.5) / 0.44)
  return 100
}

function writeHeightPct(p: number): number {
  if (p < 0.03) return 0
  if (p < 0.48) return lerp(0, 55, (p - 0.03) / 0.45)
  if (p < 0.72) return lerp(55, 100, (p - 0.48) / 0.24)
  return 100
}

function panelGreenPct(p: number): number {
  if (p < 0.5) return 0
  if (p < 0.94) return lerp(0, 100, (p - 0.5) / 0.44)
  return 100
}

const p = computed(() => clamp01(progress.value))
const scanTop = computed(() => scanTopPct(p.value))
const writeH = computed(() => writeHeightPct(p.value))
const greenH = computed(() => panelGreenPct(p.value))
const fieldText = computed(() => (p.value < 0.5 ? '场 1' : '场 2'))
const panelBadge = computed(() => {
  if (p.value < 0.5) return '场1 · 红'
  if (greenH.value < 100) return '上绿 / 下红'
  return '全绿'
})
const sliderVal = computed({
  get: () => Math.round(p.value * 1000),
  set: (v: number) => {
    pause()
    progress.value = v / 1000
  },
})

function tick(now: number) {
  if (!playing.value) return
  const dt = now - lastTs
  lastTs = now
  const next = progress.value + dt / CYCLE_MS
  if (next >= 1) {
    progress.value = 1
    playing.value = false
    return
  }
  progress.value = next
  raf = requestAnimationFrame(tick)
}

function play() {
  if (progress.value >= 1) progress.value = 0
  if (playing.value) return
  playing.value = true
  lastTs = performance.now()
  raf = requestAnimationFrame(tick)
}

function pause() {
  playing.value = false
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

function reset() {
  pause()
  progress.value = 0
}

function onSliderInput(e: Event) {
  pause()
  progress.value = Number((e.target as HTMLInputElement).value) / 1000
}

onUnmounted(() => pause())
</script>

<template>
  <div class="te-demo" aria-label="TE 慢写时序示意">
    <div class="te-demo-toolbar">
      <button
        type="button"
        class="te-btn te-btn-primary"
        @click="playing ? pause() : play()"
      >
        {{
          playing
            ? '暂停'
            : p > 0 && p < 1
              ? '继续'
              : p >= 1
                ? '重播'
                : '播放'
        }}
      </button>
      <button type="button" class="te-btn" @click="reset">复位</button>
      <span class="te-pill">{{ fieldText }}</span>
      <span class="te-pill">{{ Math.round(p * 100) }}%</span>
      <span class="te-pill te-pill-red">红 = OLD</span>
      <span class="te-pill te-pill-green">绿 = NEW</span>
    </div>

    <label class="te-slider-label">
      进度（可拖动；拖动时暂停）
      <input
        class="te-slider"
        type="range"
        min="0"
        max="1000"
        step="1"
        :value="sliderVal"
        @input="onSliderInput"
      />
    </label>
    <div class="te-slider-marks">
      <span>场 1</span>
      <span>场 2</span>
      <span>结束</span>
    </div>

    <div class="te-panels">
      <div class="te-col">
        <h4 class="te-col-title">GRAM</h4>
        <p class="te-col-desc">绿 = 已写入的 NEW；白线 = 读指针。</p>
        <div
          class="te-screen"
          :style="{ width: PANEL_W + 'px', height: PANEL_H + 'px' }"
        >
          <div class="te-base te-red" />
          <div class="te-green" :style="{ height: writeH + '%' }" />
          <div
            v-for="i in ROWS"
            :key="'g' + i"
            class="te-row"
            :style="{ top: (i - 1) * ROW_H + 'px', height: ROW_H + 'px' }"
          />
          <div class="te-scan" :style="{ top: scanTop + '%' }" />
          <span class="te-tag te-tag-top">绿 NEW</span>
          <span class="te-tag te-tag-bot">红 OLD</span>
        </div>
      </div>

      <div class="te-col">
        <h4 class="te-col-title">Panel</h4>
        <p class="te-col-desc">场 2：线以上绿，线以下仍是上场红。</p>
        <div
          class="te-screen"
          :style="{ width: PANEL_W + 'px', height: PANEL_H + 'px' }"
        >
          <div class="te-base te-red" />
          <div class="te-green" :style="{ height: greenH + '%' }" />
          <div class="te-scan" :style="{ top: scanTop + '%' }" />
          <span class="te-tag te-tag-top">{{ panelBadge }}</span>
        </div>
      </div>
    </div>

    <p class="te-footnote">
      示意依据 ST7789 手册 §8.15.4（MPU write slower than panel read）：写指针跟在读指针后；场 1
      Panel 为旧帧，场 2 起扫到的是新帧。
    </p>
  </div>
</template>

<style scoped>
.te-demo {
  margin: 1.25rem 0 1.75rem;
  padding: 1rem 1.1rem 1.1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}

.te-demo-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.85rem;
}

.te-btn {
  appearance: none;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  border-radius: 6px;
  padding: 0.28rem 0.7rem;
  font-size: 0.875rem;
  cursor: pointer;
  line-height: 1.4;
}

.te-btn:hover {
  border-color: var(--vp-c-brand-1);
}

.te-btn-primary {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: #fff;
}

.te-pill {
  display: inline-block;
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg);
}

.te-pill-red {
  border-color: #c45b5b;
  color: #a33d3d;
}

.te-pill-green {
  border-color: #3d9a6a;
  color: #2a7a4f;
}

.dark .te-pill-red {
  color: #f0a0a0;
  border-color: #a05050;
}

.dark .te-pill-green {
  color: #8fd4ae;
  border-color: #3d8a60;
}

.te-slider-label {
  display: block;
  font-size: 0.8125rem;
  color: var(--vp-c-text-2);
  margin-bottom: 0.35rem;
}

.te-slider {
  width: 100%;
  accent-color: var(--vp-c-brand-1);
  cursor: pointer;
}

.te-slider-marks {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  margin: 0.15rem 0 1rem;
}

.te-panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

@media (max-width: 640px) {
  .te-panels {
    grid-template-columns: 1fr;
  }
}

.te-col-title {
  margin: 0 0 0.25rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.te-col-desc {
  margin: 0 0 0.6rem;
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  line-height: 1.45;
}

.te-screen {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  background: #8b3a3a;
}

.te-base {
  position: absolute;
  inset: 0;
}

.te-red {
  background: #c45b5b;
}

.te-green {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  background: #3d9a6a;
  z-index: 1;
}

.te-row {
  position: absolute;
  left: 0;
  right: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  box-sizing: border-box;
  pointer-events: none;
  z-index: 1;
  opacity: 0.35;
}

.te-scan {
  position: absolute;
  left: 0;
  right: 0;
  height: 4px;
  margin-top: -2px;
  background: #f5f5f5;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  z-index: 2;
}

.te-tag {
  position: absolute;
  z-index: 3;
  font-size: 11px;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  padding: 1px 4px;
  border: 1px solid var(--vp-c-divider);
}

.te-tag-top {
  left: 6px;
  top: 4px;
}

.te-tag-bot {
  left: 6px;
  bottom: 4px;
}

.te-footnote {
  margin: 0.9rem 0 0;
  font-size: 0.8rem;
  color: var(--vp-c-text-3);
  line-height: 1.5;
}
</style>
