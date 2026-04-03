#!/usr/bin/env node

/**
 * 打包 tab_services 的所有 pnpm 依赖为离线 tarball
 *
 * 用法: pnpm run offline:pack
 * 或者: node scripts/pack-offline-deps.cjs
 *
 * 生成的离线包将保存在 tab_services/offline-deps/ 目录
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

const ROOT_DIR = path.resolve(__dirname, '..');
const OFFLINE_DEPS_DIR = path.join(ROOT_DIR, 'offline-deps');
const TARBALLS_DIR = path.join(OFFLINE_DEPS_DIR, 'tarballs');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  ensureDir(dir);
}

// 获取 pnpm store 中的所有依赖
function getStoreDependencies() {
  log('正在获取 pnpm store 中的所有依赖...', 'blue');

  // 直接使用扫描方式（pnpm 的特殊存储结构）
  return getDependenciesByScanning();
}

// 扫描 node_modules 和 .pnpm 目录
function getDependenciesByScanning() {
  const allDeps = new Map();

  function scanPnpmStore() {
    const nodeModulesDir = path.join(ROOT_DIR, 'node_modules');
    const pnpmDir = path.join(nodeModulesDir, '.pnpm');

    if (!fs.existsSync(pnpmDir)) {
      return;
    }

    // 扫描 .pnpm 目录中的所有包
    const entries = fs.readdirSync(pnpmDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // pnpm 的目录格式通常是: name@version 或 name@version_hash
      // 例如: @ant-design+icons-vue@7.0.1_vue@3.5.31_typescript@5.9.3_
      // 需要提取实际版本号
      let match = entry.name.match(/^(.+?)@(\d+\.\d+\.\d+[^/_]*)/);
      if (!match) {
        // 尝试另一种格式: @scope+name@version
        match = entry.name.match(/^(.+?)@(\d+\.\d+\.\d+)/);
      }

      if (match) {
        let name = match[1].replace(/\+/g, '/'); // + 替换回 /
        const version = match[2];
        const key = `${name}@${version}`;

        if (!allDeps.has(key)) {
          // 检查是否有 package.json
          const pkgPath = path.join(pnpmDir, entry.name, 'node_modules', name, 'package.json');
          if (fs.existsSync(pkgPath)) {
            try {
              const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
              allDeps.set(key, {
                name,
                version: pkg.version || version,
                pnpmPath: entry.name,
              });
            } catch (e) {
              // 忽略解析失败的
            }
          }
        }
      }
    }
  }

  // 扫描顶层 node_modules
  function scanTopLevel() {
    const nodeModulesDir = path.join(ROOT_DIR, 'node_modules');

    if (!fs.existsSync(nodeModulesDir)) {
      return;
    }

    const entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== '.pnpm' && !entry.name.startsWith('.')) {
        const pkgPath = path.join(nodeModulesDir, entry.name, 'package.json');

        if (fs.existsSync(pkgPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            if (pkg.name && pkg.version) {
              const key = `${pkg.name}@${pkg.version}`;
              if (!allDeps.has(key)) {
                allDeps.set(key, {
                  name: pkg.name,
                  version: pkg.version,
                });
              }
            }
          } catch (e) {
            // 忽略
          }
        }
      }
    }
  }

  scanPnpmStore();
  scanTopLevel();

  log(`通过扫描找到 ${allDeps.size} 个依赖`, 'green');
  return Array.from(allDeps.values());
}

// 从 npm registry 下载 tarball
function downloadFromRegistry(name, version) {
  return new Promise((resolve, reject) => {
    const scope = name.startsWith('@') ? name.split('/')[0] : '';
    const packageName = scope ? name.substring(scope.length + 1) : name;
    const registryUrl = `https://registry.npmjs.org/${name.replace('/', '%2F')}`;

    log(`  正在从 registry 下载: ${name}`, 'cyan');

    https.get(registryUrl, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const metadata = JSON.parse(data);
          const versionData = metadata.versions[version];

          if (!versionData) {
            reject(new Error(`版本 ${version} 不存在于 registry`));
            return;
          }

          const tarballUrl = versionData.dist.tarball;
          resolve(tarballUrl);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// 下载 tarball 文件
function downloadTarball(url, targetPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const file = fs.createWriteStream(targetPath);

    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败: ${res.statusCode}`));
        return;
      }

      res.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(targetPath, () => {});
      reject(err);
    });
  });
}

// 打包单个依赖
async function packDependency(dep) {
  const { name, version, pnpmPath } = dep;

  try {
    const nodeModulesDir = path.join(ROOT_DIR, 'node_modules');
    const pnpmDir = path.join(nodeModulesDir, '.pnpm');

    if (pnpmPath) {
      // 使用已知的 pnpm 路径
      const depPath = path.join(pnpmDir, pnpmPath, 'node_modules', name);
      return await packFromPath(depPath, name, version);
    } else {
      // 尝试在顶层 node_modules 中查找
      const depPath = path.join(nodeModulesDir, name);
      if (fs.existsSync(depPath)) {
        return await packFromPath(depPath, name, version);
      }
    }

    return null;
  } catch (error) {
    log(`  ✗ 打包失败: ${name}@${version} - ${error.message}`, 'yellow');
    return null;
  }
}

async function packFromPath(depPath, name, version) {
  if (!fs.existsSync(depPath)) {
    return null;
  }

  log(`正在打包: ${name}@${version}`, 'blue');

  // 首先尝试使用 npm pack --ignore-scripts
  let tarballName = null;
  const beforeFiles = new Set();

  if (fs.existsSync(depPath)) {
    const entries = fs.readdirSync(depPath);
    for (const entry of entries) {
      if (entry.endsWith('.tgz')) {
        beforeFiles.add(entry);
      }
    }
  }

  // 尝试方法1: npm pack --ignore-scripts
  try {
    execSync('npm pack --ignore-scripts', {
      cwd: depPath,
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 60000,
    });

    const afterFiles = fs.readdirSync(depPath).filter(f => f.endsWith('.tgz'));
    const newTarball = afterFiles.find(f => !beforeFiles.has(f));

    if (newTarball) {
      tarballName = newTarball;
    }
  } catch (e) {
    // 忽略错误，尝试其他方法
  }

  // 如果方法1失败，尝试方法2: 直接从 registry 下载
  if (!tarballName) {
    try {
      const tarballUrl = await downloadFromRegistry(name, version);
      // 从 URL 提取文件名
      tarballName = path.basename(tarballUrl);

      const targetPath = path.join(TARBALLS_DIR, tarballName);

      // 如果已存在且文件大小合理，跳过
      if (fs.existsSync(targetPath)) {
        const stat = fs.statSync(targetPath);
        if (stat.size > 100) {
          fs.unlinkSync(path.join(depPath, tarballName));
          log(`  ✓ 已存在: ${tarballName}`, 'green');
          return { name, version, tarball: tarballName };
        }
      }

      await downloadTarball(tarballUrl, targetPath);

      // 清理可能生成的临时文件
      const tempTarball = path.join(depPath, tarballName);
      if (fs.existsSync(tempTarball)) {
        fs.unlinkSync(tempTarball);
      }

      log(`  ✓ 已下载: ${tarballName}`, 'green');
      return { name, version, tarball: tarballName };
    } catch (e) {
      log(`  ⚠ Registry 下载失败: ${e.message}`, 'yellow');
    }
  }

  // 方法3: 尝试普通 npm pack
  if (!tarballName) {
    try {
      execSync('npm pack', {
        cwd: depPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
      });

      const afterFiles = fs.readdirSync(depPath).filter(f => f.endsWith('.tgz'));
      const newTarball = afterFiles.find(f => !beforeFiles.has(f));

      if (newTarball) {
        tarballName = newTarball;
      }
    } catch (e) {
      // 忽略
    }
  }

  if (tarballName) {
    const sourceTarball = path.join(depPath, tarballName);
    const targetPath = path.join(TARBALLS_DIR, tarballName);

    // 如果目标已存在且文件大小相同，跳过
    if (fs.existsSync(targetPath)) {
      const statSource = fs.statSync(sourceTarball);
      const statTarget = fs.statSync(targetPath);
      if (statSource.size === statTarget.size) {
        fs.unlinkSync(sourceTarball);
        log(`  ✓ 已存在: ${tarballName}`, 'green');
        return { name, version, tarball: tarballName };
      }
    }

    // 复制 tarball
    fs.copyFileSync(sourceTarball, targetPath);
    fs.unlinkSync(sourceTarball);

    log(`  ✓ 已打包: ${tarballName}`, 'green');
    return { name, version, tarball: tarballName };
  }

  log(`  ✗ 打包失败: ${name}`, 'yellow');
  return null;
}

// 生成依赖清单
function generateManifest(packedDeps) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    pnpmVersion: getPnpmVersion(),
    dependencies: packedDeps,
    packageJson: require(path.join(ROOT_DIR, 'package.json')),
  };

  fs.writeFileSync(
    path.join(OFFLINE_DEPS_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  log('已生成依赖清单: manifest.json', 'green');
}

function getPnpmVersion() {
  try {
    const output = execSync('pnpm --version', { encoding: 'utf-8' });
    return output.trim();
  } catch {
    return 'unknown';
  }
}

// 生成离线安装脚本
function generateInstallScript() {
  const installScript = `#!/usr/bin/env node

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
  reset: '\\x1b[0m',
  green: '\\x1b[32m',
  yellow: '\\x1b[33m',
  blue: '\\x1b[36m',
  red: '\\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(\`\${colors[color]}\${message}\${colors.reset}\`);
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
    log(\`打包时 Node.js 版本: v\${requiredVersion}\`, 'blue');
    log(\`当前 Node.js 版本: v\${currentVersion}\`, 'blue');

    const majorRequired = requiredVersion.split('.')[0];
    const majorCurrent = currentVersion.split('.')[0];

    if (majorRequired !== majorCurrent) {
      log(\`警告: Node.js 主版本不匹配 (期望: \${majorRequired}.x, 当前: \${majorCurrent}.x)\`, 'yellow');
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
    const tarballsPath = TARBALLS_DIR.replace(/\\\\/g, '/');
    const npmrcContent = \`registry=file://\${tarballsPath}
strict-peer-dependencies=false
\`;
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
    log(\`找到 \${manifest.dependencies.length} 个依赖包\`, 'green');
    log('', 'reset');

    // 尝试方法1，失败则使用方法2
    try {
      await installWithLocalRegistry(manifest);
    } catch (error) {
      log(\`本地仓库方式失败: \${error.message}\`, 'yellow');
      log('尝试直接安装方式...', 'yellow');
      await installFromTarballs(manifest);
    }

    log('', 'reset');
    log('=== 安装完成 ===', 'green');
  } catch (error) {
    log('', 'reset');
    log(\`安装失败: \${error.message}\`, 'red');
    process.exit(1);
  }
}

main();
`;

  fs.writeFileSync(
    path.join(ROOT_DIR, 'scripts', 'install-offline-deps.cjs'),
    installScript
  );

  log('已生成离线安装脚本: scripts/install-offline-deps.cjs', 'green');
}

// 主函数
async function main() {
  log('=== tab_services 离线依赖打包 ===', 'blue');
  log('', 'reset');

  // 清理并创建输出目录
  log('正在准备输出目录...', 'blue');
  cleanDir(TARBALLS_DIR);
  ensureDir(OFFLINE_DEPS_DIR);

  // 获取所有依赖
  const allDeps = getStoreDependencies();
  log('', 'reset');

  // 打包所有依赖
  log('开始打包依赖...', 'blue');
  const packedDeps = [];

  for (const dep of allDeps) {
    const result = await packDependency(dep);
    if (result) {
      packedDeps.push(result);
    }
  }

  log('', 'reset');
  log(`成功打包 ${packedDeps.length} 个依赖`, 'green');
  log('', 'reset');

  // 生成清单和安装脚本
  generateManifest(packedDeps);
  generateInstallScript();

  log('', 'reset');
  log('=== 打包完成 ===', 'green');
  log('', 'reset');
  log('离线包位置: ' + OFFLINE_DEPS_DIR, 'blue');
  log('使用方法:', 'blue');
  log('  1. 将 offline-deps/ 和 scripts/ 目录复制到目标机器的 tab_services/ 目录', 'reset');
  log('  2. 运行: pnpm run offline:install', 'reset');
}

main().catch((error) => {
  log('错误: ' + error.message, 'red');
  process.exit(1);
});
