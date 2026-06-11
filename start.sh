#!/bin/bash
# ============================================================
# 抖音直播间互动游戏 - 启动脚本
# ============================================================
# 用法: ./start.sh <抖音直播间ID>
# 例如: ./start.sh 123456789
# 或:   ./start.sh https://live.douyin.com/123456789
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║    🎮 抖音直播间互动游戏启动脚本    ║"
echo "╚══════════════════════════════════════╝"
echo ""

# 检查参数
if [ -z "$1" ]; then
  echo "❌ 请提供抖音直播间ID"
  echo ""
  echo "用法:"
  echo "  ./start.sh <直播间ID>"
  echo ""
  echo "直播间ID获取方式:"
  echo "  1. 打开 https://live.douyin.com/"
  echo "  2. 进入你的直播间"
  echo "  3. URL 中最后一串数字就是直播间ID"
  echo ""
  echo "例如: ./start.sh 123456789"
  echo ""
  exit 1
fi

ROOM_ID="$1"

# 检查 node
if ! command -v node &> /dev/null; then
  echo "❌ 未找到 Node.js，请先安装 Node.js 16+"
  exit 1
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
  echo "📦 正在安装依赖..."
  npm install
  echo "✅ 依赖安装完成"
fi

echo "🎯 直播间ID: $ROOM_ID"
echo "🌐 HTTP服务: http://localhost:3000"
echo "🔌 WebSocket: ws://localhost:6789"
echo ""
echo "📋 在 OBS 中添加浏览器源:"
echo "   地址: http://localhost:3000"
echo "   宽度: 460  高度: 800"
echo ""
echo "🚀 正在启动服务..."

# 启动桥接服务
node douyin-bridge.js "$ROOM_ID"
