#!/usr/bin/env node

/**
 * 打包 tab_services 的所有 pnpm 依赖为离线 store
 *
 * 原理：
 *   1. 临时设置 store-dir 为项目内的 .pnpm-store（隔离其他项目）
 *   2. 删除 node_modules 并重新安装（仅当前项目依赖写入独立 store）
 *   3. 将 store 内容 + lockfile 复制到 offline-deps/ 目录
 *   4. 恢复原始 .npmrc
 *   5. 目标机器通过 store-dir 配置使用本地 store 执行 pnpm install --offline
 *
 * 用法: pnpm run offline:pack
 */

const fs = require('fs');
const path = require('path');
const {
  log,
  ensureDir,
  runCommand,
  getPnpmVersion,
  getNodeVersion,
  getPlatform,
  writeManifest,
  getDirectorySize,
  formatBytes,
} = require(path.join(__dirname, 'lib', 'store-utils.cjs'));

const ROOT_DIR = path.resolve(__dirname, '..');
const OFFLINE_DEPS_DIR = path.join(ROOT_DIR, 'offline-deps');
const STORE_OUTPUT_DIR = path.join(OFFLINE_DEPS_DIR, 'pnpm-store');
const MANIFEST_PATH = path.join(OFFLINE_DEPS_DIR, 'manifest.json');
const LOCKFILE_SOURCE = path.join(ROOT_DIR, 'pnpm-lock.yaml');
const LOCKFILE_DEST = path.join(OFFLINE_DEPS_DIR, 'pnpm-lock.yaml');
const NODE_MODULES = path.join(ROOT_DIR, 'node_modules');
const NPMRC_PATH = path.join(ROOT_DIR, '.npmrc');
const NPMRC_BACKUP = path.join(ROOT_DIR, '.npmrc.pack-backup');
// 项目内的临时独立 store
const TEMP_STORE_DIR = path.join(ROOT_DIR, '.pnpm-store');

function validateEnvironment() {
  log('验证环境...', 'blue');

  const pnpmVersion = getPnpmVersion();
  log(`  pnpm 版本: ${pnpmVersion}`, 'blue');

  const pv = pnpmVersion.match(/^(\d+)\./);
  if (!pv || parseInt(pv[1], 10) < 9) {
    throw new Error(`需要 pnpm >= 9.0，当前版本: ${pnpmVersion}`);
  }

  if (!fs.existsSync(LOCKFILE_SOURCE)) {
    throw new Error('找不到 pnpm-lock.yaml，请先运行 pnpm install');
  }

  log('  环境验证通过', 'green');
  return pnpmVersion;
}

function backupNpmrc() {
  if (fs.existsSync(NPMRC_PATH)) {
    fs.copyFileSync(NPMRC_PATH, NPMRC_BACKUP);
    log('  已备份 .npmrc', 'yellow');
    return true;
  }
  return false;
}

function restoreNpmrc(hasBackup) {
  if (hasBackup) {
    fs.copyFileSync(NPMRC_BACKUP, NPMRC_PATH);
    fs.unlinkSync(NPMRC_BACKUP);
    log('  已恢复原始 .npmrc', 'yellow');
  } else if (fs.existsSync(NPMRC_PATH)) {
    const content = fs.readFileSync(NPMRC_PATH, 'utf-8');
    if (content.includes('# temp-isolated-store')) {
      fs.unlinkSync(NPMRC_PATH);
      log('  已删除临时 .npmrc', 'yellow');
    }
  }
}

function setupIsolatedStore() {
  log('配置独立的 .pnpm-store（仅包含当前项目依赖）...', 'blue');

  // 删除旧的独立 store
  if (fs.existsSync(TEMP_STORE_DIR)) {
    log('  清理旧的独立 store...', 'yellow');
    fs.rmSync(TEMP_STORE_DIR, { recursive: true, force: true });
  }

  // 写入临时 .npmrc，指向项目内独立 store
  // 同时包含可选依赖（如原生 binding 模块）
  const storeDirNormalized = TEMP_STORE_DIR.replace(/\\/g, '/');
  const npmrcContent = `# temp-isolated-store
store-dir=${storeDirNormalized}
# 确保可选依赖被包含（原生模块）
optional=true
`;
  fs.writeFileSync(NPMRC_PATH, npmrcContent);
  log(`  store-dir: ${storeDirNormalized}`, 'blue');
}

function cleanInstall() {
  // 删除 node_modules
  if (fs.existsSync(NODE_MODULES)) {
    log('  删除 node_modules...', 'yellow');
    fs.rmSync(NODE_MODULES, { recursive: true, force: true });
  }

  // 安装到独立 store
  // --no-optional=false 确保可选依赖（如原生模块）被安装
  // --no-engine-strict 忽略引擎版本检查（Vite 8 需要 Node 20.19+）
  log('  安装依赖到独立 store（包含可选依赖）...', 'yellow');
  const { execSync } = require('child_process');
  execSync('pnpm install --frozen-lockfile --no-optional=false --no-engine-strict', {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    timeout: 300000,
  });
}

function getStoreVersion(storePath) {
  const basename = path.basename(storePath);
  if (basename.startsWith('v')) return basename;

  if (fs.existsSync(path.join(storePath, 'v10'))) return 'v10';
  if (fs.existsSync(path.join(storePath, 'v3'))) return 'v3';
  return null;
}

