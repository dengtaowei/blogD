#!/usr/bin/env bash
# 校验单行提交标题是否符合规范。供 commit-msg 钩子与 CI 共用。
# 用法：validate-commit-subject.sh "post(gpio): 简述"
set -euo pipefail

subject="${1:-}"

if [ -z "$subject" ]; then
  echo "用法: $0 \"<提交标题>\"" >&2
  exit 2
fi

case "$subject" in
  Merge*|Revert*|fixup!*|squash!*|amend!*) exit 0 ;;
esac

types='post|update|fix|site|style|chore|repo'
pattern="^(${types})(\([a-z0-9/_-]+\))?: .+"

if ! printf '%s' "$subject" | grep -qE "$pattern"; then
  {
    echo "✗ 提交信息不符合规范："
    echo "    $subject"
    echo
    echo "  正确格式：<类型>(<范围>): <简述>"
    echo "  类型：    post update fix site style chore repo"
    echo "  范围(可选)：usb gpio pinctrl spi debug notes config deploy theme"
    echo "  示例：    post(debug/gpio): 新增 IMX6ULL SPI 片选 GPIO runtime PM 分析"
    echo
    echo "  规范详见 .cursor/rules/commit-convention.mdc"
  } >&2
  exit 1
fi

len="$(printf '%s' "$subject" | wc -m | tr -d '[:space:]')"
if [ "$len" -gt 60 ]; then
  echo "⚠ 标题偏长（${len} 字符，建议 ≤ 50）：$subject" >&2
fi

exit 0
