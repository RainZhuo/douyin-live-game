/**
 * 语义模型下载脚本
 * 当自动下载失败时，运行此脚本手动下载模型文件
 * 
 * 用法: node download-model.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const MODEL = 'Xenova/bge-small-zh-v1.5';
const MIRROR = 'hf-mirror.com'; // 国内镜像，也可改为 huggingface.co

// 需要的模型文件（选最小的 quantized 版）
const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
];

// 缓存目录
const CACHE_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.cache', 'huggingface', 'hub',
  `models--${MODEL.replace(/\//g, '--')}`,
  'snapshots', 'main'
);

async function downloadFile(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => {
      file.close();
      try { fs.unlinkSync(dest); } catch(e) {}
      reject(err);
    });
  });
}

async function main() {
  console.log(`📦 下载模型: ${MODEL}`);
  console.log(`📁 缓存目录: ${CACHE_DIR}`);
  console.log(`🌐 镜像源: ${MIRROR}`);
  console.log('');

  for (const file of FILES) {
    const url = `https://${MIRROR}/${MODEL}/resolve/main/${file}`;
    const dest = path.join(CACHE_DIR, file);
    if (fs.existsSync(dest)) {
      console.log(`✅ 已存在: ${file}`);
      continue;
    }
    process.stdout.write(`⬇️  下载: ${file}... `);
    try {
      await downloadFile(url, dest);
      console.log('完成');
    } catch (err) {
      console.log(`失败 (${err.message})`);
      console.log(`   尝试手动下载: ${url}`);
    }
  }

  console.log('');
  console.log('✅ 下载完成，重启服务即可使用语义模型');
}

main().catch(console.error);