function copyFileSafe(src, dest) {
  // 用 read/write 替代 copyFileSync 避免 EPERM
  const content = fs.readFileSync(src);
  fs.writeFileSync(dest, content);
}

function copyDirRecursive(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSafe(srcPath, destPath);
    }
  }
}

function copyStoreToOffline() {
  log('复制 store 到 offline-deps/...', 'blue');

  // 清理输出
  if (fs.existsSync(STORE_OUTPUT_DIR)) {
    fs.rmSync(STORE_OUTPUT_DIR, { recursive: true, force: true });
  }
  ensureDir(STORE_OUTPUT_DIR);

  // 找到实际 store 版本目录
  const storeVersion = getStoreVersion(TEMP_STORE_DIR);
  if (!storeVersion) {
    log('  无法检测 store 版本，复制整个 store...', 'yellow');
    copyDirRecursive(TEMP_STORE_DIR, STORE_OUTPUT_DIR);
    return 'unknown';
  }

  log(`  检测到 store 版本: ${storeVersion}`, 'blue');

  const basename = path.basename(TEMP_STORE_DIR);
  const versionDir = basename === storeVersion
    ? TEMP_STORE_DIR
    : path.join(TEMP_STORE_DIR, storeVersion);

  // files
  const filesDir = path.join(versionDir, 'files');
  if (fs.existsSync(filesDir)) {
    const dest = path.join(STORE_OUTPUT_DIR, storeVersion, 'files');
    ensureDir(path.join(STORE_OUTPUT_DIR, storeVersion));
    log('  复制 files...', 'blue');
    copyDirRecursive(filesDir, dest);
  }

  // index（也是目录结构）
  const indexDir = path.join(versionDir, 'index');
  if (fs.existsSync(indexDir)) {
    const dest = path.join(STORE_OUTPUT_DIR, storeVersion, 'index');
    ensureDir(path.join(STORE_OUTPUT_DIR, storeVersion));
    log('  复制 index...', 'blue');
    copyDirRecursive(indexDir, dest);
  }

  // projects
  const projectsDir = path.join(versionDir, 'projects');
  if (fs.existsSync(projectsDir)) {
    const dest = path.join(STORE_OUTPUT_DIR, storeVersion, 'projects');
    ensureDir(path.join(STORE_OUTPUT_DIR, storeVersion));
    log('  复制 projects...', 'blue');
    copyDirRecursive(projectsDir, dest);
  }

  return storeVersion;
}

function copyLockfile() {
  log('复制 pnpm-lock.yaml...', 'blue');
  fs.copyFileSync(LOCKFILE_SOURCE, LOCKFILE_DEST);
}

function cleanupTempStore() {
  if (fs.existsSync(TEMP_STORE_DIR)) {
    log('清理临时独立 store...', 'yellow');
    fs.rmSync(TEMP_STORE_DIR, { recursive: true, force: true });
  }
}

function countStoreFiles(storeVersion) {
  if (!storeVersion || storeVersion === 'unknown') return 0;
  const filesDir = path.join(STORE_OUTPUT_DIR, storeVersion, 'files');
  if (!fs.existsSync(filesDir)) return 0;

  let count = 0;
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else count++;
    }
  }
  walk(filesDir);
  return count;
}

function generateManifest(storeVersion) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    nodeVersion: getNodeVersion(),
    pnpmVersion: getPnpmVersion(),
    platform: getPlatform(),
    storeVersion,
    packageCount: countStoreFiles(storeVersion),
    totalSize: getDirectorySize(STORE_OUTPUT_DIR),
  };

  writeManifest(manifest, MANIFEST_PATH);
  log('  已生成 manifest.json', 'green');
  return manifest;
}

async function main() {
  let hasBackup = false;

  try {
    log('=== tab_services 离线依赖打包 (独立 store) ===', 'blue');
    log('', 'reset');

    // 1. 验证环境
    validateEnvironment();

    // 2. 备份 .npmrc
    hasBackup = backupNpmrc();

    // 3. 配置独立 store + 重新安装
    setupIsolatedStore();
    cleanInstall();

    // 4. 复制 store 到 offline-deps/
    const storeVersion = copyStoreToOffline();

    // 5. 复制 lockfile
    copyLockfile();

    // 6. 生成 manifest
    const manifest = generateManifest(storeVersion);

    // 7. 输出摘要
    log('', 'reset');
    log('=== 打包完成 ===', 'green');
    log('', 'reset');
    log(`  Node.js:     ${manifest.nodeVersion}`, 'blue');
    log(`  pnpm:        ${manifest.pnpmVersion}`, 'blue');
    log(`  Store 版本:  ${manifest.storeVersion}`, 'blue');
    log(`  平台:        ${manifest.platform}`, 'blue');
    log(`  文件数量:    ${manifest.packageCount}`, 'blue');
    log(`  Store 大小:  ${formatBytes(manifest.totalSize)}`, 'blue');
    log('', 'reset');
    log(`离线包位置: ${OFFLINE_DEPS_DIR}`, 'blue');
    log('', 'reset');
    log('使用方法:', 'blue');
    log('  1. 将整个 offline-deps/ 目录复制到目标机器的 tab_services/offline-deps/', 'reset');
    log('  2. 运行: pnpm run offline:install', 'reset');
  } catch (error) {
    log(`打包失败: ${error.message}`, 'red');
    process.exit(1);
  } finally {
    // 恢复 .npmrc
    restoreNpmrc(hasBackup);
    // 清理临时 store
    cleanupTempStore();
  }
}

main();
