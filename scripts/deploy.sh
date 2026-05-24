#!/usr/bin/env bash
# Windows 用户请使用 scripts/deploy.ps1 或 npm run docs:deploy
set -euo pipefail

# ========== 部署配置（请修改为你的 VPS 信息）==========
REMOTE_USER="root"
REMOTE_HOST="68.168.135.59"
REMOTE_PORT="27361"
REMOTE_DIR="/var/www/linux-kernel-notes"
# ======================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo ">>> 构建 VitePress..."
npm run docs:build

echo ">>> 上传到 ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PORT} → ${REMOTE_DIR}"
rsync -avz --delete -e "ssh -p ${REMOTE_PORT}" \
  docs/.vitepress/dist/ \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo ">>> 部署完成"
