# Douyin 直播间互动猜谜游戏 — Handoff

项目路径: `/Users/zhuo/douyin-game`
GitHub: `https://github.com/RainZhuo/douyin-live-game`

---

## 当前状态 (2026-06-11)

### 已完成功能

- [x] 出题区：显示分类、难度星级、题号、倒计时（5分钟进度条）、上一题答案
- [x] 提示区：4种礼物道具（人气票/啤酒/棒棒糖/比心兔兔）+ 提示展示
- [x] 聊天区：弹幕列表 + 接近度% + 置顶TOP3接近弹幕 + 切题自动清空
- [x] 排行榜：右侧独立列，经验排行 + 段位 + SVG环形进度条 + 段位色名字
- [x] 弹窗系统：答对弹窗 / 礼物感谢弹窗 / 超时弹窗
- [x] 语义相似度引擎（BGE-small-zh 嵌入模型，服务端 Node.js）
- [x] Jaro-Winkler 字符匹配回退（模型不可用时自动切）
- [x] 段位系统：黑铁→白银→黄金→铂金→钻石→大师→王者→最强王者
- [x] 经验公式：基础经验(10/25/40) + 速度加成(0~20)
- [x] 东北方言语音播报（Edge TTS）
- [x] 语音队列：顺序播放，前一条播完才播下一条
- [x] 模拟弹幕：30个假名 + 混淆答案池，随机发送
- [x] 模拟礼物：15~30秒随机触发，概率权重 人气票40%/啤酒30%/棒棒糖20%/比心兔兔10%
- [x] 抖音直播间接入（@dycast/core）
- [x] 抖音开放平台题库 API（需要配置 DY_APP_ID / DY_APP_SECRET）
- [x] 本地题库回退（50道题，含难度和分类）
- [x] Windows 兼容（start.bat + python3/python 自动检测）
- [x] 语义模型多镜像源下载（download-model.js）
- [x] GitHub 仓库已建立

### 待办/问题

- [ ] 抖音直播间 WebSocket 连接不稳定（@dycast/core 2025年10月版，可能仍需验证）
- [ ] 语义模型下载在某些网络环境下可能失败（已有多镜像回退）
- [ ] 礼物名称映射（`GIFT_MAP` 在 douyin-bridge.js 中）可能需要根据实际直播间礼物名称调整

---

## 架构

```
douyin-game/
├── douyin-bridge.js      # Node.js 服务端（核心）
│   ├── HTTP :3000          → 托管游戏页面 + API
│   ├── WS :6789           → 推送弹幕/礼物到游戏
│   ├── POST /tts          → Edge TTS 语音合成
│   ├── POST /similarity   → BGE 语义相似度
│   ├── GET /api/questions → 抖音题库代理
│   └── 抖音 WS 客户端     → @dycast/core 连直播间
│
├── game-overlay.html     # OBS 浏览器源（游戏 UI）
│   ├── 本地 charSimilarity   → Jaro-Winkler 回退
│   ├── 服务端 semanticSimilarity → fetch /similarity
│   ├── 模拟弹幕 + 模拟礼物
│   └── WebSocket → 接收真实弹幕/礼物
│
├── download-model.js     # 手动下载语义模型
├── start.sh / start.bat  # 启动脚本
├── .env                  # DY_APP_ID / DY_APP_SECRET
└── package.json          # 依赖
```

### 数据流

```
抖音直播间 ──WS──▶ douyin-bridge.js ──WS──▶ game-overlay.html
                        │
  [真实]: 弹幕 → POST /similarity → 语义相似度 → 显示接近度%
  [模拟]: 假玩家弹幕 → 本地 charSimilarity → 显示接近度%
  
  礼物: 匹配 GIFT_MAP → 触发提示/跳过 → 广播到游戏
  题库: GET /api/questions → 抖音 OpenAPI → 缓存到本地
```

---

## 关键配置

### `.env` 文件（可选，用于抖音官方题库）
```
DY_APP_ID=xxx
DY_APP_SECRET=xxx
```

### 声线切换（API 方式）
```bash
curl -X POST http://localhost:3000/tts/voice \
  -H 'Content-Type: application/json' \
  -d '{"voice":"zh-CN-liaoning-XiaobeiNeural"}'
```

可用声线: YunxiaNeural (男·卡通), XiaoyiNeural (女·活泼), XiaobeiNeural (东北方言·当前)

### 礼物名称映射（douyin-bridge.js 中 GIFT_MAP）
直播间实际礼物名称可能与代码中不同，需要根据抖音最新礼物名称调整。

---

## 已知坑点

1. **ESM 模块**: `@dycast/core` 是 ESM，必须用 `await import()` 不能 `require()`
2. **Autoplay 策略**: 浏览器中 Audio.play() 会被阻止，已用 Web Audio API + AudioContext.resume() 绕过
3. **语义模型**: 首次加载需下载 ~100MB 模型，后续缓存。Windows 上可能因网络需要手动下载
4. **Python 命令**: macOS/Linux 用 `python3`，Windows 用 `python`，已自动检测
5. **排行榜**: 右侧栏的 `flex:1` 需要 chat-area 也 `flex:1` 才能对齐底部
