import { defineConfig } from 'vitepress'
import type { HeadConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import GithubSlugger from 'github-slugger'
import sidebar from './sidebar.generated'
import { canonicalUrl } from './site-url'

// 与 GitHub 渲染器相同的标题锚点算法，目录 `#...` 链接两边通用
const githubSlugger = new GithubSlugger()
function githubSlugify(str: string): string {
  return githubSlugger.slug(str)
}

export default withMermaid(
  defineConfig({
  title: 'Linux 内核学习笔记',
  description: 'Linux 内核源码阅读与子系统分析 · USB / 设备模型 / 驱动 · 调用链梳理与调试实践',
  lang: 'zh-CN',
  base: '/',
  lastUpdated: true,

  markdown: {
    anchor: {
      slugify: githubSlugify,
    },
    config(md) {
      const render = md.render.bind(md)
      md.render = (src, env) => {
        githubSlugger.reset()
        return render(src, env)
      }
    },
  },

  mermaid: {
    theme: 'base',
    themeVariables: {
      darkMode: false,
      background: '#ffffff',
      fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif',
      fontSize: '16px',
      primaryColor: '#e8eaf6',
      primaryTextColor: '#1f2328',
      primaryBorderColor: '#57606a',
      secondaryColor: '#e8eaf6',
      secondaryTextColor: '#1f2328',
      secondaryBorderColor: '#57606a',
      tertiaryColor: '#fff8c5',
      tertiaryTextColor: '#1f2328',
      tertiaryBorderColor: '#57606a',
      lineColor: '#1f2328',
      textColor: '#1f2328',
      mainBkg: '#e8eaf6',
      nodeBorder: '#57606a',
      nodeTextColor: '#1f2328',
      clusterBkg: '#fff8c5',
      clusterBorder: '#8b949e',
      titleColor: '#1f2328',
      edgeLabelBackground: '#ffffff',
      border1: '#57606a',
      border2: '#8b949e',
    },
    darkThemeVariables: {
      darkMode: true,
      background: '#0d1117',
      fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif',
      fontSize: '16px',
      primaryColor: '#2a2f4a',
      primaryTextColor: '#e6edf3',
      primaryBorderColor: '#8b949e',
      secondaryColor: '#2a2f4a',
      secondaryTextColor: '#e6edf3',
      secondaryBorderColor: '#8b949e',
      tertiaryColor: '#3d3200',
      tertiaryTextColor: '#e6edf3',
      tertiaryBorderColor: '#8b949e',
      lineColor: '#e6edf3',
      textColor: '#e6edf3',
      mainBkg: '#2a2f4a',
      nodeBorder: '#8b949e',
      nodeTextColor: '#e6edf3',
      clusterBkg: '#3d3200',
      clusterBorder: '#6e7681',
      titleColor: '#e6edf3',
      edgeLabelBackground: '#0d1117',
      border1: '#8b949e',
      border2: '#6e7681',
    },
  },

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon.png' }],
  ],

  transformHead({ pageData }) {
    const canonical = canonicalUrl(pageData.relativePath)
    const extra: HeadConfig[] = [
      ['link', { rel: 'canonical', href: canonical }],
      ['meta', { property: 'og:url', content: canonical }],
    ]
    return extra
  },

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '内核分析', link: '/analysis/' },
      { text: '学习笔记', link: '/notes/' },
      { text: '关于', link: '/about' },
      {
        text: 'GitHub',
        link: 'https://github.com/dengtaowei/blogD'
      }
    ],

    sidebar,

    socialLinks: [
      { icon: 'github', link: 'https://github.com/dengtaowei/blogD' }
    ],

    footer: {
      message: '基于 VitePress 构建',
      copyright: 'Copyright © 2026'
    },

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/dengtaowei/blogD/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页',
    },

    lastUpdated: {
      text: '最后更新于',
      formatOptions: {
        dateStyle: 'medium',
        timeStyle: 'short',
      },
    },
  }
  })
)
