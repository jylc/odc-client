#!/usr/bin/env node

/**
 * 离线安装 tab_services 依赖
 *
 * 用法: pnpm run offline:install
 * 或者: node scripts/install-offline-deps.cjs
 *
 * 此脚本将从 offline-deps/tarballs/ 目录安装所有依赖
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const OFFLINE_DEPS_DIR = path.join(ROOT_DIR, 'offline-deps');
const TARBALLS_DIR = path.join(OFFLINE_DEPS_DIR, 'tarballs');
const MANIFEST_PATH = path.join(OFFLINE_DEPS_DIR, 'manifest.json');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 检查离线包是否存在
function checkOfflinePackage() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    log('错误: 找不到 manifest.json，请先运行打包脚本', 'red');
    process.exit(1);
  }

  if (!fs.existsSync(TARBALLS_DIR)) {
    log('错误: 找不到 tarballs 目录', 'red');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

  // 检查 Node.js 版本
  if (manifest.nodeVersion) {
    const requiredVersion = manifest.nodeVersion.slice(1); // 移除 'v'
    const currentVersion = process.version.slice(1);
    log(`打包时 Node.js 版本: v${requiredVersion}`, 'blue');
    log(`当前 Node.js 版本: v${currentVersion}`, 'blue');

    const majorRequired = requiredVersion.split('.')[0];
    const majorCurrent = currentVersion.split('.')[0];

    if (majorRequired !== majorCurrent) {
      log(`警告: Node.js 主版本不匹配 (期望: ${majorRequired}.x, 当前: ${majorCurrent}.x)`, 'yellow');
    }
  }

  return manifest;
}

// 方法1: 使用本地 npm 仓库安装
function installWithLocalRegistry(manifest) {
  log('使用本地仓库方式安装...', 'blue');

  const npmrcPath = path.join(ROOT_DIR, '.npmrc');
  const backupPath = path.join(ROOT_DIR, '.npmrc.backup');

  // 备份现有的 .npmrc
  if (fs.existsSync(npmrcPath)) {
    fs.copyFileSync(npmrcPath, backupPath);
    log('已备份现有 .npmrc 文件', 'yellow');
  }

  try {
    // 创建本地仓库配置
    const tarballsPath = TARBALLS_DIR.replace(/\\/g, '/');
    const npmrcContent = `registry=file://${tarballsPath}
strict-peer-dependencies=false
`;
    fs.writeFileSync(npmrcPath, npmrcContent);
    log('已配置本地 npm 仓库', 'green');

    // 清理现有的 node_modules
    const nodeModulesPath = path.join(ROOT_DIR, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      log('正在清理现有的 node_modules...', 'yellow');
      fs.rmSync(nodeModulesPath, { recursive: true, force: true });
    }

    // 使用 pnpm 安装
    execSync('pnpm install --no-frozen-lockfile', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });

    log('依赖安装完成!', 'green');
  } finally {
    // 恢复 .npmrc
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, npmrcPath);
      fs.unlinkSync(backupPath);
      log('已恢复原始 .npmrc 文件', 'yellow');
    } else if (fs.existsSync(npmrcPath) && !fs.existsSync(backupPath)) {
      fs.unlinkSync(npmrcPath);
    }
  }
}

// 方法2: 直接从 tarball 安装
function installFromTarballs(manifest) {
  log('使用直接安装方式...', 'blue');

  const packageJsonPath = path.join(ROOT_DIR, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

  // 修改 package.json 使用本地 tarball
  const originalPackageJson = JSON.stringify(packageJson, null, 2);

  function replaceDeps(deps) {
    if (!deps) return deps;

    for (const [name, version] of Object.entries(deps)) {
      const manifestDep = manifest.dependencies.find(d => d.name === name);
      if (manifestDep) {
        const tarballPath = path.join(TARBALLS_DIR, manifestDep.tarball);
        if (fs.existsSync(tarballPath)) {
          deps[name] = tarballPath;
        }
      }
    }
    return deps;
  }

  packageJson.dependencies = replaceDeps(packageJson.dependencies);
  packageJson.devDependencies = replaceDeps(packageJson.devDependencies);

  // 写入修改后的 package.json
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

  try {
    // 清理 node_modules
    const nodeModulesPath = path.join(ROOT_DIR, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      fs.rmSync(nodeModulesPath, { recursive: true, force: true });
    }

    // 安装
    execSync('pnpm install', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });

    log('依赖安装完成!', 'green');
  } finally {
    // 恢复原始 package.json
    fs.writeFileSync(packageJsonPath, originalPackageJson);
    log('已恢复原始 package.json', 'yellow');
  }
}

// 主函数
async function main() {
  try {
    log('=== tab_services 离线依赖安装 ===', 'blue');
    log('', 'reset');

    const manifest = checkOfflinePackage();
    log(`找到 ${manifest.dependencies.length} 个依赖包`, 'green');
    log('', 'reset');

    // 尝试方法1，失败则使用方法2
    try {
      await installWithLocalRegistry(manifest);
    } catch (error) {
      log(`本地仓库方式失败: ${error.message}`, 'yellow');
      log('尝试直接安装方式...', 'yellow');
      await installFromTarballs(manifest);
    }

    log('', 'reset');
    log('=== 安装完成 ===', 'green');
  } catch (error) {
    log('', 'reset');
    log(`安装失败: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();
