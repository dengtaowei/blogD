#!/usr/bin/env node
/**
 * 扫描 docs 下 Markdown，生成 docs/public/sitemap.xml（构建时复制到站点根目录）。
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SITE_URL = (process.env.SITE_URL ?? 'https://www.xvfex.com.cn').replace(/\/$/, '')
const ROOT = join(import.meta.dirname, '..')
const DOCS = join(ROOT, 'docs')
const OUT = join(DOCS, 'public', 'sitemap.xml')

function parseFrontmatter(content) {
  const fm = {}
  let body = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!body.startsWith('---\n')) return { fm, body }
  const end = body.indexOf('\n---\n', 4)
  if (end === -1) return { fm, body }
  const block = body.slice(4, end)
  for (const line of block.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    let val = m[2].trim()
    if (val === 'true') val = true
    else if (val === 'false') val = false
    fm[key] = val
  }
  return { fm, body }
}

function toUrlPath(relFromDocs) {
  const norm = relFromDocs.replace(/\\/g, '/').replace(/\.md$/, '')
  if (norm === 'index') return '/'
  if (norm.endsWith('/index')) return `/${norm.slice(0, -6)}/`
  return `/${norm}`
}

function walkMd(dir, base = DOCS) {
  const urls = []
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === 'public') continue
      urls.push(...walkMd(full, base))
      continue
    }
    if (!name.endsWith('.md')) continue
    const rel = relative(base, full)
    if (rel.includes('.vitepress')) continue
    const raw = readFileSync(full, 'utf8')
    const { fm } = parseFrontmatter(raw)
    if (fm.sidebarHidden === true) continue
    const path = toUrlPath(rel)
    urls.push(`${SITE_URL}${path === '/' ? '/' : path}`)
  }
  return urls
}

const locs = [...new Set(walkMd(DOCS))].sort((a, b) => a.localeCompare(b))
const lastmod = new Date().toISOString().slice(0, 10)

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs
  .map(
    (loc) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`
  )
  .join('\n')}
</urlset>
`

writeFileSync(OUT, xml, 'utf8')
console.log(`>>> sitemap 已生成：${locs.length} 条 → ${OUT}`)
