import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '嵌入式学习笔记',
  description: '嵌入式代码分析与学习心得',
  lang: 'zh-CN',
  base: '/',

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }]
  ],

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '学习笔记', link: '/notes/' },
      { text: '代码分析', link: '/analysis/' },
      {
        text: 'GitHub',
        link: 'https://github.com/dengtaowei/blog'
      }
    ],

    sidebar: {
      '/notes/': [
        {
          text: 'RTOS',
          items: [
            { text: 'FreeRTOS 任务调度', link: '/notes/rtos/task-scheduling' }
          ]
        }
      ],
      '/analysis/': [
        {
          text: '驱动分析',
          items: [
            { text: 'UVC 驱动分析', link: '/analysis/uvc-driver' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/dengtaowei/blog' }
    ],

    footer: {
      message: '基于 VitePress 构建',
      copyright: 'Copyright © 2026'
    },

    search: {
      provider: 'local'
    }
  }
})
