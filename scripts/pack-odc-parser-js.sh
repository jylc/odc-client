#!/usr/bin/env bash
#
# 打包离线安装包：odc-parser-js（含构建产物）+ 运行时依赖闭包
#
# 联网机器执行：
#   bash scripts/pack-odc-parser-js.sh            # 重新构建后打包
#   bash scripts/pack-odc-parser-js.sh --skip-build  # 跳过构建（产物已是最新时）
#   bash scripts/pack-odc-parser-js.sh --full     # 额外包含 349MB 构建依赖（离线机要重新构建时）
#
# 产物：项目根目录 odc-parser-js-offline-<时间戳>.tar.gz
#       解压后得到 odc-parser-js/ 与 vendor/ 两个目录（配合 scripts/install-odc-parser-js-offline.sh 使用）
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDORED="$ROOT/libraries/odc-parser-js"
PKG="$VENDORED/packages/monaco-plugin-ob"
STAGING="$ROOT/.offline-pack-staging"
INCLUDE_BUILD_DEPS=0
SKIP_BUILD=0

for arg in "$@"; do
  case "$arg" in
    --full) INCLUDE_BUILD_DEPS=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    *) echo "未知参数: $arg（支持 --full / --skip-build）"; exit 1 ;;
  esac
done

command -v pnpm >/dev/null || { echo "[错误] 未找到 pnpm"; exit 1; }

# 1. 构建插件（dist + worker-dist）
if [[ $SKIP_BUILD -eq 0 ]]; then
  echo "[1/4] 构建 monaco-plugin-ob ..."
  (cd "$VENDORED" && pnpm --filter @oceanbase-odc/monaco-plugin-ob run build)
else
  echo "[1/4] 跳过构建（--skip-build）"
fi
[[ -d "$PKG/dist" && -d "$PKG/worker-dist" ]] || { echo "[错误] 构建产物缺失：$PKG/{dist,worker-dist}"; exit 1; }

# 2. 组装暂存目录
echo "[2/4] 组装打包内容 ..."
rm -rf "$STAGING"
mkdir -p "$STAGING/vendor"

# 2.1 vendored 仓库（源码 + 产物 + .git 本地提交历史；剔除构建依赖 node_modules）
mkdir -p "$STAGING/odc-parser-js"
(cd "$VENDORED" && tar -cf - --exclude='node_modules' --exclude='*/node_modules' .) \
  | (cd "$STAGING/odc-parser-js" && tar -xf -)
if [[ $INCLUDE_BUILD_DEPS -eq 1 ]]; then
  cp -r "$PKG/node_modules" "$STAGING/odc-parser-js/packages/monaco-plugin-ob/node_modules"
fi

# 2.2 运行时依赖闭包（从本项目 node_modules/.pnpm 取，无需网络）
copy_from_pnpm() {
  local dir_name="$1" dest="$2" src
  if [[ "$dir_name" == @*+* ]]; then
    # scoped 包：@scope+name@version -> .pnpm/<dir>/node_modules/@scope/name
    local scope="${dir_name%%+*}"
    local name="${dir_name#*+}"
    name="${name%%@*}"
    src="$ROOT/node_modules/.pnpm/$dir_name/node_modules/$scope/$name"
  else
    src="$ROOT/node_modules/.pnpm/$dir_name/node_modules/$dir_name"
    src="${src%/*}/$(basename "$dest")"
  fi
  [[ -d "$src" ]] || { echo "[错误] .pnpm 中找不到 $dir_name"; exit 1; }
  rm -rf "$dest"
  mkdir -p "$(dirname "$dest")"
  cp -r "$src" "$dest"
}
copy_from_pnpm "comlink@4.4.2"                          "$STAGING/vendor/comlink"
copy_from_pnpm "antlr4@4.8.0"                           "$STAGING/vendor/antlr4"
copy_from_pnpm "lodash@4.18.1"                          "$STAGING/vendor/lodash"
copy_from_pnpm "@oceanbase-odc+ob-parser-js@3.2.1"      "$STAGING/vendor/ob-parser-js"

# 2.3 附带安装说明
cat > "$STAGING/README-离线安装.txt" << 'EOF'
odc-parser-js 离线安装包
========================
内容：
  odc-parser-js/   vendored 源码仓库（含 dist/worker-dist 构建产物与本地修复提交历史）
  vendor/          monaco-plugin-ob 的运行时依赖闭包（comlink/antlr4/lodash/ob-parser-js）

离线机器安装（在 odc-client 项目根目录）：
  1. 解压本包到项目根的 libraries/ 目录，得到：
       libraries/odc-parser-js/
       libraries/vendor/
     （或直接交给安装脚本自动解压：bash scripts/install-odc-parser-js-offline.sh <本压缩包路径>）
  2. bash scripts/install-odc-parser-js-offline.sh
  3. pnpm run dev，浏览器刷新页面

注意：
  - 若之后在离线机重新执行了 pnpm install，请重跑一次安装脚本；
  - package.json 中依赖声明须为
      "@oceanbase-odc/monaco-plugin-ob": "file:libraries/odc-parser-js/packages/monaco-plugin-ob"
EOF

# 3. 打包
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$ROOT/odc-parser-js-offline-$STAMP.tar.gz"
echo "[3/4] 压缩 ..."
tar -czf "$OUT" -C "$STAGING" odc-parser-js vendor README-离线安装.txt

# 4. 汇总
echo "[4/4] 完成"
du -sh "$OUT"
echo
echo "内容概览："
tar -tzf "$OUT" | awk -F/ '{print $1"/"$2}' | sort -u | head -20
echo
echo "传输到离线机后，在 odc-client 项目根执行："
echo "  bash scripts/install-odc-parser-js-offline.sh $OUT 的文件名"
rm -rf "$STAGING"
