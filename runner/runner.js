#!/usr/bin/env node
// PO 端运行器：读取 cases/ 下的用例文件，在本机浏览器里真实执行一遍。
// 用法：
//   双击 运行用例.bat              → 列出用例，输入编号执行
//   把用例 .json 拖到 运行用例.bat 上 → 直接执行该用例
//   node runner/runner.js cases/xxx.json

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('@playwright/test');
const { executeStep, describeStep } = require('../core/actions');
const { loadConfig, launchOptions } = require('../core/config');

const ROOT = path.resolve(__dirname, '..');
const CASES_DIR = path.join(ROOT, 'cases');
const EVIDENCE_DIR = path.join(ROOT, 'evidence');

// ---------------- 命令行交互 ----------------
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let muted = false;
rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); };

// 用异步迭代器按行读取：输入会被缓存，不会因为提问时机丢行
const lines = rl[Symbol.asyncIterator]();
async function readLine(q, hidden) {
  rl.output.write(q);
  muted = hidden;
  const { value, done } = await lines.next();
  muted = false;
  if (hidden) rl.output.write('\n');
  if (done) throw new Error('输入已结束，未能读取到需要的信息');
  return value;
}
const ask = async (q) => (await readLine(q, false)).trim();
const askHidden = (q) => readLine(q, true);

// ---------------- 用例选择 ----------------
function listCases() {
  if (!fs.existsSync(CASES_DIR)) return [];
  return fs.readdirSync(CASES_DIR)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .map((f) => {
      const file = path.join(CASES_DIR, f);
      try {
        const doc = JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^﻿/, ''));
        return { file, doc };
      } catch (e) {
        return { file, error: e.message };
      }
    });
}

