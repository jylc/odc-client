@echo off
REM ==============================================================================
REM dbdc:// Protocol Unregistration Script for Windows
REM
REM 此脚本用于在 Windows 上卸载 dbdc:// 自定义协议
REM 运行此脚本需要管理员权限
REM ==============================================================================

echo.
echo ============================================================
echo   dbdc:// Protocol Unregistration
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

REM 检查协议是否已注册
REG QUERY "HKEY_CLASSES_ROOT\dbdc" >nul 2>&1
if %errorLevel% neq 0 (
    echo [WARNING] dbdc:// 协议未注册
    echo.
    pause
    exit /b 0
)

echo [INFO] 正在卸载 dbdc:// 协议...
echo.

REM 删除注册表项
REG DELETE "HKEY_CLASSES_ROOT\dbdc" /f >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] 卸载失败
    pause
    exit /b 1
)

echo [OK] dbdc:// 协议已成功卸载
echo.
echo ============================================================
echo   卸载完成！
echo ============================================================
echo.
pause
