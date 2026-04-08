# tab_services 离线依赖打包与安装指南

## 概述

本文档描述 `tab_services` 项目如何使用 pnpm 实现依赖的离线打包和安装。该方案仅打包 `tab_services` 项目所需的依赖，不包含全局或其他项目的依赖。

## 核心原理

### pnpm Store 机制

pnpm 使用内容寻址存储（content-addressed storage）来管理依赖：

1. **全局共享存储**：默认位于 `~/.pnpm-store`，所有项目共享
2. **内容寻址**：相同版本的包在 store 中只存储一份
3. **硬链接**：`node_modules` 中的文件是 store 文件的硬链接引用

### 离线打包方案

```
打包机器 (联网)                         目标机器 (离线)
┌─────────────────────┐                ┌─────────────────────┐
│  tab_services/      │                │  tab_services/      │
│  ├─ .pnpm-store/    │─复制──→        │  ├─ offline-deps/   │
│  │   └─ v10/        │                │  │   ├─ pnpm-store/ │
│  │       ├─ files/  │                │  │   ├─ manifest.json│
│  │       ├─ index/  │                │  │   └─ pnpm-lock.yaml│
│  │       └─ projects│                │  └─ node_modules/   │
│  └─ pnpm-lock.yaml  │                └─────────────────────┘
└─────────────────────┘
```

**关键设计**：

1. **独立 Store**：在项目内创建临时的 `.pnpm-store`，确保只包含当前项目依赖
2. **store-dir 参数**：使用 `--store-dir` 指定本地 store，避免修改全局 `.npmrc`
3. **offline 模式**：使用 `pnpm install --offline` 从本地 store 安装

## 目录结构

```
tab_services/
├── docs/
│   └── offline-dependencies.md      # 本文档
├── scripts/
│   ├── lib/
│   │   └── store-utils.cjs           # 共享工具函数
│   ├── pack-offline-deps.cjs         # 打包脚本
│   ├── install-offline-deps.cjs      # 安装脚本
│   └── verify-offline-deps.cjs       # 验证脚本
├── offline-deps/                     # 离线包输出目录
│   ├── pnpm-store/                   # pnpm store 内容
│   │   └─ v10/                       # store 版本目录
│   │       ├─ files/                 # 实际的包文件
│   │       ├─ index/                 # 包索引
│   │       └─ projects/              # 项目引用
│   ├── pnpm-lock.yaml                # 锁定文件
│   └── manifest.json                 # 打包元数据
├── package.json
└── pnpm-lock.yaml
```

## 脚本说明

### 1. 工具函数 (`scripts/lib/store-utils.cjs`)

提供共享的工具函数：

| 函数                                    | 说明               |
| --------------------------------------- | ------------------ |
| `log(message, color)`                   | 彩色日志输出       |
| `ensureDir(dir)`                        | 确保目录存在       |
| `cleanDir(dir)`                         | 清理并重建目录     |
| `runCommand(cmd, options)`              | 执行 shell 命令    |
| `getPnpmVersion()`                      | 获取 pnpm 版本     |
| `getNodeVersion()`                      | 获取 Node.js 版本  |
| `getPlatform()`                         | 获取当前平台       |
| `parseVersion(versionStr)`              | 解析版本号         |
| `isVersionCompatible(actual, required)` | 检查版本兼容性     |
| `writeManifest(data, filePath)`         | 写入 manifest.json |
| `readManifest(filePath)`                | 读取 manifest.json |
| `getDirectorySize(dir)`                 | 计算目录大小       |
| `formatBytes(bytes)`                    | 格式化字节数       |

### 2. 打包脚本 (`scripts/pack-offline-deps.cjs`)

**命令**：`pnpm run offline:pack`

**工作流程**：

