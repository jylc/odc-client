# dbdc:// 协议开发环境测试指南

## 问题描述

在开发环境中测试 `dbdc://` 深度链接时，可能会遇到以下错误：

```
Error launching app
Unable to find Electron app at C:\windows\system32\dbdc:\http\localh...
```

## 原因分析

1. **开发环境 vs 生产环境**：注册表配置通常指向打包后的 exe 文件，但开发环境使用 `electron` 命令启动
2. **参数传递**：`pnpm run dev:client` 不会将深度链接参数传递给 electron 进程
3. **进程管理**：深度链接会尝试启动新实例或激活现有实例

## 解决方案

### 方案 1：手动模拟深度链接（推荐用于开发）

在开发环境中，可以手动传递参数来模拟深度链接：

```bash
# 先正常启动开发环境
pnpm run dev:client

# 在另一个终端，使用环境变量传递参数
# （需要修改代码以支持环境变量读取）
```

### 方案 2：修改启动脚本

修改 `package.json` 中的启动脚本以支持参数传递：

```json
"dev:client-with-url": "concurrently \"npm run dev:tab-service\" \"UMI_ENV=client npm run dev\" \"electron --inspect=5858 -w ./dist/main/main.js %1\""
```

### 方案 3：使用临时文件

1. 点击 `dbdc://` 链接时，将参数写入临时文件
2. 应用启动时读取临时文件
3. 处理完成后删除文件

### 方案 4：开发环境专用注册脚本

使用 `register_dbdc_protocol_dev.bat` 注册开发环境协议。

**注意**：这会覆盖生产环境的注册配置。

## 测试步骤

### 方法 1：使用 electron 直接测试（最简单）

```bash
# 1. 启动开发服务器
pnpm run build-main-dev

# 2. 在另一个终端，直接运行 electron 并传递参数
npx electron --inspect=5858 ./dist/main/main.js "dbdc://http://localhost:8000/#/sqlworkspace?token=test123&env=sit"
```

### 方法 2：使用开发环境注册脚本

```bash
# 1. 以管理员身份运行
.\scripts\register_dbdc_protocol_dev.bat

# 2. 在网页中点击 dbdc:// 链接

# 3. 测试完成后卸载
.\scripts\unregister_dbdc_protocol_dev.bat
```

### 方法 3：查看日志

启动应用后，检查日志文件中的 `process.argv` 输出：

```bash
# 日志位置
%APPDATA%\odc-client\logs\
```

## 调试技巧

1. **添加日志**：在 `main.ts` 中添加 `console.log(process.argv)` 来查看接收到的参数
2. **检查注册表**：运行 `reg query HKEY_CLASSES_ROOT\dbdc` 查看当前注册的命令
3. **手动测试**：在命令行中手动执行注册表中的命令，验证是否能正常工作

## 生产环境测试

对于生产环境（打包后的应用），使用 `register_dbdc_protocol.bat`：

```bash
# 1. 构建应用
pnpm run pack-client:windows

# 2. 安装应用

# 3. 以管理员身份运行注册脚本
.\scripts\register_dbdc_protocol.bat

# 4. 在网页中点击 dbdc:// 链接测试
```

## 常见问题

### Q: 为什么开发环境无法通过深度链接启动？

A: 因为注册表配置的是生产环境路径，且 `pnpm run dev:client` 不会传递参数给 electron。

### Q: 如何在开发环境中测试 token 注入？

A: 使用方法 1，直接用 electron 命令传递包含 token 的 URL。

### Q: 错误信息中的路径是什么？

A: `C:\windows\system32\dbdc:\http\...` 表示 Windows 尝试将 `dbdc://` 解析为文件路径。这通常发生在注册表配置错误或参数格式不正确时。
