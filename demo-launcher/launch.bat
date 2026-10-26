@echo off
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found. Please install Node.js v18 or higher: https://nodejs.org/
    pause
    exit /b 1
)

node demo-launcher\launcher.js %*

if "%~1"=="" (
    pause
)
