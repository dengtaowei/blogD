#!/usr/bin/env bash
# 校验 git 区间内每条提交的标题。CI 在 PR / push 时调用。
# 用法：validate-commits-range.sh <base_sha> <head_sha>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATE="$SCRIPT_DIR/validate-commit-subject.sh"

base="${1:-}"
head="${2:-}"

if [ -z "$base" ] || [ -z "$head" ]; then
  echo "用法: $0 <base_sha> <head_sha>" >&2
  exit 2
fi

if ! git rev-parse --verify "$base^{commit}" >/dev/null 2>&1; then
  echo "无效的 base: $base" >&2
  exit 2
fi
if ! git rev-parse --verify "$head^{commit}" >/dev/null 2>&1; then
  echo "无效的 head: $head" >&2
  exit 2
fi

count=0
failed=0

while IFS= read -r subject; do
  [ -z "$subject" ] && continue
  count=$((count + 1))
  echo ">>> 检查 [$count]: $subject"
  if ! bash "$VALIDATE" "$subject"; then
    failed=$((failed + 1))
  fi
done < <(git log --format=%s "${base}..${head}")

if [ "$count" -eq 0 ]; then
  echo ">>> 区间内无新提交，跳过校验"
  exit 0
fi

if [ "$failed" -gt 0 ]; then
  echo ">>> 共 $count 条提交，$failed 条不符合规范" >&2
  exit 1
fi

echo ">>> 共 $count 条提交，全部符合规范"
exit 0
