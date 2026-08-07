#!/usr/bin/env node

/**
 * pnpm store 离线打包/安装的共享工具函数
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

function runCommand(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: options.timeout || 120000,
    }).trim();
  } catch (error) {
    if (options.allowFail) {
      return null;
    }
    throw new Error(`命令执行失败: ${cmd}\n${error.stderr || error.message}`);
  }
}

function getPnpmVersion() {
  const output = runCommand('pnpm --version');
  return output;
}

function getPnpmStorePath(cwd) {
  const output = runCommand('pnpm store path', { cwd });
  return output;
}

function getNodeVersion() {
  return process.version;
}

function getPlatform() {
  return `${process.platform}-${process.arch}`;
}

function parseVersion(versionStr) {
  const match = versionStr.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    full: `${match[1]}.${match[2]}.${match[3]}`,
  };
}

function isVersionCompatible(actual, required) {
  const a = parseVersion(actual);
  const r = parseVersion(required);
  if (!a || !r) return false;
  // 主版本必须一致，次版本允许不同但建议一致
  return a.major === r.major;
}

function writeManifest(data, filePath) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readManifest(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function getDirectorySize(dir) {
  let totalSize = 0;
  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        totalSize += fs.statSync(fullPath).size;
      }
    }
  }
  if (fs.existsSync(dir)) {
    walk(dir);
  }
  return totalSize;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

module.exports = {
  log,
  ensureDir,
  cleanDir,
  runCommand,
  getPnpmVersion,
  getPnpmStorePath,
  getNodeVersion,
  getPlatform,
  parseVersion,
  isVersionCompatible,
  writeManifest,
  readManifest,
  getDirectorySize,
  formatBytes,
};