```
1. 验证环境
   ├── 检查 pnpm >= 9.0
   └── 检查 pnpm-lock.yaml 存在

2. 备份 .npmrc
   └── 保存到 .npmrc.pack-backup

3. 配置独立 Store
   ├── 删除旧的 .pnpm-store
   └── 写入临时 .npmrc 指向项目内 store

4. 清理安装
   ├── 删除 node_modules
   └── 运行 pnpm install --frozen-lockfile --no-optional=false --no-engine-strict

5. 复制 Store
   ├── 创建 offline-deps/pnpm-store/
   ├── 复制 files/ 目录
   ├── 复制 index/ 目录
   └── 复制 projects/ 目录

6. 复制 lockfile
   └── 复制 pnpm-lock.yaml 到 offline-deps/

7. 生成 manifest.json
   ├── 记录打包时间
   ├── 记录 Node/pnpm 版本
   ├── 记录平台信息
   ├── 计算文件数量
   └── 计算总大小

8. 清理
   ├── 恢复原始 .npmrc
   └── 删除临时 .pnpm-store
```

**关键参数**：

- `--frozen-lockfile`：严格按照 lockfile 安装
- `--no-optional=false`：包含可选依赖（如原生模块）
- `--no-engine-strict`：忽略引擎版本检查（解决 Node 20.14 与 Vite 8 的兼容问题）

### 3. 安装脚本 (`scripts/install-offline-deps.cjs`)

**命令**：`pnpm run offline:install`

**工作流程**：

```
1. 验证离线包
   ├── 检查 manifest.json 存在
   ├── 检查 pnpm-store/ 存在
   ├── 验证 store 内容非空
   └── 检查 pnpm-lock.yaml 存在

2. 检查环境兼容性
   ├── 显示当前 pnpm 版本
   ├── 显示当前 Node 版本
   ├── 警告平台不匹配
   ├── 警告 Node 版本不匹配
   └── 警告 pnpm 版本不匹配

3. 确保 lockfile
   └── 复制 offline-deps/pnpm-lock.yaml 到项目根目录

4. 清理旧安装
   └── 删除现有 node_modules/

5. 执行离线安装
   └── pnpm install --offline --frozen-lockfile --store-dir "offline-deps/pnpm-store"

6. 验证安装
   ├── 检查 node_modules 存在
   └── 检查所有直接依赖已安装
```

### 4. 验证脚本 (`scripts/verify-offline-deps.cjs`)

**命令**：`pnpm run offline:verify`

**检查项**：

- `node_modules` 存在性
- `node_modules/.pnpm` 存在性
- 所有直接依赖是否已安装
- 显示离线包的打包信息

## 使用方法

### 打包（联网环境）

```bash
# 1. 确保已安装所有依赖
pnpm install

# 2. 执行打包
pnpm run offline:pack

# 3. 打包完成后，offline-deps/ 目录包含：
#    - pnpm-store/    (约 141.8 MB)
#    - pnpm-lock.yaml
#    - manifest.json
```

**打包输出示例**：

```
=== tab_services 离线依赖打包 (独立 store) ===

验证环境...
  pnpm 版本: 10.14.0
  环境验证通过
  已备份 .npmrc

配置独立的 .pnpm-store（仅包含当前项目依赖）...
  store-dir: E:/Projects/Web/odc-client/tab_services/.pnpm-store

  安装依赖到独立 store（包含可选依赖）...
... (pnpm install 输出) ...

复制 store 到 offline-deps/...
  检测到 store 版本: v10
  复制 files...
  复制 index...
  复制 projects...

复制 pnpm-lock.yaml...
  已生成 manifest.json

=== 打包完成 ===

  Node.js:     v20.24.0
  pnpm:        10.14.0
  Store 版本:  v10
  平台:        win32-x64
  文件数量:    79
  Store 大小:  141.8 MB

离线包位置: E:/Projects/Web/odc-client/tab_services/offline-deps

使用方法:
  1. 将整个 offline-deps/ 目录复制到目标机器的 tab_services/offline-deps/
  2. 运行: pnpm run offline:install
```

### 安装（离线环境）

```bash
# 1. 确保 offline-deps/ 目录已存在
#    - 包含 pnpm-store/
#    - 包含 manifest.json
#    - 包含 pnpm-lock.yaml

# 2. 执行离线安装
pnpm run offline:install

# 3. 验证安装
pnpm run offline:verify

# 4. 运行项目
pnpm run dev
```

**安装输出示例**：

