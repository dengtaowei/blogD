#!/usr/bin/env node
/**
 * 将正文文章的 frontmatter.date 同步为 Git 首次提交日期（YYYY-MM-DD）。
 * 索引页 / 模板（home: false）不写 date。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { globSync } from 'node:fs'

const ROOT = join(import.meta.dirname, '..')
const GLOB = ['docs/analysis/**/*.md', 'docs/notes/**/*.md']

function gitFirstCommitDate(file) {
  try {
    const out = execFileSync(
      'git',
      ['log', '--diff-filter=A', '-1', '--date=short', '--format=%ad', '--', file],
      { cwd: ROOT, encoding: 'utf8' },
    ).trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : ''
  } catch {
    return ''
  }
}

/** 剥离文首所有 frontmatter，返回合并后的字段与正文 */
function splitFrontmatter(content) {
  let rest = content.replace(/^\uFEFF/, '')
  const fm = {}

  while (/^(?:\n*)---\n/.test(rest)) {
    rest = rest.replace(/^\n+/, '')
    const end = rest.indexOf('\n---\n', 4)
    if (end === -1) break
    const block = rest.slice(4, end)
    rest = rest.slice(end + 5).replace(/^\uFEFF/, '')
    for (const line of block.split('\n')) {
      const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
      if (m) fm[m[1]] = m[2].trim()
    }
  }

  return { fm, body: rest }
}

function serializeFrontmatter(fm, body) {
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`)
  return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`
}

function isIndexLike(file, fm) {
  const norm = file.replace(/\\/g, '/')
  if (basename(file) === 'index.md') return true
  if (norm.endsWith('/debug/template.md')) return true
  if (fm.home === 'false') return true
  return false
}

let updated = 0
let skipped = 0

for (const pattern of GLOB) {
  for (const rel of globSync(pattern, { cwd: ROOT })) {
    const file = join(ROOT, rel)
    const gitDate = gitFirstCommitDate(rel)
    if (!gitDate) {
      skipped++
      continue
    }

    const content = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    const { fm, body } = splitFrontmatter(content)

    if (isIndexLike(rel, fm)) {
      fm.home = 'false'
      delete fm.date
    } else {
      fm.date = gitDate
    }

    const next = serializeFrontmatter(fm, body)
    if (next === content) continue

    writeFileSync(file, next, 'utf8')
    updated++
    console.log(`>>> ${rel} → date=${fm.date ?? '(removed)'}`)
  }
}

console.log(`>>> 完成：更新 ${updated} 个文件，跳过 ${skipped} 个（无 Git 历史）`)
