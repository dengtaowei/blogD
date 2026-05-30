#!/usr/bin/env bash
# 把 scripts/git-hooks/ 下的钩子安装到 .git/hooks/
# Git 钩子不随仓库 clone，换机器或重新 clone 后执行一次：npm run hooks:install
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$SCRIPT_DIR/git-hooks"
DST_DIR="$PROJECT_DIR/.git/hooks"

if [ ! -d "$DST_DIR" ]; then
  echo "未找到 $DST_DIR，请在 git 仓库根目录运行。" >&2
  exit 1
fi

for hook in "$SRC_DIR"/*; do
  name="$(basename "$hook")"
  cp "$hook" "$DST_DIR/$name"
  chmod +x "$DST_DIR/$name"
  echo ">>> 已安装钩子：$name"
done

echo ">>> 完成"
