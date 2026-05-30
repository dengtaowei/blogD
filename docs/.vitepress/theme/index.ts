import DefaultTheme from 'vitepress/theme'
import RecentPosts from './RecentPosts.vue'
import './style.css'
import './github-doc.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app, router }) {
    app.component('RecentPosts', RecentPosts)

    if (typeof window === 'undefined') return

    import('./mermaid-panzoom').then(({ initMermaidPanZoom, rescanMermaidPanZoom }) => {
      initMermaidPanZoom()
      router.onAfterRouteChanged = () => {
        setTimeout(rescanMermaidPanZoom, 150)
      }
    })
  },
}