async function chooseCase(argPath) {
  if (argPath) {
    const file = path.resolve(argPath);
    return { file, doc: JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^﻿/, '')) };
  }
  const cases = listCases().filter((c) => !c.error);
  if (!cases.length) {
    console.log(`\ncases 文件夹里没有用例。请把 QA 提供的 .json 用例文件放到：\n  ${CASES_DIR}\n`);
    return null;
  }
  console.log(`\n在 ${CASES_DIR} 中找到 ${cases.length} 个用例：\n`);
  cases.forEach((c, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${c.doc.name}   [${path.basename(c.file)}]`);
    if (c.doc.description) console.log(`      ${c.doc.description}`);
  });
  const answer = await ask(`\n请输入要执行的用例编号（1-${cases.length}），直接回车执行第 1 个：`);
  const n = answer === '' ? 1 : Number(answer);
  if (!Number.isInteger(n) || n < 1 || n > cases.length) {
    console.log('编号无效。');
    return null;
  }
  return cases[n - 1];
}

// ---------------- 报告 ----------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function writeReport(dir, run) {
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(run, null, 2), 'utf-8');
  const rows = run.steps.map((s, i) => `
    <tr class="${s.status}">
      <td>${i + 1}</td>
      <td>${esc(s.title || '')}</td>
      <td>${esc(s.desc)}${s.error ? `<pre>${esc(s.error)}</pre>` : ''}</td>
      <td>${s.status === 'passed' ? '通过' : s.status === 'failed' ? '失败' : '未执行'}</td>
      <td>${s.screenshot ? `<a href="${esc(s.screenshot)}" target="_blank"><img src="${esc(s.screenshot)}"></a>` : ''}</td>
    </tr>`).join('');
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>${esc(run.caseName)} - 执行报告</title>
<style>
  body{font-family:system-ui,"Microsoft YaHei",sans-serif;margin:24px;color:#1f2937}
  h1{font-size:20px;margin:0 0 4px} .meta{color:#6b7280;font-size:13px;margin-bottom:16px}
  .badge{display:inline-block;padding:2px 10px;border-radius:12px;color:#fff;font-size:13px}
  .badge.passed{background:#16a34a} .badge.failed{background:#dc2626}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left;vertical-align:top}
  tr.failed td{background:#fef2f2} tr.skipped td{color:#9ca3af}
  img{max-width:240px;border:1px solid #e5e7eb;border-radius:4px}
  pre{white-space:pre-wrap;color:#b91c1c;font-size:12px;margin:6px 0 0}
  video{max-width:100%;margin-top:16px;border:1px solid #e5e7eb}
</style></head><body>
<h1>${esc(run.caseName)} <span class="badge ${run.status}">${run.status === 'passed' ? '通过' : '失败'}</span></h1>
<div class="meta">执行人电脑：${esc(run.machine)} · 开始：${esc(run.startedAt)} · 耗时：${run.durationSec}s · 用例来源：${esc(run.source)} · 版本：${esc(run.codeVersion)}</div>
<table><thead><tr><th>#</th><th>业务步骤</th><th>操作</th><th>结果</th><th>截图</th></tr></thead><tbody>${rows}</tbody></table>
${run.video ? `<video src="${esc(run.video)}" controls></video>` : ''}
<p class="meta">完整回放：trace.zip（QA 可用 npx playwright show-trace 打开逐步查看）</p>
</body></html>`;
  fs.writeFileSync(path.join(dir, 'report.html'), html, 'utf-8');
}

function openFile(file) {
  try {
    const { spawn } = require('child_process');
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', file], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [file], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* 打不开就算了，路径已经打印 */ }
}

// ---------------- 执行 ----------------
async function runCase({ file, doc }, config) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const caseId = path.basename(file, '.json');
  const dir = path.join(EVIDENCE_DIR, `${caseId}_${stamp}`);
  fs.mkdirSync(dir, { recursive: true });

  // 运行时向 PO 询问缺失的配置（例如密码），只保存在内存里
  const askConfig = async (key) => {
    const v = /password|secret|token/i.test(key)
      ? await askHidden(`请输入 ${key}（输入不显示）：`)
      : await ask(`请输入 ${key}：`);
    const parts = key.split('.');
    let o = config;
    for (const p of parts.slice(0, -1)) o = o[p] = o[p] || {};
    o[parts.at(-1)] = v;
    return v;
  };

  // 先把需要的配置问齐，避免执行到一半停下来
  if (!config.baseUrl) config.baseUrl = await ask('请输入系统地址（例如 https://xxx:8088）：');
  for (const key of doc.requiredConfig || []) {
    const v = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), config);
    if (v === undefined || v === '') await askConfig(key);
  }

  console.log(`\n▶ 开始执行：${doc.name}\n  证据目录：${dir}\n`);
  const run = {
    caseName: doc.name, caseFile: path.basename(file), source: doc.source, codeVersion: doc.codeVersion,
    machine: require('os').hostname(), startedAt: new Date().toLocaleString(), status: 'passed', steps: [],
  };
  const t0 = Date.now();

  const viewport = { width: 1280, height: 720 };
  let browser = await chromium.launch(launchOptions(config));
  let context, page;
  if (config.evidence?.video === true) {
    try {
      context = await browser.newContext({ viewport, recordVideo: { dir, size: viewport } });
      page = await context.newPage();
    } catch (e) {
      // 缺少 ffmpeg 时不影响执行，只是没有录像（截图和 trace 照常保存）。
      // 重新启动一个干净的浏览器，避免失败的上下文影响后续执行。
      await browser.close().catch(() => {});
      browser = await chromium.launch(launchOptions(config));
      context = undefined;
      console.log(`  （提示：无法录像，将只保存截图和 trace。原因：${String(e.message).split('\n')[0]}）\n`);
    }
  }
  if (!context) {
    context = await browser.newContext({ viewport });
    page = await context.newPage();
  }
  await context.tracing.start({ screenshots: true, snapshots: true });
  const ctx = { config, vars: {}, askConfig };

  let failed = false;
  for (let i = 0; i < doc.steps.length; i++) {
    const step = doc.steps[i];
    const desc = describeStep(step);
    const rec = { title: step.title, desc, status: 'skipped' };
    run.steps.push(rec);
    if (failed) continue;

    if (step.title) console.log(`  ■ ${step.title}`);
    process.stdout.write(`    [${i + 1}/${doc.steps.length}] ${desc} ... `);
    try {
      const r = await executeStep(page, step, ctx);
      rec.status = 'passed';
      if (step.action === 'read') rec.desc += `（读到：${r}）`;
      console.log('✔');
    } catch (e) {
      rec.status = 'failed';
      rec.error = String(e.message || e).split('\n').slice(0, 6).join('\n');
      failed = true;
      run.status = 'failed';
      console.log('✘');
      console.log(`\n    失败原因：${rec.error}\n`);
    }
    try {
      const shot = `step-${String(i + 1).padStart(2, '0')}.png`;
      await page.screenshot({ path: path.join(dir, shot) });
      rec.screenshot = shot;
    } catch { /* 页面已关闭等情况忽略 */ }
  }

  await context.tracing.stop({ path: path.join(dir, 'trace.zip') });
  const video = page.video();
  await context.close();
  await browser.close();
  if (video) {
    try {
      const vp = await video.path();
      const target = path.join(dir, 'video.webm');
      fs.renameSync(vp, target);
      run.video = 'video.webm';
    } catch { /* ignore */ }
  }
  run.durationSec = Math.round((Date.now() - t0) / 1000);
  writeReport(dir, run);

  console.log(run.status === 'passed' ? '\n✅ 执行通过' : '\n❌ 执行失败');
  console.log(`   报告：${path.join(dir, 'report.html')}\n`);
  return { run, dir };
}

async function main() {
  const config = loadConfig(ROOT);
  const chosen = await chooseCase(process.argv[2]);
  if (!chosen) return 2;
  const { run, dir } = await runCase(chosen, config);
  if (!process.env.OREO_NO_OPEN) openFile(path.join(dir, 'report.html'));
  return run.status === 'passed' ? 0 : 1;
}

main()
  .then((code) => { rl.close(); process.exitCode = code; })
  .catch((e) => {
    rl.close();
    console.error('\n运行器出错：', String((e && e.message) || e).split('\n').slice(0, 3).join('\n'));
    const first = String((e && e.message) || '').split('\n')[0];
    if (/browserType\.launch/.test(first) && /Executable doesn't exist|Chromium distribution|is not found/i.test(first)) {
      console.error('提示：找不到浏览器。请确认电脑上安装了 Edge，或在 config.local.json 的 browser.channel 中改成 "chrome"。');
    }
    process.exitCode = 3;
  });
