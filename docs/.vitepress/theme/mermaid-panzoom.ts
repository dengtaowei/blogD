type DiagramState = {
  wrapper: HTMLElement
  canvas: HTMLElement
  stage: HTMLElement
  mermaidEl: HTMLElement
  svg: SVGSVGElement
  scale: number
  tx: number
  ty: number
  dragging: boolean
  dragStartX: number
  dragStartY: number
  dragOriginX: number
  dragOriginY: number
  eventsBound: boolean
}

const states = new WeakMap<HTMLElement, DiagramState>()
const fullscreenPlaceholders = new WeakMap<HTMLElement, Comment>()
const fullscreenBackdrops = new WeakMap<HTMLElement, HTMLElement>()

const MIN_SCALE = 0.25
const MAX_SCALE = 6
const ZOOM_STEP = 1.2
const PAN_STEP = 48

function icon(path: string) {
  return `<svg class="mermaid-zoom-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">${path}</svg>`
}

const ICONS = {
  expand: icon(
    '<path d="M5.22 14.78a.75.75 0 0 0 1.06-1.06L4.56 12h8.69a.75.75 0 0 0 0-1.5H4.56l1.72-1.72a.75.75 0 0 0-1.06-1.06l-3 3a.75.75 0 0 0 0 1.06l3 3Zm5.56-6.5a.75.75 0 1 1-1.06-1.06l1.72-1.72H2.75a.75.75 0 0 1 0-1.5h8.69L9.72 2.28a.75.75 0 0 1 1.06-1.06l3 3a.75.75 0 0 1 0 1.06l-3 3Z"/>',
  ),
  copy: icon(
    '<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>',
  ),
  close: icon(
    '<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>',
  ),
  up: icon(
    '<path d="M4.28 10.78a.75.75 0 0 0 1.06 0L8 8.06l2.72 2.72a.75.75 0 1 0 1.06-1.06l-3.25-3.25a.75.75 0 0 0-1.06 0L4.28 9.72a.75.75 0 0 0 0 1.06Z"/>',
  ),
  down: icon(
    '<path d="M11.72 4.28a.75.75 0 0 0-1.06 0L8 6.94 5.34 4.28a.75.75 0 1 0-1.06 1.06l3.25 3.25a.75.75 0 0 0 1.06 0l3.25-3.25a.75.75 0 0 0 0-1.06Z"/>',
  ),
  left: icon(
    '<path d="M9.78 4.28a.75.75 0 0 0-1.06 0L5.47 7.53a.75.75 0 0 0 0 1.06l3.25 3.25a.75.75 0 1 0 1.06-1.06L7.56 8l2.22-2.22a.75.75 0 0 0 0-1.06Z"/>',
  ),
  right: icon(
    '<path d="M6.22 4.28a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06L7.28 11.84a.75.75 0 0 1-1.06-1.06L8.44 8 6.22 5.78a.75.75 0 0 1 0-1.06Z"/>',
  ),
  reset: icon(
    '<path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.835ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.501 5.501 0 0 0 8 2.5Z"/>',
  ),
  plus: icon(
    '<path d="M8 2.75a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2.75Z"/>',
  ),
  minus: icon(
    '<path d="M2 8a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Z"/>',
  ),
} as const

