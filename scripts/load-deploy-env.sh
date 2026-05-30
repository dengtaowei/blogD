#!/usr/bin/env bash
# 加载 scripts/deploy.local.env。供 deploy.sh 调用。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/deploy.local.env"
EXAMPLE_FILE="${SCRIPT_DIR}/deploy.example.env"

if [ ! -f "$ENV_FILE" ]; then
  {
    echo "未找到 ${ENV_FILE}"
    echo "请复制模板并填写 VPS 信息："
    echo "  cp scripts/deploy.example.env scripts/deploy.local.env"
  } >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

for var in REMOTE_USER REMOTE_HOST REMOTE_PORT REMOTE_DIR; do
  if [ -z "${!var:-}" ]; then
    echo "deploy.local.env 缺少必填项：${var}" >&2
    exit 1
  fi
done
