import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
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
          text: 'Linux 内核',
          items: [
            { text: '概览', link: '/analysis/kernel/' },
            {
              text: 'USB 子系统',
              items: [
                { text: 'USB 2.0 枚举流程', link: '/analysis/kernel/usb/usb-enumeration' },
                { text: 'hub_port_init 调用链', link: '/analysis/kernel/usb/hub-port-init' },
                { text: 'usb_get_descriptor 调用链', link: '/analysis/kernel/usb/get-descriptor-trace' },
                { text: '枚举与两轮 Probe', link: '/analysis/kernel/usb/enumeration-and-probe' },
                { text: 'UVC 驱动分析', link: '/analysis/kernel/usb/uvc-driver' }
              ]
            },
            {
              text: 'Pinctrl 子系统',
              items: [
                { text: 'STM32 Pinctrl 分析', link: '/analysis/kernel/pinctrl/stm32-pinctrl' }
              ]
            }
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
)
