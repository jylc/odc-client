#!/usr/bin/env node

/**
 * 验证离线安装是否成功
 *
 * 用法: pnpm run offline:verify
 */

const fs = require('fs');
const path = require('path');
const {
  log,
  getPnpmVersion,
  getNodeVersion,
  readManifest,
  formatBytes,
} = require(path.join(__dirname, 'lib', 'store-utils.cjs'));

const ROOT_DIR = path.resolve(__dirname, '..');
const NODE_MODULES = path.join(ROOT_DIR, 'node_modules');
const PACKAGE_JSON = path.join(ROOT_DIR, 'package.json');
const MANIFEST_PATH = path.join(ROOT_DIR, 'offline-deps', 'manifest.json');

function checkNodeModules() {
  log('检查 node_modules...', 'blue');

  if (!fs.existsSync(NODE_MODULES)) {
    log('  node_modules 不存在', 'red');
    return false;
  }

  const pnpmDir = path.join(NODE_MODULES, '.pnpm');
  if (!fs.existsSync(pnpmDir)) {
    log('  node_modules/.pnpm 不存在，可能未通过 pnpm 安装', 'red');
    return false;
  }

  const pnpmEntries = fs.readdirSync(pnpmDir, { withFileTypes: true })
    .filter(e => e.isDirectory()).length;
  log(`  .pnpm 中有 ${pnpmEntries} 个包目录`, 'green');

  return true;
}

function checkDirectDependencies() {
  log('检查直接依赖...', 'blue');

  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf-8'));
  const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const total = Object.keys(allDeps).length;
  let installed = 0;
  let missing = [];

  for (const [name, version] of Object.entries(allDeps)) {
    const depPath = path.join(NODE_MODULES, name);
    if (fs.existsSync(depPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(depPath, 'package.json'), 'utf-8'));
        installed++;
      } catch {
        missing.push(name);
      }
    } else {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    log(`  缺失 ${missing.length} 个依赖: ${missing.join(', ')}`, 'red');
    return false;
  }

  log(`  所有 ${total} 个直接依赖已安装`, 'green');
  return true;
}

function checkOfflinePackage() {
  log('检查离线包...', 'blue');

  if (!fs.existsSync(MANIFEST_PATH)) {
    log('  离线包不存在 (offline-deps/manifest.json)', 'yellow');
    return;
  }

  const manifest = readManifest(MANIFEST_PATH);
  log(`  打包时间: ${manifest.generatedAt}`, 'blue');
  log(`  打包 Node: ${manifest.nodeVersion}`, 'blue');
  log(`  打包 pnpm: ${manifest.pnpmVersion}`, 'blue');
  log(`  当前 Node: ${getNodeVersion()}`, 'blue');
  log(`  当前 pnpm: ${getPnpmVersion()}`, 'blue');
}

async function main() {
  log('=== 验证离线安装 ===', 'blue');
  log('', 'reset');

  checkOfflinePackage();
  log('', 'reset');

  const nmOk = checkNodeModules();
  log('', 'reset');

  const depsOk = checkDirectDependencies();
  log('', 'reset');

  if (nmOk && depsOk) {
    log('验证通过: 所有依赖已正确安装', 'green');
  } else {
    log('验证失败: 请检查上述错误', 'red');
    process.exit(1);
  }
}

main().catch((error) => {
  log(`验证失败: ${error.message}`, 'red');
  process.exit(1);
});
