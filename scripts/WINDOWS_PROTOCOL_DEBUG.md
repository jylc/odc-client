# Windows 协议唤起调试指南

## 问题说明

在 Windows 下，点击 `dbdc://xxx` 链接会把 URL 当作参数传给可执行文件，需要在主进程里解析 `process.argv` 或 `second-instance` 事件的 `argv`。

## 参数传递流程

### 场景 1：应用首次通过协议启动

```
用户点击链接 → 系统查找注册表 → 执行命令
↓
注册表命令: "electron.exe" "main.js" "dbdc://http://..."
↓
process.argv = ['electron.exe路径', 'main.js路径', 'dbdc://http://...']
```

**处理位置**：`app.on('ready')` 中的 `resolveWinRemoteParams(process.argv)`

### 场景 2：应用已运行，点击协议链接

```
用户点击链接 → 系统查找注册表 → 尝试启动新实例
↓
Electron 检测到单实例锁 → 触发 second-instance 事件
↓
second-instance argv = ['electron.exe路径', 'dbdc://http://...']
```

**处理位置**：`app.on('second-instance')` 中的 `resolveWinRemoteParams(argv)`

## 参数解析逻辑

```typescript
// 在 argv 中查找 dbdc:// 协议 URL
const schemaUrl = argv.find((a) => {
  return isSchemaUrl(a); // 检查是否以 dbdc:// 或 odc:// 开头
});

if (schemaUrl) {
  // 提取协议后的完整 URL
  // dbdc://http://localhost:8000/#/sqlworkspace?token=xxx
  // → http://localhost:8000/#/sqlworkspace?token=xxx
  const fullUrl = getUrlFromSchema(schemaUrl);
  
  // 解析 URL 参数
  const params = parseUrlParams(fullUrl);
  // { token: 'xxx', env: 'sit', pathname: '/#/', hash: '#/...' }
  
  // 存储参数供后续使用
  PathnameStore.setTokenParams(params.token, params.env);
  PathnameStore.setPathname(urlObj.pathname);
  PathnameStore.setHash(urlObj.hash);
}
```

## 注册表配置

### 正确的配置

```
HKEY_CLASSES_ROOT
  └─ dbdc
      ├─ (默认) = "URL:DBDC Protocol"
      ├─ URL Protocol = ""
      └─ shell\open\command
          └─ (默认) = "electron.exe路径" "main.js路径" "%1"
```

**关键点**：
- 必须包含 `main.js` 路径
- `%1` 会被替换为实际的 `dbdc://` URL

### 检查命令

```bash
# 查看当前配置
reg query "HKEY_CLASSES_ROOT\dbdc\shell\open\command" /ve

# 应该看到类似：
# "E:\...\electron.exe" "E:\...\main.js" "%1"
```

## 测试步骤

### 1. 编译代码

```bash
pnpm run build-main-dev
```

### 2. 配置注册表（以管理员身份运行）

```bash
.\scripts\fix-dbdc-protocol.bat
```

### 3. 启动应用

```bash
# 方法 A：使用 npm 脚本
pnpm run start-electron

# 方法 B：直接运行 electron
npx electron ./dist/main/main.js

# 方法 C：使用测试脚本
.\scripts\test-windows-protocol.bat
```

### 4. 测试协议唤起

**方法 A：浏览器地址栏**
```
dbdc://http://localhost:8000/#/sqlworkspace?token=test123&env=sit
```

**方法 B：使用测试页面**
```
file:///E:/Projects/Web/odc-client/scripts/test-deeplink.html
```

**方法 C：命令行测试**
```bash
# 模拟首次启动
npx electron ./dist/main/main.js "dbdc://http://localhost:8000/#/sqlworkspace?token=test123&env=sit"
```

## 调试技巧

### 查看日志

```bash
# 实时查看日志
Get-Content "%APPDATA%\odc-client\logs\*.log" -Wait -Tail 50

# 搜索关键信息
type "%APPDATA%\odc-client\logs\*.log" | findstr "argv\|second-instance\|dbdc"
```

### 关键日志标识

| 日志内容 | 含义 |
|---------|------|
| `APP Start` | 应用启动 |
| `process.argv: [...]` | 启动参数 |
| `second-instance event fired` | 协议唤起事件 |
| `Found schema URL: dbdc://...` | 成功识别协议 URL |
| `Token params stored` | Token 已存储 |
| `Token injected successfully` | Token 已注入到页面 |

### 常见问题排查

#### 问题 1：点击链接没有反应

**检查项**：
1. 应用是否正在运行？
2. 注册表是否正确配置？
3. 日志中是否有 `second-instance` 事件？

**解决方法**：
```bash
# 重新配置注册表
.\scripts\fix-dbdc-protocol.bat

# 检查应用是否运行
tasklist | findstr electron
```

#### 问题 2：启动参数未被识别

**检查项**：
1. 注册表命令是否包含 `main.js` 路径？
2. `process.argv` 中是否包含 `dbdc://`？

**调试方法**：
在 `main.ts` 中添加日志：
```typescript
log.info('Raw argv:', JSON.stringify(argv));
```

#### 问题 3：Token 未注入

**检查项**：
1. 窗口是否已加载完成？
2. localStorage 中是否已有 token？

**调试方法**：
在 DevTools 中执行：
```javascript
localStorage.getItem('token')
localStorage.getItem('userInfoSession')
```

## 验证清单

- [ ] `pnpm run build-main-dev` 编译成功
- [ ] 注册表配置包含 `main.js` 路径
- [ ] 应用正常启动无报错
- [ ] 日志中看到 `register dbdc:// protocol`
- [ ] 点击链接后看到 `second-instance event fired`
- [ ] 日志中看到 `Found schema URL`
- [ ] Token 参数被正确解析
- [ ] Token 成功注入到 localStorage

## 代码位置

| 功能 | 文件位置 |
|-----|---------|
| 协议检测 | `src/main/utils/index.ts` - `isSchemaUrl()` |
| 参数解析 | `src/main/utils/index.ts` - `parseUrlParams()` |
| 启动参数处理 | `src/main/main.ts` - `app.on('ready')` |
| 协议唤起处理 | `src/main/main.ts` - `app.on('second-instance')` |
| Token 注入 | `src/main/utils/token-injection.ts` |
| 参数存储 | `src/main/store/index.ts` - `PathnameStore` |
