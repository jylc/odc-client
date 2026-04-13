@echo off
REM ==============================================================================
REM 修复 dbdc:// 协议注册表配置（开发环境专用）
REM ==============================================================================

echo.
echo ============================================================
echo   修复 dbdc:// 协议配置
echo ============================================================
echo.

REM 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] 需要管理员权限
    echo 请右键点击此文件，选择"以管理员身份运行"
    pause
    exit /b 1
)

REM 获取项目路径
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%.."
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

REM 查找 electron.exe 路径
set "ELECTRON_EXE=%PROJECT_DIR%\node_modules\.pnpm\electron@22.3.27\node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON_EXE%" (
    echo [ERROR] 未找到 electron.exe
    echo 请先运行 pnpm install
    pause
    exit /b 1
)

echo [INFO] 项目目录: %PROJECT_DIR%
echo [INFO] Electron 路径: %ELECTRON_EXE%
echo.

REM 删除旧的注册表项
echo [1/3] 清理旧配置...
REG DELETE "HKEY_CLASSES_ROOT\dbdc" /f >nul 2>&1

REM 注册协议根键
echo [2/3] 注册协议根键...
REG ADD "HKEY_CLASSES_ROOT\dbdc" /ve /d "URL:DBDC Protocol" /f >nul
REG ADD "HKEY_CLASSES_ROOT\dbdc" /v "URL Protocol" /d "" /f >nul

REM 注册打开命令（关键修复：指定 main.js 路径）
echo [3/3] 注册打开命令...
REM 格式：electron.exe "项目路径/dist/main/main.js" "dbdc://参数"
set "CMD=\"%ELECTRON_EXE%\" \"%PROJECT_DIR%\dist\main\main.js\" \"%%1\""
REG ADD "HKEY_CLASSES_ROOT\dbdc\shell\open\command" /ve /d "%CMD%" /f >nul

if %errorLevel% neq 0 (
    echo [ERROR] 注册失败
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   修复完成！
echo ============================================================
echo.
echo 注册表命令：
echo %CMD%
echo.
echo 测试步骤：
echo   1. 运行 pnpm run build-main-dev
echo   2. 在浏览器输入: dbdc://http://localhost:8000/#/sqlworkspace?token=test&env=sit
echo.
pause
