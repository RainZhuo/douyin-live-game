@echo off
chcp 65001 >nul
title 抖音直播间互动游戏

echo ╔══════════════════════════════════════╗
echo ║    🎮 抖音直播间互动游戏启动脚本    ║
echo ╚══════════════════════════════════════╝
echo.

if "%1"=="" (
    echo ❌ 请提供抖音直播间ID
    echo.
    echo 用法:
    echo   start.bat ^<直播间ID^>
    echo.
    echo 直播间ID获取方式:
    echo   1. 打开 https://live.douyin.com/
    echo   2. 进入你的直播间
    echo   3. URL 中最后一串数字就是直播间ID
    echo.
    echo 例如: start.bat 123456789
    echo.
    pause
    exit /b 1
)

set ROOM_ID=%1

echo 🎯 直播间ID: %ROOM_ID%
echo 🌐 HTTP服务: http://localhost:3000
echo 🔌 WebSocket: ws://localhost:6789
echo.
echo 📋 在 OBS 中添加浏览器源:
echo    地址: http://localhost:3000
echo    宽度: 500  高度: 800
echo.

:: 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 未找到 Node.js，请先安装: https://nodejs.org/
    pause
    exit /b 1
)

:: 检查 Python + edge-tts
python -c "import edge_tts" 2>nul
if %errorlevel% neq 0 (
    echo ⚠️ 未安装 edge-tts，正在安装...
    pip install edge-tts
)

:: 安装 npm 依赖
if not exist "node_modules\" (
    echo 📦 正在安装依赖...
    call npm install
    echo ✅ 依赖安装完成
)

echo 🚀 正在启动服务...
node douyin-bridge.js %ROOM_ID%
pause
