# Linux 内核学习笔记

**在线站点**：https://www.xvfex.com.cn

基于 [VitePress](https://vitepress.dev/) 的个人博客，记录 Linux 内核源码阅读与子系统分析。源码仓库：[github.com/dengtaowei/blogD](https://github.com/dengtaowei/blogD)。

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

## 提交规范与合入

提交信息遵循 `<类型>(<范围>): <简述>`（详见 `.cursor/rules/commit-convention.mdc`）。

**`main` 受分支保护，不可直接 push。** 改动经 PR 合入后，`deploy` job 自动部署到 VPS。

### 合入流程（PR）

1. 从最新 `main` 建功能分支：

```bash
git checkout main
git pull
git checkout -b fix/简述    # 或 post/、chore/、site/ 等，见 commit 规范
```

2. 改代码、commit（提交前建议本地 `npm run docs:build`）
3. `git push -u origin <分支名>` → **CI 自动跑**（无需先开 PR）
4. 在 GitHub 开 PR → `main`（push 后检查已绿则可直接 Merge）
5. Merge；push 到 `main` 后触发 `deploy`（见下表）
6. 删除已 merge 的功能分支

### 本地校验

`commit-msg` 钩子在 `git commit` 时检查标题格式。Git 钩子不随仓库 clone，**首次克隆或换机器后执行一次**：

```bash
npm run hooks:install
```

逻辑与 CI 共用 `scripts/validate-commit-subject.sh`（Windows 需 Git Bash / WSL）。

### GitHub Actions

工作流见 `.github/workflows/ci.yml`。

**功能分支 push**（`commit-msg` 与 `build` 并行，**push 后即跑，不必先开 PR**）：

| 任务 | 检查内容 |
|------|----------|
| `commit-msg` | 本次 push 新增 commit 标题是否符合规范 |
| `build` | `npm ci` + `npm run docs:build` |

**合入 `main` 后**（push 到 `main` 时，`build` 上传产物 → `deploy` rsync）：

| 任务 | 说明 |
|------|------|
| `commit-msg` | 本次 push 新增 commit 标题校验 |
| `build` | 构建站点并上传 artifact |
| `deploy` | 复用 `build` 产物 rsync 到 VPS（需 Secrets，见下文） |

PR 门禁只需 `commit-msg` 与 `build` 通过即可 Merge；`deploy` 在 Merge 之后自动执行。

## 构建与预览

```bash
npm run docs:build
npm run docs:preview
```

构建产物位于 `docs/.vitepress/dist/`。

## 部署到 VPS

### 自动部署（推荐）

日常只需 **PR → Merge**，无需本机配置。Merge 后 push 到 `main` 触发 CI 的 `deploy` job（复用同次 `build` 产物 rsync）。

需在仓库 **Settings → Secrets** 配置：

| Secret | 用途 |
|--------|------|
| `SSH_PRIVATE_KEY` | VPS SSH 私钥 |
| `REMOTE_HOST` | 主机地址 |
| `REMOTE_USER` | SSH 用户名 |
| `REMOTE_PORT` | SSH 端口 |

目标目录等工作流内配置见 `.github/workflows/ci.yml` 的 `deploy` job。

**失败通知**：`main` 上 `build` 或 `deploy` 失败时，CI 会自动开/更新 GitHub Issue（标题以 `[CI] main 构建/部署失败` 开头）。若希望同时收到邮件：在 **头像 → Settings**（个人设置，非本仓库 Settings）打开 [Notifications](https://github.com/settings/notifications)，**System → Actions** 选 **Email**，勾选 **Only notify for failed workflows** 并 Save；且需 [Watch 本仓库](https://github.com/dengtaowei/blogD)。

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
