import { createContentLoader } from 'vitepress'

export interface RecentPost {
  url: string
  title: string
  tag: string
  desc: string
}

function inferTag(url: string): string {
  if (url.includes('/debug/')) return '调试 · 实践'
  if (url.includes('/usb/')) return 'USB · 内核'
  if (url.includes('/spi/')) return 'SPI · 内核'
  if (url.includes('/gpio/')) return 'GPIO · 内核'
  if (url.includes('/pinctrl/')) return 'Pinctrl'
  if (url.includes('/notes/')) return 'RTOS · 笔记'
  return '内核'
}

function extractTitle(src: string, fm: Record<string, unknown>): string {
  if (fm.homeTitle) return String(fm.homeTitle)
  if (fm.title) return String(fm.title)
  const match = src.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() ?? '未命名'
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

function extractDesc(src: string, fm: Record<string, unknown>): string {
  if (fm.homeDesc) return String(fm.homeDesc)

  for (const line of src.split('\n')) {
    if (!line.startsWith('>')) continue
    const text = stripMarkdown(line.replace(/^>\s?/, ''))
    if (!text) continue
    if (/^(环境|关联|状态|Linux 6\.8 ·)/.test(text)) continue
    if (text.startsWith('现象：') || text.startsWith('现象:')) {
      return text.replace(/^现象[：:]\s*/, '').slice(0, 120)
    }
    if (text.length >= 12 && text.length <= 140) return text
  }

  for (const line of src.split('\n')) {
    if (!line.startsWith('>')) continue
    const text = stripMarkdown(line.replace(/^>\s?/, ''))
    if (text.length >= 12) return text.slice(0, 120)
  }

  return ''
}

export default createContentLoader('{analysis,notes}/**/*.md', {
  includeSrc: true,
  transform(raw): RecentPost[] {
    return raw
      .filter((page) => {
        const fm = page.frontmatter as Record<string, unknown>
        if (fm.home === false) return false
        if (!fm.date) return false
        return true
      })
      .map((page) => {
        const fm = page.frontmatter as Record<string, unknown>
        const src = page.src ?? ''
        return {
          url: page.url,
          title: extractTitle(src, fm),
          tag: String(fm.homeTag ?? inferTag(page.url)),
          desc: extractDesc(src, fm),
          time: +new Date(String(fm.date)),
        }
      })
      .sort((a, b) => b.time - a.time)
      .map(({ url, title, tag, desc }) => ({ url, title, tag, desc }))
  },
})
