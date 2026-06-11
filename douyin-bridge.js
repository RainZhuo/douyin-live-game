/**
 * 抖音直播间桥接服务
 * 
 * 功能：
 * 1. 连接抖音直播间 WebSocket（通过 live-parser-core）
 * 2. 解析弹幕消息、礼物消息
 * 3. 通过本地 WebSocket 转发给游戏 UI
 * 4. 提供 HTTP 服务托管游戏页面
 * 
 * 用法：
 *   node douyin-bridge.js <直播间ID>
 *   node douyin-bridge.js https://live.douyin.com/123456789
 * 
 * 直播间ID获取方式：
 * - 打开抖音直播网页版 https://live.douyin.com/
 * - 进入你的直播间，URL 中最后一串数字就是直播间ID
 * - 例如 https://live.douyin.com/123456789 中 123456789 就是 ID
 */

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
const isWin = process.platform === 'win32';
const PYTHON = isWin ? 'python' : 'python3';

// ============================================================
// 配置
// ============================================================
const CONFIG = {
  HTTP_PORT: 3000,
  WS_PORT: 6789,
};

// ============================================================
// 命令行参数 - 直播间ID
// ============================================================
const LIVE_ID = process.argv[2];
if (!LIVE_ID) {
  console.error('');
  console.error('❌ 请提供抖音直播间ID');
  console.error('');
  console.error('用法:');
  console.error('  node douyin-bridge.js <直播间ID>');
  console.error('  node douyin-bridge.js https://live.douyin.com/123456789');
  console.error('');
  console.error('直播间ID获取方式:');
  console.error('  1. 打开 https://live.douyin.com/');
  console.error('  2. 进入你的直播间');
  console.error('  3. URL 中最后一串数字就是直播间ID');
  console.error('');
  process.exit(1);
}

// 从 URL 中提取直播ID
function extractLiveId(input) {
  const match = input.match(/(?:live\.douyin\.com\/|douyin\.com\/live\/)?(\d+)/);
  if (match) return match[1];
  // 也可能直接是数字
  if (/^\d+$/.test(input.trim())) return input.trim();
  return null;
}

const roomId = extractLiveId(LIVE_ID);
if (!roomId) {
  console.error('❌ 无法解析直播间ID，请提供正确的抖音直播间链接或ID');
  process.exit(1);
}

console.log(`🎯 直播间ID: ${roomId}`);

// ============================================================
// WebSocket 客户端管理（游戏UI连接）
// ============================================================
let gameClients = new Set();

function broadcastToGame(data) {
  const msg = JSON.stringify(data);
  for (const ws of gameClients) {
    if (ws.readyState === 1) {
      ws.send(msg);
    }
  }
}

// ============================================================
// 礼物名称 -> 游戏内触发类型映射
// ============================================================
// 抖音礼物的实际显示名称可能与此不同，可根据实际情况调整
const GIFT_MAP = {
  '人气票': 'pop',
  '啤酒': 'beer',
  '棒棒糖': 'lollipop',
  '比心兔兔': 'bunny',
  '人气': 'pop',
  '礼花': 'pop',
  '粉丝灯牌': 'pop',
};

function matchGiftType(giftName) {
  if (!giftName) return null;
  for (const [key, type] of Object.entries(GIFT_MAP)) {
    if (giftName.includes(key)) return type;
  }
  return null;
}

// ============================================================
// 启动本地 WebSocket 服务（游戏端）
// ============================================================
const wss = new WebSocketServer({ port: CONFIG.WS_PORT });
wss.on('listening', () => {
  console.log(`🔌 本地WebSocket服务已启动: ws://localhost:${CONFIG.WS_PORT}`);
});
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`✅ 游戏UI已连接 (${clientIp})`);
  gameClients.add(ws);

  // 发送连接确认
  ws.send(JSON.stringify({
    type: 'connected',
    message: '已连接到抖音直播间桥接服务',
    roomId: roomId,
  }));

  ws.on('close', () => {
    console.log(`❌ 游戏UI已断开 (${clientIp})`);
    gameClients.delete(ws);
  });

  ws.on('error', (err) => {
    console.error(`⚠️ WebSocket错误:`, err.message);
    gameClients.delete(ws);
  });
});

// ============================================================
// 启动 HTTP 服务（托管游戏页面）
// ============================================================
const app = express();

// 提供游戏页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'game-overlay.html'));
});

// 提供静态文件
app.use(express.static(__dirname));

// TTS 端点 - 用 Edge TTS 生成中文语音
const TTS_CACHE_DIR = path.join(__dirname, '.tts-cache');
if (!fs.existsSync(TTS_CACHE_DIR)) fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });

