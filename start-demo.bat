@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [提示] 检测到未安装 Node.js，将直接调用 start.bat (纯 Jar 启动模式)...
    call start.bat
    exit /b 0
)

node demo-launcher\launcher.js %*

if "%~1"=="" (
    pause
)