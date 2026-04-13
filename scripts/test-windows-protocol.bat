@echo off
REM ==============================================================================
REM Windows 协议唤起测试脚本
REM
REM 用于测试 dbdc:// 协议是否能正确唤起应用并传递参数
REM ==============================================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================
echo   Windows 协议唤起测试工具
echo ============================================================
echo.

REM 获取项目路径
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%.."
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

REM 获取 electron 路径
set "ELECTRON_EXE=%PROJECT_DIR%\node_modules\.pnpm\electron@22.3.27\node_modules\electron\dist\electron.exe"
set "MAIN_JS=%PROJECT_DIR%\dist\main\main.js"

echo [INFO] 项目目录: %PROJECT_DIR%
echo [INFO] Electron: %ELECTRON_EXE%
echo [INFO] Main JS: %MAIN_JS%
echo.

REM 检查必要文件
if not exist "%ELECTRON_EXE%" (
    echo [ERROR] 未找到 electron.exe
    echo 请先运行: pnpm install
    pause
    exit /b 1
)

if not exist "%MAIN_JS%" (
    echo [ERROR] 未找到 dist/main/main.js
    echo 请先运行: pnpm run build-main-dev
    pause
    exit /b 1
)

echo ============================================================
echo   测试 1: 模拟首次通过协议启动（传递参数到 process.argv）
echo ============================================================
echo.
echo 执行命令：
echo "%ELECTRON_EXE%" "%MAIN_JS%" "dbdc://http://localhost:8000/#/sqlworkspace?token=test123&env=sit"
echo.
echo 请检查：
echo   1. 应用是否正常启动
echo   2. 日志中是否显示 "Found schema URL: dbdc://..."
echo   3. token 是否被正确解析
echo.
pause

echo.
echo ============================================================
echo   测试 2: 验证注册表配置
echo ============================================================
echo.

REM 检查注册表
reg query "HKEY_CLASSES_ROOT\dbdc" >nul 2>&1
if %errorLevel% neq 0 (
    echo [WARNING] dbdc:// 协议未注册
    echo.
    echo 请运行以下命令注册：
    echo   .\scripts\fix-dbdc-protocol.bat
    echo.
) else (
    echo [OK] dbdc:// 协议已注册
    echo.
    echo 当前配置：
    reg query "HKEY_CLASSES_ROOT\dbdc\shell\open\command" /ve
    echo.

    REM 检查配置是否正确
    reg query "HKEY_CLASSES_ROOT\dbdc\shell\open\command" /ve | findstr /i "main.js" >nul
    if %errorLevel% neq 0 (
        echo [WARNING] 注册表配置可能不正确
        echo.
        echo 正确的配置应该包含 main.js 路径
        echo 建议运行：.\scripts\fix-dbdc-protocol.bat
        echo.
    ) else (
        echo [OK] 注册表配置包含 main.js 路径
    )
)

echo.
echo ============================================================
echo   测试 3: 测试 second-instance 事件
echo ============================================================
echo.
echo 步骤：
echo   1. 启动应用（保持运行）
echo   2. 在浏览器地址栏输入以下链接
echo   3. 检查应用日志中是否出现 "second-instance event fired"
echo.
echo 测试链接：
echo   dbdc://http://localhost:8000/#/sqlworkspace?token=test456&env=uat
echo.
echo 或者使用 test-deeplink.html 测试页面
echo.
pause

echo.
echo ============================================================
echo   启动应用（用于手动测试）
echo ============================================================
echo.
echo 是否现在启动应用？(Y/N)
choice /c YN /n
if %errorLevel%==1 (
    echo.
    echo 正在启动应用...
    echo 使用 Ctrl+C 可以停止
    echo.
    start "ODC Dev" "%ELECTRON_EXE%" "%MAIN_JS%"
    echo [OK] 应用已在后台启动
    echo.
    echo 现在可以在浏览器中输入 dbdc:// 链接测试
)

echo.
echo ============================================================
echo   测试完成
echo ============================================================
echo.
echo 日志位置：%APPDATA%\odc-client\logs\
echo.
echo 查看日志命令：
echo   type %%APPDATA%%\odc-client\logs\*.log ^| findstr "second-instance\|resolveWinRemoteParams\|token"
echo.
pause
