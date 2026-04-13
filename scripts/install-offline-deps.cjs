#!/usr/bin/env node

/**
 * 从离线 store 安装 odc-client 依赖
 *
 * 原理：
 *   1. 使用 --store-dir 参数指定离线 store 目录
 *   2. 使用 offline-deps/pnpm-lock.yaml 作为 lockfile
 *   3. 执行 pnpm install --offline --frozen-lockfile
 *
 * 用法: pnpm run offline:install
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  log,
  getPnpmVersion,
  getNodeVersion,
  getPlatform,
  readManifest,
  isVersionCompatible,
  formatBytes,
} = require(path.join(__dirname, 'lib', 'store-utils.cjs'));

const ROOT_DIR = path.resolve(__dirname, '..');
const OFFLINE_DEPS_DIR = path.join(ROOT_DIR, 'offline-deps');
const STORE_DIR = path.join(OFFLINE_DEPS_DIR, 'pnpm-store');
const MANIFEST_PATH = path.join(OFFLINE_DEPS_DIR, 'manifest.json');
const LOCKFILE_SOURCE = path.join(OFFLINE_DEPS_DIR, 'pnpm-lock.yaml');
const LOCKFILE_DEST = path.join(ROOT_DIR, 'pnpm-lock.yaml');
const NODE_MODULES = path.join(ROOT_DIR, 'node_modules');

function validateOfflinePackage() {
  log('验证离线包...', 'blue');

  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error('找不到 offline-deps/manifest.json，请先运行打包脚本');
  }

  if (!fs.existsSync(STORE_DIR)) {
    throw new Error('找不到 offline-deps/pnpm-store/ 目录');
  }

  // 检查 store 目录是否非空（兼容 v3 和 v10）
  const storeVersions = ['v10', 'v3'];
  let storeFound = false;
  for (const ver of storeVersions) {
    const filesDir = path.join(STORE_DIR, ver, 'files');
    if (fs.existsSync(filesDir)) {
      const filesCount = fs.readdirSync(filesDir).length;
      if (filesCount > 0) {
        storeFound = true;
        break;
      }
    }
  }
  if (!storeFound) {
    throw new Error('pnpm store 内容不完整或为空');
  }

  if (!fs.existsSync(LOCKFILE_SOURCE)) {
    throw new Error('找不到 offline-deps/pnpm-lock.yaml');
  }

  const manifest = readManifest(MANIFEST_PATH);
  log(`  离线包生成时间: ${manifest.generatedAt}`, 'blue');
  log(`  包含 Store 大小: ${formatBytes(manifest.totalSize || 0)}`, 'blue');

  return manifest;
}

function checkEnvironment(manifest) {
  log('检查环境兼容性...', 'blue');

  const pnpmVersion = getPnpmVersion();
  log(`  pnpm 版本: ${pnpmVersion}`, 'blue');

  const nodeVersion = getNodeVersion();
  log(`  Node.js 版本: ${nodeVersion}`, 'blue');

  const currentPlatform = getPlatform();
  log(`  当前平台: ${currentPlatform}`, 'blue');

  if (manifest.platform && manifest.platform !== currentPlatform) {
    log(`  警告: 平台不匹配 (打包: ${manifest.platform}, 当前: ${currentPlatform})`, 'yellow');
    log(`  平台相关的原生模块可能无法正常工作`, 'yellow');
  }

  if (manifest.nodeVersion) {
    if (!isVersionCompatible(nodeVersion, manifest.nodeVersion)) {
      log(`  警告: Node.js 主版本不匹配 (打包: ${manifest.nodeVersion}, 当前: ${nodeVersion})`, 'yellow');
    }
  }

  if (manifest.pnpmVersion) {
    const current = pnpmVersion.match(/^(\d+)/);
    const required = manifest.pnpmVersion.match(/^(\d+)/);
    if (current && required && current[1] !== required[1]) {
      log(`  警告: pnpm 主版本不匹配 (打包: ${manifest.pnpmVersion}, 当前: ${pnpmVersion})`, 'yellow');
      log(`  建议使用相同主版本的 pnpm 以确保 store 兼容性`, 'yellow');
    }
  }
}

function ensureLockfile() {
  if (!fs.existsSync(LOCKFILE_DEST)) {
    log('从离线包复制 pnpm-lock.yaml...', 'blue');
    fs.copyFileSync(LOCKFILE_SOURCE, LOCKFILE_DEST);
  } else {
    const srcContent = fs.readFileSync(LOCKFILE_SOURCE, 'utf-8');
    const destContent = fs.readFileSync(LOCKFILE_DEST, 'utf-8');
    if (srcContent !== destContent) {
      log('  警告: 项目 lockfile 与离线包 lockfile 不一致', 'yellow');
      log('  使用离线包中的 lockfile 以确保依赖版本匹配', 'yellow');
      fs.copyFileSync(LOCKFILE_SOURCE, LOCKFILE_DEST);
    }
  }
}

function cleanNodeModules() {
  if (fs.existsSync(NODE_MODULES)) {
    log('清理现有 node_modules...', 'blue');
    fs.rmSync(NODE_MODULES, { recursive: true, force: true });
  }
}

function runOfflineInstall() {
  log('执行离线安装...', 'blue');
  log('', 'reset');

  const storeDirNormalized = STORE_DIR.replace(/\\/g, '/');
  const cmd = `pnpm install --offline --frozen-lockfile --store-dir "${storeDirNormalized}"`;

  log(`  命令: ${cmd}`, 'blue');
  log('', 'reset');

  execSync(cmd, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    timeout: 600000,
  });
}

function verifyInstall() {
  log('', 'reset');
  log('验证安装...', 'blue');

  if (!fs.existsSync(NODE_MODULES)) {
    throw new Error('node_modules 未创建');
  }

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8')
  );
  const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  let missing = 0;

  for (const name of Object.keys(allDeps)) {
    const depPath = path.join(NODE_MODULES, name);
    if (!fs.existsSync(depPath)) {
      log(`  缺失: ${name}`, 'red');
      missing++;
    }
  }

  if (missing > 0) {
    throw new Error(`有 ${missing} 个直接依赖未安装`);
  }

  log(`  所有 ${Object.keys(allDeps).length} 个直接依赖已安装`, 'green');
}

async function main() {
  try {
    log('=== odc-client 离线依赖安装 ===', 'blue');
    log('', 'reset');

    // 1. 验证离线包
    const manifest = validateOfflinePackage();

    // 2. 检查环境
    checkEnvironment(manifest);

    // 3. 确保 lockfile 存在
    ensureLockfile();

    // 4. 清理旧安装
    cleanNodeModules();

    // 5. 使用 --store-dir 执行离线安装
    runOfflineInstall();

    // 6. 验证安装
    verifyInstall();

    log('', 'reset');
    log('=== 离线安装完成 ===', 'green');
  } catch (error) {
    log('', 'reset');
    log(`安装失败: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();