const TTS_VOICES = [
  'zh-CN-YunxiaNeural',   // 男声，卡通/小说，可爱调皮 ← 最接近角色声线
  'zh-CN-XiaoyiNeural',   // 女声，卡通/小说，活泼
  'zh-CN-YunjianNeural',  // 男声，热情
  'zh-CN-YunxiNeural',    // 男声，阳光
  'zh-CN-XiaoxiaoNeural', // 女声，温暖（最自然）
  'zh-CN-liaoning-XiaobeiNeural', // 东北方言，幽默
];

let ttsVoice = TTS_VOICES[0]; // 默认用 Yunxia（可爱男声）

app.post('/tts', express.json(), async (req, res) => {
  const text = req.body?.text?.trim();
  if (!text) return res.status(400).json({ error: '缺少 text 参数' });
  const voice = req.body?.voice || ttsVoice;

  // 缓存 key
  const hash = crypto.createHash('md5').update(voice + ':' + text).digest('hex');
  const cacheFile = path.join(TTS_CACHE_DIR, hash + '.mp3');

  try {
    if (!fs.existsSync(cacheFile)) {
      execSync(
        `${PYTHON} -m edge_tts --voice "${voice}" --text "${text.replace(/"/g, '\\"')}" --write-media "${cacheFile}"`,
        { timeout: 15000, stdio: 'pipe' }
      );
    }
    const audio = fs.readFileSync(cacheFile);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audio.length,
      'Cache-Control': 'public, max-age=86400',
    });
    res.send(audio);
  } catch (err) {
    console.error('TTS 生成失败:', err.message);
    res.status(500).json({ error: 'TTS 生成失败: ' + err.message });
  }
});

// 列出可用声线
app.get('/tts/voices', (req, res) => {
  res.json({ voices: TTS_VOICES, current: ttsVoice });
});

// 切换声线
app.post('/tts/voice', express.json(), (req, res) => {
  const v = req.body?.voice;
  if (v && TTS_VOICES.includes(v)) {
    ttsVoice = v;
    res.json({ voice: ttsVoice });
  } else {
    res.status(400).json({ error: '无效声线', available: TTS_VOICES });
  }
});

// ============================================================
// 语义相似度 - 使用 BGE-small-zh 嵌入模型
// ============================================================
let similarityPipe = null;
let similarityLoading = false;
let similarityLoaded = false;
let embCache = new Map(); // text -> embedding array
const SIM_MODEL = 'Xenova/bge-small-zh-v1.5';

async function loadSimilarityModel() {
  if (similarityLoaded) return true;
  if (similarityLoading) return false;
  similarityLoading = true;
  try {
    const { pipeline } = require('@xenova/transformers');
    similarityPipe = await pipeline('feature-extraction', SIM_MODEL);
    similarityLoaded = true;
    console.log('🧠 语义模型已加载');
    return true;
  } catch (err) {
    console.error('⚠️ 语义模型加载失败（不影响基础功能）:', err.message);
    console.log('   将使用本地字符匹配作为回退');
    similarityPipe = null;
    return false;
  } finally {
    similarityLoading = false;
  }
}

