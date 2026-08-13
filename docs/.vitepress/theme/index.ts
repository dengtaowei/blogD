import DefaultTheme from 'vitepress/theme'
import mediumZoom from 'medium-zoom'
import type { Zoom } from 'medium-zoom'
import RecentPosts from './RecentPosts.vue'
import TeSlowWriteDemo from './TeSlowWriteDemo.vue'
import './style.css'
import './github-doc.css'

let zoom: Zoom | undefined

function setupImageZoom() {
  zoom?.detach()
  zoom = mediumZoom('.vp-doc img:not(.medium-zoom-image--hidden)', {
    background: 'var(--vp-c-bg)',
    margin: 24,
  })
}

export default {
  extends: DefaultTheme,
  enhanceApp({ app, router }) {
    app.component('RecentPosts', RecentPosts)
    app.component('TeSlowWriteDemo', TeSlowWriteDemo)

    if (typeof window === 'undefined') return

    import('./mermaid-panzoom').then(({ initMermaidPanZoom, rescanMermaidPanZoom }) => {
      initMermaidPanZoom()

      const afterRoute = () => {
        setTimeout(() => {
          rescanMermaidPanZoom()
          setupImageZoom()
        }, 150)
      }

      afterRoute()
      router.onAfterRouteChanged = afterRoute
    })
  },
}
