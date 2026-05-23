#!/usr/bin/env bash
set -euo pipefail

# ========== 部署配置（请修改为你的 VPS 信息）==========
REMOTE_USER="root"
REMOTE_HOST="your-vps-ip"
REMOTE_DIR="/var/www/embedded-blog"
# ======================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo ">>> 构建 VitePress..."
npm run docs:build

echo ">>> 上传到 ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"
rsync -avz --delete \
  docs/.vitepress/dist/ \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo ">>> 部署完成"