async function getEmbedding(text) {
  if (!similarityLoaded || !similarityPipe) return null;
  const key = text.trim();
  if (embCache.has(key)) return embCache.get(key);
  try {
    const result = await similarityPipe(key, { pooling: 'mean', normalize: true });
    const vec = Array.from(result.data);
    embCache.set(key, vec);
    return vec;
  } catch (e) {
    return null;
  }
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

app.post('/similarity', express.json(), async (req, res) => {
  const guess = req.body?.guess?.trim();
  const answer = req.body?.answer?.trim();
  if (!guess || !answer) return res.status(400).json({ error: '需要 guess 和 answer 参数' });
  
  // 模型未就绪时返回 null，客户端会用字符匹配回退
  if (!similarityLoaded) {
    return res.json({ similarity: null, guess, answer, fallback: true });
  }
  
  try {
    const [v1, v2] = await Promise.all([getEmbedding(guess), getEmbedding(answer)]);
    if (!v1 || !v2) {
      return res.json({ similarity: null, guess, answer, fallback: true });
    }
    const sim = cosineSim(v1, v2);
    res.json({ similarity: Math.round(sim * 1000) / 10, guess, answer });
  } catch (err) {
    console.error('相似度计算失败:', err.message);
    res.json({ similarity: null, guess, answer, fallback: true });
  }
});

// 预加载 - 预先计算所有答案的嵌入
app.post('/similarity/preload', express.json(), async (req, res) => {
  const words = req.body?.words || [];
  if (!words.length) return res.json({ cached: embCache.size });
  for (const w of words) { await getEmbedding(w); }
  res.json({ cached: embCache.size, total: words.length });
});

const httpServer = http.createServer(app);
httpServer.listen(CONFIG.HTTP_PORT, () => {
  console.log(`🌐 HTTP服务已启动: http://localhost:${CONFIG.HTTP_PORT}`);
  console.log(`   OBS浏览器源添加此地址即可作为直播窗口`);
  console.log(`   直播间ID: ${roomId}`);
});

// ============================================================
// 连接抖音直播间
// ============================================================
async function connectToDouyin() {
  console.log(`\n🔄 正在连接抖音直播间...`);
  console.log(`   房间ID: ${roomId}\n`);

  try {
    // 动态导入 ESM 模块
    const liveParser = await import('@liou666/live-parser-core');

    // 处理解析结果
    const parseResult = await liveParser.parseLiveUrl(roomId);
    console.log(`📡 直播间信息:`);
    console.log(`   标题: ${parseResult.liveRoomTitle || '未知'}`);
    console.log(`   主播: ${parseResult.nickName || '未知'}`);
    console.log(`   在线: ${parseResult.onlineUserCount || '0'} 人`);
    console.log(`   状态: ${parseResult.status}`);

    // 连接 WebSocket
    const ws = await liveParser.startWebsocket(roomId, {
      handleChatMessage: (data) => {
        try {
          const nickName = data?.user?.nickName || '未知';
          const content = data?.content || '';
          if (!content) return;

          console.log(`💬 ${nickName}: ${content}`);

          broadcastToGame({
            type: 'chat',
            name: nickName,
            text: content,
          });
        } catch (err) {
          console.error('处理弹幕消息出错:', err.message);
        }
      },

      handleGiftMessage: (data) => {
        try {
          const nickName = data?.user?.nickName || '未知';
          const giftName = data?.gift?.name || '未知礼物';
          const diamondCount = data?.gift?.diamondCount || 0;
          const repeatCount = data?.repeatCount || 1;
          const giftId = data?.gift?.id || '';

          console.log(`🎁 ${nickName} 送出 ${giftName} x${repeatCount} (${diamondCount}钻石)`);

          // 匹配游戏内触发类型
          const giftType = matchGiftType(giftName);

          broadcastToGame({
            type: 'gift',
            name: nickName,
            giftName: giftName,
            giftType: giftType,      // 'pop' | 'beer' | 'lollipop' | 'bunny' | null
            giftId: giftId,
            diamondCount: diamondCount,
            repeatCount: repeatCount,
          });
        } catch (err) {
          console.error('处理礼物消息出错:', err.message);
        }
      },

      handleMemberMessage: (data) => {
        try {
          const nickName = data?.user?.nickName || '未知';
          console.log(`👋 ${nickName} 进入直播间`);

          broadcastToGame({
            type: 'enter',
            name: nickName,
          });
        } catch (err) {
          // 忽略进入消息错误
        }
      },

      handleLikeMessage: (data) => {
        try {
          const nickName = data?.user?.nickName || '未知';
          const count = data?.count?.low || 1;
          console.log(`❤️ ${nickName} 点赞 x${count}`);

          broadcastToGame({
            type: 'like',
            name: nickName,
            count: count,
          });
        } catch (err) {
          // 忽略点赞错误
        }
      },

      handleRoomUserSeqMessage: (data) => {
        try {
          const online = data?.totalUser || data?.total || '0';
          console.log(`📊 在线人数: ${online}`);

          broadcastToGame({
            type: 'online',
            count: parseInt(online) || 0,
          });
        } catch (err) {
          // 忽略人数错误
        }
      },

      handleUnknowMessage: (method, buffer) => {
        // 忽略未知消息
      },
    });

    console.log(`\n✅ 成功连接到抖音直播间！`);
    console.log(`   弹幕和礼物消息将实时转发到游戏\n`);

    return ws;

  } catch (err) {
    console.error(`\n❌ 连接抖音直播间失败:`, err.message);
    console.error(`   可能的原因:`);
    console.error(`   1. 直播间ID不正确`);
    console.error(`   2. 直播间未开播`);
    console.error(`   3. 网络问题`);
    console.error(`   4. 抖音接口变动`);
    console.error(`\n   请在开播后重试，或检查直播间ID是否正确\n`);
    return null;
  }
}

// ============================================================
// 启动
// ============================================================
console.log('');
console.log('╔══════════════════════════════════════╗');
console.log('║    🎮 抖音直播间互动游戏桥接服务     ║');
console.log('╚══════════════════════════════════════╝');
console.log('');

connectToDouyin().then(ws => {
  if (!ws) {
    // 连接失败 - 服务仍在运行，可以手动重连
    console.log('⚠️ 桥接服务运行中但未连接到抖音直播间');
    console.log('   游戏UI可访问 http://localhost:' + CONFIG.HTTP_PORT);
    console.log('   但只有模拟玩家在线，没有真实弹幕');
  }

  // 后台加载语义模型（不影响启动速度）
  loadSimilarityModel();

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n👋 正在关闭服务...');
    if (ws) ws.close();
    wss.close();
    httpServer.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n👋 正在关闭服务...');
    if (ws) ws.close();
    wss.close();
    httpServer.close();
    process.exit(0);
  });
});