function debounce(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return () => {
    clearTimeout(timer)
    timer = setTimeout(fn, ms)
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function isReady(mermaidEl: HTMLElement) {
  const svg = mermaidEl.querySelector('svg')
  if (!svg) return false
  const { width, height } = svg.getBoundingClientRect()
  return width > 20 && height > 20
}

function applyTransform(state: DiagramState) {
  const { stage } = state
  if (state.scale === 1 && state.tx === 0 && state.ty === 0) {
    stage.style.transform = ''
    state.wrapper.classList.remove('is-zoomed')
    return
  }
  stage.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`
  stage.style.transformOrigin = '0 0'
  state.wrapper.classList.add('is-zoomed')
}

function resetView(state: DiagramState) {
  state.scale = 1
  state.tx = 0
  state.ty = 0
  state.dragging = false
  applyTransform(state)
}

function zoomBy(state: DiagramState, factor: number, originX?: number, originY?: number) {
  const rect = state.canvas.getBoundingClientRect()
  const ox = originX ?? rect.left + rect.width / 2
  const oy = originY ?? rect.top + rect.height / 2
  const prev = state.scale
  const next = clamp(prev * factor, MIN_SCALE, MAX_SCALE)
  if (next === prev) return

  const lx = (ox - rect.left - state.tx) / prev
  const ly = (oy - rect.top - state.ty) / prev
  state.scale = next
  state.tx = ox - rect.left - lx * next
  state.ty = oy - rect.top - ly * next
  applyTransform(state)
}

function panBy(state: DiagramState, dx: number, dy: number) {
  state.tx += dx
  state.ty += dy
  applyTransform(state)
}

function enterFullscreen(wrapper: HTMLElement) {
  if (wrapper.classList.contains('is-fullscreen')) return

  const parent = wrapper.parentNode
  if (!parent) return

  const placeholder = document.createComment('mermaid-zoom-fs')
  parent.insertBefore(placeholder, wrapper)
  fullscreenPlaceholders.set(wrapper, placeholder)

  const backdrop = document.createElement('div')
  backdrop.className = 'mermaid-zoom-backdrop'
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) exitFullscreen(wrapper)
  })

  document.body.appendChild(backdrop)
  backdrop.appendChild(wrapper)
  fullscreenBackdrops.set(wrapper, backdrop)

  document.body.classList.add('mermaid-zoom-fs-open')
  requestAnimationFrame(() => backdrop.classList.add('is-open'))
  wrapper.classList.add('is-fullscreen')

  const state = states.get(wrapper.querySelector('.mermaid') as HTMLElement)
  if (state) resetView(state)
}

function exitFullscreen(wrapper: HTMLElement) {
  if (!wrapper.classList.contains('is-fullscreen')) return

  const backdrop = fullscreenBackdrops.get(wrapper)
  wrapper.classList.remove('is-fullscreen')
  backdrop?.classList.remove('is-open')

  let closed = false
  const done = () => {
    if (closed) return
    closed = true

    const placeholder = fullscreenPlaceholders.get(wrapper)
    if (placeholder?.parentNode) {
      placeholder.parentNode.insertBefore(wrapper, placeholder)
      placeholder.remove()
      fullscreenPlaceholders.delete(wrapper)
    }
    backdrop?.remove()
    fullscreenBackdrops.delete(wrapper)
    if (!document.querySelector('.mermaid-zoom-backdrop')) {
      document.body.classList.remove('mermaid-zoom-fs-open')
    }
  }

  if (backdrop) {
    backdrop.addEventListener('transitionend', done, { once: true })
    setTimeout(done, 260)
  } else {
    done()
  }
}

function toggleFullscreen(wrapper: HTMLElement) {
  if (wrapper.classList.contains('is-fullscreen')) exitFullscreen(wrapper)
  else enterFullscreen(wrapper)
}

async function copyDiagram(svg: SVGSVGElement) {
  try {
    await navigator.clipboard.writeText(svg.outerHTML)
  } catch {
    /* ignore */
  }
}

function bindEvents(state: DiagramState) {
  if (state.eventsBound) return
  state.eventsBound = true

  const { canvas, wrapper, svg } = state

  canvas.addEventListener(
    'wheel',
    (event) => {
      if (
        !state.wrapper.classList.contains('is-fullscreen') &&
        !state.wrapper.classList.contains('is-zoomed') &&
        state.scale === 1
      )
        return
      event.preventDefault()
      zoomBy(state, event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, event.clientX, event.clientY)
    },
    { passive: false },
  )

  canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || state.scale === 1) return
    state.dragging = true
    state.dragStartX = event.clientX
    state.dragStartY = event.clientY
    state.dragOriginX = state.tx
    state.dragOriginY = state.ty
    canvas.classList.add('is-dragging')
    event.preventDefault()
  })

  window.addEventListener('mousemove', (event) => {
    if (!state.dragging) return
    state.tx = state.dragOriginX + (event.clientX - state.dragStartX)
    state.ty = state.dragOriginY + (event.clientY - state.dragStartY)
    applyTransform(state)
  })

  window.addEventListener('mouseup', () => {
    if (!state.dragging) return
    state.dragging = false
    canvas.classList.remove('is-dragging')
  })

  wrapper.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')
    if (!btn) return

    switch (btn.dataset.action) {
      case 'zoom-in':
        zoomBy(state, ZOOM_STEP)
        break
      case 'zoom-out':
        zoomBy(state, 1 / ZOOM_STEP)
        break
      case 'reset':
        resetView(state)
        break
      case 'pan-up':
        panBy(state, 0, PAN_STEP)
        break
      case 'pan-down':
        panBy(state, 0, -PAN_STEP)
        break
      case 'pan-left':
        panBy(state, PAN_STEP, 0)
        break
      case 'pan-right':
        panBy(state, -PAN_STEP, 0)
        break
      case 'fullscreen':
        toggleFullscreen(wrapper)
        break
      case 'close-fs':
        exitFullscreen(wrapper)
        break
      case 'copy':
        void copyDiagram(svg)
        break
    }
  })
}

function createControls() {
  const top = document.createElement('div')
  top.className = 'mermaid-zoom-actions-top'
  top.innerHTML = `
    <button type="button" data-action="fullscreen" class="mermaid-zoom-btn-inline" title="全屏" aria-label="全屏">
      ${ICONS.expand}
    </button>
    <button type="button" data-action="copy" class="mermaid-zoom-btn-inline" title="复制 SVG" aria-label="复制">
      ${ICONS.copy}
    </button>
    <button type="button" data-action="close-fs" class="mermaid-zoom-btn-close" title="关闭" aria-label="关闭">
      ${ICONS.close}
    </button>
  `

  const bottom = document.createElement('div')
  bottom.className = 'mermaid-zoom-controls-br'
  bottom.innerHTML = `
    <div class="mermaid-zoom-dpad">
      <button type="button" data-action="pan-up" title="上移" aria-label="上移">${ICONS.up}</button>
      <button type="button" data-action="zoom-in" title="放大" aria-label="放大">${ICONS.plus}</button>
      <button type="button" data-action="pan-left" title="左移" aria-label="左移">${ICONS.left}</button>
      <button type="button" data-action="reset" title="重置" aria-label="重置">${ICONS.reset}</button>
      <button type="button" data-action="pan-right" title="右移" aria-label="右移">${ICONS.right}</button>
      <button type="button" data-action="pan-down" title="下移" aria-label="下移">${ICONS.down}</button>
      <button type="button" data-action="zoom-out" title="缩小" aria-label="缩小">${ICONS.minus}</button>
    </div>
  `

  return { top, bottom }
}

function wrapMermaid(mermaidEl: HTMLElement, svg: SVGSVGElement): DiagramState | null {
  const cached = states.get(mermaidEl)
  if (cached?.svg === svg) return cached

  if (mermaidEl.closest('.mermaid-zoom')) {
    const wrapper = mermaidEl.closest('.mermaid-zoom') as HTMLElement
    const canvas = wrapper.querySelector('.mermaid-zoom-canvas') as HTMLElement
    const stage = wrapper.querySelector('.mermaid-zoom-stage') as HTMLElement
    if (!canvas || !stage) return null
    const state: DiagramState = {
      wrapper,
      canvas,
      stage,
      mermaidEl,
      svg,
      scale: 1,
      tx: 0,
      ty: 0,
      dragging: false,
      dragStartX: 0,
      dragStartY: 0,
      dragOriginX: 0,
      dragOriginY: 0,
      eventsBound: false,
    }
    states.set(mermaidEl, state)
    bindEvents(state)
    return state
  }

  const parent = mermaidEl.parentNode
  if (!parent) return null

  const { top, bottom } = createControls()
  const wrapper = document.createElement('div')
  wrapper.className = 'mermaid-zoom'

  const canvas = document.createElement('div')
  canvas.className = 'mermaid-zoom-canvas'

  const stage = document.createElement('div')
  stage.className = 'mermaid-zoom-stage'

  parent.insertBefore(wrapper, mermaidEl)
  stage.appendChild(mermaidEl)
  canvas.appendChild(stage)
  wrapper.appendChild(top)
  wrapper.appendChild(canvas)
  wrapper.appendChild(bottom)

  const state: DiagramState = {
    wrapper,
    canvas,
    stage,
    mermaidEl,
    svg,
    scale: 1,
    tx: 0,
    ty: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragOriginX: 0,
    dragOriginY: 0,
    eventsBound: false,
  }
  states.set(mermaidEl, state)
  bindEvents(state)
  return state
}

function initOne(mermaidEl: HTMLElement) {
  if (!isReady(mermaidEl)) return

  const svg = mermaidEl.querySelector('svg') as SVGSVGElement
  const cached = states.get(mermaidEl)
  if (cached?.svg === svg && mermaidEl.closest('.mermaid-zoom')) return

  const state = wrapMermaid(mermaidEl, svg)
  if (!state) return

  resetView(state)
}

function scan() {
  document.querySelectorAll<HTMLElement>('.mermaid').forEach(initOne)
}

export function initMermaidPanZoom() {
  const run = debounce(() => requestAnimationFrame(scan), 120)
  run()

  const observer = new MutationObserver(run)
  observer.observe(document.body, { childList: true, subtree: true })

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    document.querySelectorAll<HTMLElement>('.mermaid-zoom.is-fullscreen').forEach(exitFullscreen)
  })
}

export function rescanMermaidPanZoom() {
  requestAnimationFrame(scan)
}
