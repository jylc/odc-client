@echo off
REM ==============================================================================
REM dbdc:// Protocol Registration Script for Windows
REM
REM 此脚本用于在 Windows 上注册 dbdc:// 自定义协议
REM 运行此脚本需要管理员权限
REM
REM 使用方法：
REM   1. 右键点击此文件，选择"以管理员身份运行"
REM   2. 或者在管理员权限的命令提示符中运行此脚本
REM ==============================================================================

echo.
echo ============================================================
echo   dbdc:// Protocol Registration
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

REM 获取当前脚本所在目录（ODC 安装目录）
set "SCRIPT_DIR=%~dp0"
set "INSTALL_DIR=%SCRIPT_DIR%.."
REM 移除路径末尾的反斜杠
if "%INSTALL_DIR:~-1%"=="\" set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"

REM 获取 ODC 可执行文件路径（假设在 release 目录下）
set "EXE_PATH=%INSTALL_DIR%\release\ODC.exe"

REM 检查可执行文件是否存在
if not exist "%EXE_PATH%" (
    echo [WARNING] 未找到 ODC.exe，使用默认路径
    set "EXE_PATH=%INSTALL_DIR%\ODC.exe"
)

if not exist "%EXE_PATH%" (
    echo [ERROR] 无法找到 ODC 可执行文件
    echo 请确保 ODC 已正确安装
    pause
    exit /b 1
)

echo [INFO] 安装目录: %INSTALL_DIR%
echo [INFO] 可执行文件: %EXE_PATH%
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
REG ADD "HKEY_CLASSES_ROOT\dbdc\DefaultIcon" /ve /d "\"%EXE_PATH%\",0" /f >nul
if %errorLevel% neq 0 (
    echo [WARNING] 注册图标失败（非致命错误）
) else (
    echo [OK] 图标注册成功
)

echo.
echo [4/4] 注册打开命令...
REG ADD "HKEY_CLASSES_ROOT\dbdc\shell\open\command" /ve /d "\"%EXE_PATH%\" \"%%1\"" /f >nul
if %errorLevel% neq 0 (
    echo [ERROR] 注册打开命令失败
    pause
    exit /b 1
)
echo [OK] 打开命令注册成功

echo.
echo ============================================================
echo   dbdc:// 协议注册完成！
echo ============================================================
echo.
echo 现在可以通过以下方式从网页唤起 ODC：
echo.
echo   ^<a href="dbdc://http://localhost:8000/#/sqlworkspace?token=xxx^"^>
echo     唤起 ODC
echo   ^</a^>
echo.
echo 如需卸载协议，请运行 unregister_dbdc_protocol.bat
echo.
pause