```
=== tab_services 离线依赖安装 ===

验证离线包...
  离线包生成时间: 2026-04-08T14:30:00.000Z
  包含 Store 大小: 141.8 MB

检查环境兼容性...
  pnpm 版本: 10.14.0
  Node.js 版本: v20.24.0
  当前平台: win32-x64

从离线包复制 pnpm-lock.yaml...
清理现有 node_modules...
执行离线安装...
  命令: pnpm install --offline --frozen-lockfile --store-dir "offline-deps/pnpm-store"
... (pnpm install 输出) ...

验证安装...
  所有 9 个直接依赖已安装

=== 离线安装完成 ===
```

## manifest.json 结构

```json
{
  "generatedAt": "2026-04-08T14:30:00.000Z",
  "nodeVersion": "v20.24.0",
  "pnpmVersion": "10.14.0",
  "platform": "win32-x64",
  "storeVersion": "v10",
  "packageCount": 79,
  "totalSize": 148760000
}
```

| 字段           | 说明                     |
| -------------- | ------------------------ |
| `generatedAt`  | 打包时间 (ISO 8601)      |
| `nodeVersion`  | 打包时的 Node.js 版本    |
| `pnpmVersion`  | 打包时的 pnpm 版本       |
| `platform`     | 打包时的操作系统平台     |
| `storeVersion` | pnpm store 版本 (v3/v10) |
| `packageCount` | store 中的文件数量       |
| `totalSize`    | store 总大小（字节）     |

## 环境要求

### 打包环境

| 要求    | 版本                  |
| ------- | --------------------- |
| Node.js | v20.24.0              |
| pnpm    | >= 9.0                |
| 网络    | 需要访问 npm registry |

### 安装环境

| 要求    | 版本                          |
| ------- | ----------------------------- |
| Node.js | v20.24.0 (建议与打包环境一致) |
| pnpm    | >= 9.0 (建议主版本一致)       |
| 网络    | 无需联网                      |
| 平台    | 应与打包环境一致（原生模块）  |

## 注意事项

### 1. 平台兼容性

- **原生模块**（如 `@rolldown/binding-win32-x64-msvc`）是平台相关的
- Windows 打包的 store 无法直接在 Linux/macOS 使用
- 如需跨平台，需分别打包

### 2. Node.js 版本

- `.nvmrc` 指定 `v20.24.0`
- 使用 `nvm use` 或 `fnm use` 切换到正确版本
- 版本不匹配可能导致原生模块加载失败

### 3. pnpm 版本

- 打包和安装使用相同主版本的 pnpm
- store 格式可能在主版本间变化

### 4. 可选依赖

- 使用 `--no-optional=false` 包含所有可选依赖
- 使用 `--no-engine-strict` 绕过引擎版本检查

### 5. Store 隔离

- 使用项目内 `.pnpm-store` 避免打包全局依赖
- 安装时通过 `--store-dir` 指定本地 store

## 故障排查

### 问题 1：`Cannot find module '@rolldown/binding-win32-x64-msvc'`

**原因**：原生 binding 模块未被包含

**解决**：

1. 确保打包时使用 `--no-optional=false`
2. 确保使用 `--no-engine-strict` 绕过引擎检查
3. 重新打包

### 问题 2：`EPERM: operation not permitted`

**原因**：Windows 文件权限问题

**解决**：脚本已使用 `readFileSync` + `writeFileSync` 替代 `copyFileSync`

### 问题 3：pnpm store 版本检测失败

**原因**：pnpm v10 store 结构变化

**解决**：脚本已兼容 v3 和 v10 store 结构

### 问题 4：离线安装时提示下载包

**原因**：store 中缺少对应包

**解决**：

1. 检查 `manifest.json` 中的 `packageCount`
2. 验证 `offline-deps/pnpm-store/v10/files/` 非空
3. 重新打包

## package.json 脚本

```json
{
  "scripts": {
    "offline:pack": "node scripts/pack-offline-deps.cjs",
    "offline:install": "node scripts/install-offline-deps.cjs",
    "offline:verify": "node scripts/verify-offline-deps.cjs"
  }
}
```

## 更新日志

| 日期       | 变更                                         |
| ---------- | -------------------------------------------- |
| 2026-04-08 | 初始版本，支持 pnpm v10，添加独立 store 隔离 |
