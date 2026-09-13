#!/usr/bin/env bash
#
# 离线安装 odc-parser-js（monaco-plugin-ob）到 odc-client
#
# 在 odc-client 项目根目录执行：
#   bash scripts/install-odc-parser-js-offline.sh              # libraries/odc-parser-js 已解压好
#   bash scripts/install-odc-parser-js-offline.sh <压缩包>      # 交给脚本自动解压（解压到 libraries/）
#
# 原理：不依赖 pnpm store，直接把构建产物放置到
#       node_modules/@oceanbase-odc/monaco-plugin-ob，
#       并按需补齐 comlink/antlr4/lodash/ob-parser-js 的解析（嵌套 node_modules）。
#       之后 pnpm run dev 由 webpack 正常解析。
#
# 注意：若此后重新执行了 pnpm install，请重跑本脚本。
#
set -euo pipefail

ROOT="${ODC_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"   # ODC_ROOT 仅用于自测沙箱
PKG_SRC="$ROOT/libraries/odc-parser-js/packages/monaco-plugin-ob"
VENDOR="$ROOT/libraries/vendor"
DEST="$ROOT/node_modules/@oceanbase-odc/monaco-plugin-ob"

die() { echo "[错误] $*"; exit 1; }

# 0. 自动解压（可选）
# 传了压缩包即视为一次完整重装：先清掉旧的 libraries/odc-parser-js 与 libraries/vendor
# 再解压。否则旧版产物残留（例如 8 月的包不含 9 月的修复），下方标记校验必失败。
if [[ -n "${1:-}" ]]; then
  [[ -f "$1" ]] || die "压缩包不存在: $1"
  mkdir -p "$ROOT/libraries"
  echo "[0] 清理旧内容并解压 $1 -> $ROOT/libraries/"
  rm -rf "$ROOT/libraries/odc-parser-js" "$ROOT/libraries/vendor"
  tar -xzf "$1" -C "$ROOT/libraries/"
elif [[ ! -d "$PKG_SRC" ]]; then
  die "未找到 $PKG_SRC，请传入离线压缩包参数"
fi

# 1. 前置校验
[[ -f "$PKG_SRC/package.json" ]] || die "未找到 $PKG_SRC/package.json（确认压缩包解压到了 libraries/ 下）"
[[ -d "$PKG_SRC/dist" && -d "$PKG_SRC/worker-dist" ]] \
  || die "构建产物缺失（dist/worker-dist）。压缩包必须来自目录打包，不能是 git clone 的仓库"
command -v node >/dev/null || die "未找到 node"
# 环境守卫：本脚本面向离线机（vendor 运行时依赖随离线包解压而来）。
# 在联网开发机上 vendor 不存在，运行会先破坏 node_modules 再失败——直接拒绝执行。
if [[ ! -d "$VENDOR" ]]; then
  die "未找到 $VENDOR（libraries/vendor）。本脚本只能在离线机上、解压离线包之后运行；
      联网开发机无需安装（node_modules 中的包与 libraries 源码硬链接，构建即生效）"
fi

# 2. 放置主包（删除旧符号链接/旧版本，放置实体目录，仅保留运行所需内容）
echo "[1] 安装 monaco-plugin-ob -> ${DEST#"$ROOT"/}"
rm -rf "$DEST"
mkdir -p "$DEST"
for item in dist worker-dist package.json README.md; do
  [[ -e "$PKG_SRC/$item" ]] && cp -r "$PKG_SRC/$item" "$DEST/$item"
done
[[ -d "$DEST/dist" ]] || die "拷贝 dist 失败"

# 3. 运行时依赖兜底：能解析则跳过，不能则从 vendor 嵌套安装
ensure_dep() {
  # $1 = require 的包名（如 comlink）；$2 = vendor 目录名
  local pkg="$1" vdir="$2" nested="$DEST/node_modules/$1"
  if node -e "require.resolve('$pkg',{paths:[process.argv[1]]})" "$DEST" >/dev/null 2>&1; then
    echo "    $pkg：已有（跳过）"
    return 0
  fi
  [[ -d "$VENDOR/$vdir" ]] || die "依赖 $pkg 无法解析，且 $VENDOR/$vdir 不存在（压缩包不完整）"
  mkdir -p "$(dirname "$nested")"
  cp -r "$VENDOR/$vdir" "$nested"
  node -e "require.resolve('$pkg',{paths:[process.argv[1]]})" "$DEST" >/dev/null 2>&1 \
    || die "$pkg 嵌套安装后仍无法解析"
  echo "    $pkg：已从 vendor 嵌套安装"
}
echo "[2] 校验/补齐运行时依赖："
ensure_dep "comlink" "comlink"
ensure_dep "antlr4" "antlr4"
ensure_dep "lodash" "lodash"
ensure_dep "@oceanbase-odc/ob-parser-js/package.json" "ob-parser-js"

# 4. 验证安装内容为本仓库构建产物（含全部本地修复）
echo "[3] 验证："
FIX_MARK="$(grep -c prefixHasMetadata "$DEST/dist/obmysql/worker/parser.js" 2>/dev/null || true)"
echo "    语句间补全修复标记 prefixHasMetadata：${FIX_MARK:-0} 处（应 ≥1）"
FIX_MARK2="$(grep -c flattenFromTables "$DEST/dist/model/dialect/obmysql.js" 2>/dev/null || true)"
echo "    JOIN 别名修复标记 flattenFromTables：${FIX_MARK2:-0} 处（应 ≥1）"
FIX_MARK3="$(grep -c 'left|right|full' "$DEST/worker-dist/obmysql.js" 2>/dev/null || true)"
echo "    LEFT JOIN 补全修复标记 left|right|full：${FIX_MARK3:-0} 处（应 ≥1）"
[[ "${FIX_MARK:-0}" -ge 1 && "${FIX_MARK2:-0}" -ge 1 && "${FIX_MARK3:-0}" -ge 1 ]] || die "安装内容不是最新构建产物，请在联网机重新打包"
ls "$DEST/worker-dist" | sed 's/^/    worker-dist: /'

echo
echo "安装完成。下一步："
echo "  1. pnpm run dev"
echo "  2. 浏览器刷新页面（Worker 不会热替换，必须刷新）"
echo "  3. 验证 worker：curl -o /dev/null -w \"%{http_code} %{size_download}\" http://localhost:8000/workers/1_6_5/obmysql.js"
echo "提醒：之后如执行过 pnpm install，请重跑本脚本。"
