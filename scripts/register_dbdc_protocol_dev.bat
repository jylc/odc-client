@echo off
REM ==============================================================================
REM dbdc:// Protocol Registration Script for Development
REM
REM 此脚本用于在开发环境中注册 dbdc:// 自定义协议
REM 使用 pnpm electron 命令启动应用
REM ==============================================================================

echo.
echo ============================================================
echo   dbdc:// Protocol Registration (Development)
echo ============================================================
echo.

REM 检查是否具有管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] 此脚本需要管理员权限运行
    echo.
    echo 请使用以下方式之一运行：
    echo   1. 右键点击此文件，选择"以管理员身份运行"
    echo   2. 在管理员权限的命令提示符中运行此脚本
    echo.
    pause
    exit /b 1
)

REM 获取当前脚本所在目录
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%.."
REM 移除路径末尾的反斜杠
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

REM 检查 pnpm 是否可用
where pnpm >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] 未找到 pnpm，请确保 Node.js 和 pnpm 已安装
    pause
    exit /b 1
)

echo [INFO] 项目目录: %PROJECT_DIR%
echo.

REM 注册 dbdc:// 协议
echo [1/4] 注册 dbdc:// 协议根键...
REG ADD "HKEY_CLASSES_ROOT\dbdc" /ve /d "URL:DBDC Protocol" /f >nul
if %errorLevel% neq 0 (
    echo [ERROR] 注册协议根键失败
    pause
    exit /b 1
)
echo [OK] 协议根键注册成功

echo.
echo [2/4] 设置 URL Protocol 标志...
REG ADD "HKEY_CLASSES_ROOT\dbdc" /v "URL Protocol" /d "" /f >nul
if %errorLevel% neq 0 (
    echo [ERROR] 设置 URL Protocol 标志失败
    pause
    exit /b 1
)
echo [OK] URL Protocol 标志设置成功

echo.
echo [3/4] 注册默认图标...
REG ADD "HKEY_CLASSES_ROOT\dbdc\DefaultIcon" /ve /d "electron.exe,0" /f >nul
if %errorLevel% neq 0 (
    echo [WARNING] 注册图标失败（非致命错误）
) else (
    echo [OK] 图标注册成功
)

echo.
echo [4/4] 注册打开命令（开发环境）...
REM 使用 cmd /c 来执行复杂命令
REM 注意：需要 cd 到项目目录，然后运行 pnpm 命令
set "LAUNCH_CMD=cmd /c cd /d \"%PROJECT_DIR%\" && pnpm run dev:client"
REG ADD "HKEY_CLASSES_ROOT\dbdc\shell\open\command" /ve /d "\"%LAUNCH_CMD%\" \"%%1\"" /f >nul
if %errorLevel% neq 0 (
    echo [ERROR] 注册打开命令失败
    pause
    exit /b 1
)
echo [OK] 打开命令注册成功

echo.
echo ============================================================
echo   dbdc:// 协议注册完成！（开发环境）
echo ============================================================
echo.
echo 现在可以通过以下方式从网页唤起 ODC：
echo.
echo   ^<a href="dbdc://http://localhost:8000/#/sqlworkspace?token=xxx^"^>
echo     唤起 ODC
echo   ^</a^>
echo.
echo 注意：
echo   - 点击链接后会启动开发环境（pnpm run dev:client）
echo   - 请确保开发环境已经正确配置
echo   - 如需卸载协议，请运行 unregister_dbdc_protocol_dev.bat
echo.
pause
