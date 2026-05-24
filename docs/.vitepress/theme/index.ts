import DefaultTheme from 'vitepress/theme'
import './style.css'
import './github-doc.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ router }) {
    if (typeof window === 'undefined') return

    import('./mermaid-panzoom').then(({ initMermaidPanZoom, rescanMermaidPanZoom }) => {
      initMermaidPanZoom()
      router.onAfterRouteChanged = () => {
        setTimeout(rescanMermaidPanZoom, 150)
      }
    })
  },
}
