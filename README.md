# 嵌入式学习笔记

基于 [VitePress](https://vitepress.dev/) 的个人博客，记录嵌入式开发的学习心得与代码分析。

## 目录结构

```
├── docs/           # VitePress 文档与博客内容
├── code/           # 嵌入式示例与分析源码
└── scripts/        # 部署脚本
```

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

1. 修改 `scripts/deploy.sh` 中的 VPS 地址与目标路径
2. 执行部署：

```bash
bash scripts/deploy.sh
```

或使用 GitHub Actions 自动部署（需配置 Secrets）。
