import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import GithubSlugger from 'github-slugger'

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
    ['link', { rel: 'icon', href: '/favicon.ico' }]
  ],

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
              text: 'Pinctrl / GPIO 子系统',
              items: [
                { text: 'STM32 Pinctrl 分析', link: '/analysis/kernel/pinctrl/stm32-pinctrl' },
                { text: 'STM32 GPIO 分析', link: '/analysis/kernel/gpio/stm32-gpio' }
              ]
            },
            {
              text: 'SPI 子系统',
              items: [
                { text: 'STM32MP157 SPI 子系统', link: '/analysis/kernel/spi/spi-sync-trace' }
              ]
            },
            {
              text: '调试与实践',
              items: [
                { text: '概览', link: '/analysis/kernel/debug/' },
                { text: 'USB', link: '/analysis/kernel/debug/usb/' },
                { text: '写作模板', link: '/analysis/kernel/debug/template' }
              ]
            }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/dengtaowei/blogD' }
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
