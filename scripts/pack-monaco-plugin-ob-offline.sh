#!/usr/bin/env bash
#
# 打包离线安装包：monaco-plugin-ob@1.7.3（npm 安装实物）+ 运行时依赖闭包
#
# 联网机器执行（本项目根目录）：
#   bash scripts/pack-monaco-plugin-ob-offline.sh
#
# 产物：项目根目录 monaco-plugin-ob-offline-<版本>-<时间戳>.tar.gz
#       解压后得到 monaco-plugin-ob/、vendor/ 两个目录与 install-monaco-plugin-ob-offline.sh
#       （在离线机执行 install-monaco-plugin-ob-offline.sh 完成安装）
#
# 与 scripts/pack-odc-parser-js.sh 的区别：本脚本直接打包 node_modules 中已安装的
# npm 实物（1.7.3，pnpm lockfile 解析产物），不依赖 libraries/odc-parser-js 源码构建，
# 也不要求联网机存在 vendored 仓库。
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -W 2>/dev/null || pwd)"   # pwd -W: Git Bash 下取 Windows 风格路径（node 可识别）
SRC="$ROOT/node_modules/@oceanbase-odc/monaco-plugin-ob"
PNPM_DIR="$ROOT/node_modules/.pnpm"
STAGING="$ROOT/.offline-pack-staging"
EXPECT_VERSION="1.7.3"

command -v node >/dev/null || { echo "[错误] 未找到 node"; exit 1; }

# 1. 前置校验
[[ -f "$SRC/package.json" ]] || { echo "[错误] 未找到 $SRC/package.json（先执行 pnpm install）"; exit 1; }
[[ -d "$SRC/dist" && -d "$SRC/worker-dist" ]] || { echo "[错误] 安装包不完整：缺少 dist/ 或 worker-dist/"; exit 1; }

VER="$(node -p "require('$SRC/package.json').version")"
echo "[1/4] 源包校验：@oceanbase-odc/monaco-plugin-ob@$VER"
if [[ "$VER" != "$EXPECT_VERSION" ]]; then
  echo "[警告] 版本 $VER 与预期 $EXPECT_VERSION 不一致，继续打包（产物以实际版本命名）"
fi

# 从 pnpm 目录解析依赖的真实路径（经 require.resolve，保证与运行时一致）
# 注意：SRC 是 pnpm 符号链接，必须先 realpath 穿透到 .pnpm/<pkg>/node_modules，
# 否则从符号链接路径向上解析找不到传递依赖（如 comlink）
resolve_dep_dir() {
  node -e "
    const fs = require('fs'), path = require('path');
    const base = fs.realpathSync(process.argv[1]);
    const p = require.resolve('$1/package.json', { paths: [base] });
    console.log(path.dirname(p).replace(/\\\\/g, '/'));
  " "$SRC"
}

# 2. 组装暂存目录
echo "[2/4] 组装打包内容 ..."
rm -rf "$STAGING"
mkdir -p "$STAGING/monaco-plugin-ob" "$STAGING/vendor/@oceanbase-odc"

# 2.1 主包（files 字段声明的内容：dist worker-dist package.json README.md）
for item in dist worker-dist package.json README.md; do
  [[ -e "$SRC/$item" ]] && cp -r "$SRC/$item" "$STAGING/monaco-plugin-ob/$item"
done
[[ -d "$STAGING/monaco-plugin-ob/dist" && -d "$STAGING/monaco-plugin-ob/worker-dist" ]] \
  || { echo "[错误] 主包内容不完整（dist/worker-dist）"; exit 1; }

# 2.2 运行时依赖闭包（从 node_modules/.pnpm 取真实解析路径）
copy_dep() {
  local name="$1" dest="$STAGING/vendor/$1" dir
  dir="$(resolve_dep_dir "$name")"
  mkdir -p "$(dirname "$dest")"
  cp -r "$dir" "$dest"
  echo "    $name ($(node -p "require('$dir/package.json').version" 2>/dev/null || echo '?'))"
}
echo "    收集运行时依赖闭包："
copy_dep "comlink"
copy_dep "antlr4"
copy_dep "lodash"
copy_dep "@oceanbase-odc/ob-parser-js"

# 2.3 安装脚本随包携带
cp "$ROOT/scripts/install-monaco-plugin-ob-offline.sh" "$STAGING/"
chmod +x "$STAGING/install-monaco-plugin-ob-offline.sh"

# 3. 打 tar.gz
OUT="$ROOT/monaco-plugin-ob-offline-$VER-$(date +%Y%m%d-%H%M%S).tar.gz"
echo "[3/4] 打包 -> $OUT"
tar --force-local -czf "$OUT" -C "$STAGING" .

# 4. 完整性自检
echo "[4/4] 自检："
TAR_LIST="$(tar --force-local -tzf "$OUT")"
for must in "monaco-plugin-ob/dist/" "monaco-plugin-ob/worker-dist/mysql.js" \
            "monaco-plugin-ob/package.json" "vendor/comlink/" "vendor/antlr4/" \
            "vendor/lodash/" "vendor/@oceanbase-odc/ob-parser-js/" \
            "install-monaco-plugin-ob-offline.sh"; do
  echo "$TAR_LIST" | grep -q "$must" || { echo "[错误] 压缩包缺少 $must"; exit 1; }
done
SIZE="$(du -h "$OUT" | cut -f1)"
echo "    内容完整（dist/worker-dist/依赖闭包/安装脚本）"
echo
echo "打包完成：$OUT ($SIZE)"
echo "离线机使用：解压后执行 bash install-monaco-plugin-ob-offline.sh（详见脚本头注释）"
