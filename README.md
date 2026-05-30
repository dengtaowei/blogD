# Linux 内核学习笔记

基于 [VitePress](https://vitepress.dev/) 的个人博客，记录 Linux 内核源码阅读与子系统分析。

## 目录结构

```
├── docs/              # VitePress 文档与博客内容
│   └── .vitepress/    # 站点配置、主题、侧边栏
├── code/              # 文章配套示例源码
├── scripts/           # 部署与 Git 钩子安装脚本
├── .cursor/rules/     # 协作规范（写作约定、提交规范等）
└── .github/workflows/ # GitHub Actions：CI 检查 + 自动部署
```

## 环境要求

- **Node.js >= 18**（推荐 20 LTS 或 22）
- 检查版本：`node -v`
- CI 固定使用 `.node-version` 指定的版本（当前 22）

若 `npm run docs:dev` 报 `Unexpected token '??='`，说明当前 npm 脚本用的是旧版 Node（例如 v14）。请从 [nodejs.org](https://nodejs.org/) 安装新版 Node.js，安装后重新打开终端。

## 本地开发

```bash
npm install
npm run docs:dev
```

浏览器访问 http://localhost:5173

## 提交规范与 CI

提交信息遵循 `<类型>(<范围>): <简述>`（详见 `.cursor/rules/commit-convention.mdc`）。

### 本地校验

`commit-msg` 钩子在 `git commit` 时检查标题格式。Git 钩子不随仓库 clone，**首次克隆或换机器后执行一次**：

```bash
npm run hooks:install
```

逻辑与 CI 共用 `scripts/validate-commit-subject.sh`。

### GitHub Actions（合入前检查）

`.github/workflows/ci.yml` 在 **PR 合入 `main`** 或 **push 到 `main`** 时自动运行，包含两个并行任务：

| 任务 | 检查内容 |
|------|----------|
| `commit-msg` | PR / 本次 push 中每条 commit 标题是否符合规范 |
| `build` | `npm ci` + `npm run docs:build`，确认站点能成功构建 |

## 构建与预览

```bash
npm run docs:build
npm run docs:preview
```

构建产物位于 `docs/.vitepress/dist/`。

## 部署到 VPS

### 自动部署（推荐）

推送到 `main` 分支后，由 GitHub Actions（`.github/workflows/ci.yml`：`build` 构建 → `deploy` rsync）部署到 VPS。需在仓库 Settings → Secrets 配置：`SSH_PRIVATE_KEY`、`REMOTE_HOST`、`REMOTE_USER`、`REMOTE_PORT`。

### 手动部署

仅在需要本机直传时使用（日常合入 `main` 走 Actions 即可，**无需配置**）。

1. 复制部署配置模板并填写 VPS 信息（**每台要手动部署的机器做一次**，文件已 gitignore）：

```bash
cp scripts/deploy.example.env scripts/deploy.local.env
```

Windows（PowerShell）：

```powershell
Copy-Item scripts/deploy.example.env scripts/deploy.local.env
```

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

> 部署脚本只负责把构建产物 rsync 到 VPS 的目标目录，**不管 nginx 的域名 / 端口 / HTTPS 证书**，这些需在服务器上单独配置。
