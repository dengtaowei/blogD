# Linux 内核学习笔记

基于 [VitePress](https://vitepress.dev/) 的个人博客，记录 Linux 内核源码阅读与子系统分析。

## 目录结构

```
├── docs/           # VitePress 文档与博客内容
├── code/           # 文章配套示例源码
└── scripts/        # 部署脚本
```

## 环境要求

- **Node.js >= 18**（推荐 20 LTS 或 22）
- 检查版本：`node -v`

若 `npm run docs:dev` 报 `Unexpected token '??='`，说明当前 npm 脚本用的是旧版 Node（例如 v14）。请从 [nodejs.org](https://nodejs.org/) 安装新版 Node.js，安装后重新打开终端。

## 本地开发

```bash
npm install
npm run docs:dev
```

浏览器访问 http://localhost:5173

## 构建与预览

```bash
npm run docs:build
npm run docs:preview
```

构建产物位于 `docs/.vitepress/dist/`。

## 部署到 VPS

1. 修改部署脚本中的 VPS 地址、端口与目标路径：
   - Windows：`scripts/deploy.ps1`
   - Linux / macOS / Git Bash：`scripts/deploy.sh`
2. 确保本机已安装 [OpenSSH 客户端](https://learn.microsoft.com/zh-cn/windows-server/administration/openssh/openssh_install_firstuse)（Windows 10+ 可选功能）
3. 执行部署：

**Windows（PowerShell）：**

```powershell
npm run docs:deploy
```

**Linux / macOS / Git Bash：**

```bash
bash scripts/deploy.sh
```

或使用 GitHub Actions 自动部署（需配置 Secrets）。
