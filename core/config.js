// 读取本地配置 config.local.json（服务器地址、账号密码、浏览器设置）。
// 这个文件只存在于各自电脑上，不进 Git、不进用例文件。

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  baseUrl: '',
  accounts: {},
  browser: {
    channel: 'msedge', // 用电脑自带的 Edge；也可填 "chrome"，或填 "" 并配合 executablePath
    executablePath: '',
    args: [],
    headless: false,
    slowMo: 300, // 每步放慢 300ms，PO 看得清
  },
  timeouts: { step: 15000 },
  evidence: { video: true }, // 录像需要 Playwright 的 ffmpeg，打包脚本会一起打进去
};

function deepMerge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(base[k] || {}, v) : v;
  }
  return out;
}

function loadConfig(dir) {
  const file = process.env.OREO_UAT_CONFIG || path.join(dir, 'config.local.json');
  let user = {};
  if (fs.existsSync(file)) {
    user = JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^﻿/, ''));
  }
  if (process.env.OREO_BASE_URL) user.baseUrl = process.env.OREO_BASE_URL;
  const cfg = deepMerge(DEFAULTS, user);
  cfg.__file = file;
  return cfg;
}

/** Playwright 启动参数 */
function launchOptions(cfg) {
  const b = cfg.browser || {};
  const opts = { headless: !!b.headless, slowMo: Number(b.slowMo) || 0 };
  if (b.executablePath) opts.executablePath = b.executablePath;
  else if (b.channel && b.channel !== 'chromium') opts.channel = b.channel;
  if (Array.isArray(b.args) && b.args.length) opts.args = b.args;
  return opts;
}

/** 列出配置里所有敏感值（key 含 password/secret/token），用于防止明文写进用例文件 */
function secretEntries(cfg, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(cfg || {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') out.push(...secretEntries(v, p));
    else if (typeof v === 'string' && v && /password|secret|token/i.test(k)) out.push([p, v]);
  }
  return out;
}

module.exports = { loadConfig, launchOptions, secretEntries };
