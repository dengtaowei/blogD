/** 线上站点根 URL（sitemap、canonical、robots 共用，勿末尾斜杠） */
export const SITE_URL = 'https://www.xvfex.com.cn'

export function pagePathFromRelative(relativePath: string): string {
  const norm = relativePath.replace(/\\/g, '/').replace(/\.md$/, '')
  if (norm === 'index') return '/'
  if (norm.endsWith('/index')) return `/${norm.slice(0, -6)}/`
  return `/${norm}`
}

export function canonicalUrl(relativePath: string): string {
  const path = pagePathFromRelative(relativePath)
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`
}
