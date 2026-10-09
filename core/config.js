// Reads the local config config.local.json (server address, accounts and passwords, browser settings).
// The file exists only on each person's own computer; it never goes into Git or into case files.

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  baseUrl: '',
  apiBaseUrl: '', // address of the API, which may differ from the pages' address; only cases with api steps need it
  accounts: {},
  // The third-party risk calculation an event triggers: 'real' waits for its answer, 'mock' answers it in the browser
  // with a fixed success, so a case does not depend on the risk engine being up
  riskEngine: 'real',
  browser: {
    channel: 'msedge', // use the Edge already on the computer; "chrome" also works, or "" together with executablePath
    executablePath: '',
    args: [],
    headless: false,
    slowMo: 300, // slow every step by 300ms so the PO can follow along
  },
  // response: how long a click waits for the answer of a request it is known to trigger (a risk calculation is slow)
  timeouts: { step: 15000, response: 60000 },
  evidence: { video: false }, // video needs Playwright's ffmpeg (usually not installable on the intranet); set to true in config.local.json when needed
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
    user = JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, ''));
  }
  if (process.env.OREO_BASE_URL) user.baseUrl = process.env.OREO_BASE_URL;
  if (process.env.OREO_API_BASE_URL) user.apiBaseUrl = process.env.OREO_API_BASE_URL;
  const cfg = deepMerge(DEFAULTS, user);
  cfg.__file = file;
  return cfg;
}

/** Playwright launch options */
function launchOptions(cfg) {
  const b = cfg.browser || {};
  const opts = { headless: !!b.headless, slowMo: Number(b.slowMo) || 0 };
  if (b.executablePath) opts.executablePath = b.executablePath;
  else if (b.channel && b.channel !== 'chromium') opts.channel = b.channel;
  if (Array.isArray(b.args) && b.args.length) opts.args = b.args;
  return opts;
}

/** List every sensitive value in the config (keys containing password/secret/token), used to keep plain text out of case files */
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
