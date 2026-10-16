#!/usr/bin/env bash
#
# 离线安装 monaco-plugin-ob@1.7.3 到 odc-client
#
# 在 odc-client 项目根目录执行：
#   bash install-monaco-plugin-ob-offline.sh              # 解压包已在本目录/当前目录解压好
#   bash install-monaco-plugin-ob-offline.sh <压缩包>      # 交给脚本自动解压（解压到当前目录）
#
# 原理：不依赖 npm registry / pnpm store，把离线包中的主包实物放置到
#       node_modules/@oceanbase-odc/monaco-plugin-ob（替换 pnpm 符号链接），
#       并按需把 comlink/antlr4/lodash/@oceanbase-odc/ob-parser-js 嵌套安装到
#       主包目录的 node_modules/ 下（webpack 从主包位置向上解析，嵌套即可命中）。
#
# 注意：
#   1. 若此后重新执行 pnpm install，pnpm 会按 lockfile 重建该目录（离线机无网络会失败），
#      届时请重跑本脚本。
#   2. 安装/替换后需刷新浏览器（Worker 不会热替换）。
#
set -euo pipefail

ROOT="$(pwd -W 2>/dev/null || pwd)"   # pwd -W: Git Bash 下取 Windows 风格路径（node 可识别）
PKG_DIR="$ROOT/monaco-plugin-ob"
VENDOR="$ROOT/vendor"
DEST="$ROOT/node_modules/@oceanbase-odc/monaco-plugin-ob"

die() { echo "[错误] $*"; exit 1; }
command -v node >/dev/null || die "未找到 node"

# 0. 自动解压（可选）
if [[ -n "${1:-}" ]]; then
  [[ -f "$1" ]] || die "压缩包不存在: $1"
  echo "[0] 解压 $1 -> $ROOT/"
  tar -xzf "$1" -C "$ROOT/"
fi
[[ -d "$PKG_DIR" ]] || die "未找到 $PKG_DIR（请先解压离线包，或在解压目录中执行本脚本）"
[[ -d "$VENDOR" ]] || die "未找到 $VENDOR（离线包不完整）"

# 1. 主包校验
[[ -f "$PKG_DIR/package.json" ]] || die "主包缺少 package.json"
[[ -d "$PKG_DIR/dist" && -d "$PKG_DIR/worker-dist" ]] || die "主包缺少 dist/ 或 worker-dist/"
VER="$(node -p "require('$PKG_DIR/package.json').version")"
echo "[1] 主包校验通过：@oceanbase-odc/monaco-plugin-ob@$VER"

# 2. 放置主包（删除 pnpm 符号链接/旧内容，放置实物目录）
echo "[2] 安装 monaco-plugin-ob -> ${DEST#"$ROOT"/}"
rm -rf "$DEST"
mkdir -p "$DEST"
for item in dist worker-dist package.json README.md; do
  [[ -e "$PKG_DIR/$item" ]] && cp -r "$PKG_DIR/$item" "$DEST/$item"
done
[[ -d "$DEST/dist" && -d "$DEST/worker-dist" ]] || die "拷贝 dist/worker-dist 失败"

# 3. 运行时依赖：能解析则跳过，不能则从 vendor 嵌套安装到主包 node_modules/
ensure_dep() {
  local pkg="$1" vdir="$2" nested="$DEST/node_modules/$1"
  if node -e "require.resolve('$pkg', { paths: [process.argv[1]] })" "$DEST" >/dev/null 2>&1; then
    echo "    $pkg：已可解析（跳过）"
    return 0
  fi
  [[ -d "$VENDOR/$vdir" ]] || die "依赖 $pkg 无法解析，且 vendor/$vdir 不存在（离线包不完整）"
  mkdir -p "$(dirname "$nested")"
  cp -r "$VENDOR/$vdir" "$nested"
  node -e "require.resolve('$pkg', { paths: [process.argv[1]] })" "$DEST" >/dev/null 2>&1 \
    || die "$pkg 嵌套安装后仍无法解析"
  echo "    $pkg：已从 vendor 嵌套安装"
}
echo "[3] 校验/补齐运行时依赖："
ensure_dep "comlink" "comlink"
ensure_dep "antlr4" "antlr4"
ensure_dep "lodash" "lodash"
ensure_dep "@oceanbase-odc/ob-parser-js/package.json" "@oceanbase-odc/ob-parser-js"

# 4. 验证
echo "[4] 验证："
ls "$DEST/worker-dist" | sed 's/^/    worker-dist: /'
echo "    版本：$VER（预期 1.7.3）"

echo
echo "安装完成。下一步："
echo "  1. pnpm run dev"
echo "  2. 浏览器刷新页面（Worker 不会热替换，必须刷新）"
echo "  3. 验证 worker：curl -o /dev/null -w \"%{http_code} %{size_download}\" http://localhost:8000/workers/1_7_3/mysql.js"
echo "提醒：之后如执行过 pnpm install，请重跑本脚本。"
