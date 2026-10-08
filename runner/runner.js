#!/usr/bin/env node
// PO-side runner: reads case files from cases/ and really executes them in the local browser.
// Usage:
//   double-click run-case.bat               -> list the cases, type a number to run one
//   drag a case .json onto run-case.bat     -> run that case directly
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

// ---------------- Command-line interaction ----------------
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let muted = false;
rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); };

// Read line by line through the async iterator: input is buffered, so no line is lost to prompt timing
const lines = rl[Symbol.asyncIterator]();
async function readLine(q, hidden) {
  rl.output.write(q);
  muted = hidden;
  const { value, done } = await lines.next();
  muted = false;
  if (hidden) rl.output.write('\n');
  if (done) throw new Error('Input ended before the required information was provided');
  return value;
}
const ask = async (q) => (await readLine(q, false)).trim();
const askHidden = (q) => readLine(q, true);

// ---------------- Case selection ----------------
function listCases() {
  if (!fs.existsSync(CASES_DIR)) return [];
  return fs.readdirSync(CASES_DIR)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .map((f) => {
      const file = path.join(CASES_DIR, f);
      try {
        const doc = JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, ''));
        return { file, doc };
      } catch (e) {
        return { file, error: e.message };
      }
    });
}

async function chooseCase(argPath) {
  if (argPath) {
    const file = path.resolve(argPath);
    return { file, doc: JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '')) };
  }
  const cases = listCases().filter((c) => !c.error);
  if (!cases.length) {
    console.log(`\nThere are no cases in the cases folder. Put the .json case files provided by QA into:\n  ${CASES_DIR}\n`);
    return null;
  }
  console.log(`\nFound ${cases.length} case(s) in ${CASES_DIR}:\n`);
  cases.forEach((c, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${c.doc.name}   [${path.basename(c.file)}]`);
    if (c.doc.description) console.log(`      ${c.doc.description}`);
  });
  const answer = await ask(`\nEnter the number of the case to run (1-${cases.length}), or just press Enter to run the first one: `);
  const n = answer === '' ? 1 : Number(answer);
  if (!Number.isInteger(n) || n < 1 || n > cases.length) {
    console.log('Invalid number.');
    return null;
  }
  return cases[n - 1];
}

// ---------------- Report ----------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Step titles written as Given / When / Then get the keyword emphasized, so the report reads like a BDD scenario
const bdd = (title) => esc(title).replace(/^(Given|When|Then|And|But)\b/, '<b class="kw">$1</b>');

function writeReport(dir, run) {
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(run, null, 2), 'utf-8');
  const rows = run.steps.map((s, i) => `
    <tr class="${s.status}">
      <td>${i + 1}</td>
      <td>${bdd(s.title || '')}</td>
      <td>${esc(s.desc)}${s.error ? `<pre>${esc(s.error)}</pre>` : ''}</td>
      <td>${s.status === 'passed' ? 'Passed' : s.status === 'failed' ? 'Failed' : 'Not run'}</td>
      <td>${s.screenshot ? `<a href="${esc(s.screenshot)}" target="_blank"><img src="${esc(s.screenshot)}"></a>` : ''}</td>
    </tr>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(run.caseName)} - Execution Report</title>
<style>
  body{font-family:system-ui,"Segoe UI",sans-serif;margin:24px;color:#1f2937}
  h1{font-size:20px;margin:0 0 4px} .kw{color:#1d4ed8} .desc{font-size:13px;margin:0 0 6px} .meta{color:#6b7280;font-size:13px;margin-bottom:16px}
  .badge{display:inline-block;padding:2px 10px;border-radius:12px;color:#fff;font-size:13px}
  .badge.passed{background:#16a34a} .badge.failed{background:#dc2626}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left;vertical-align:top}
  tr.failed td{background:#fef2f2} tr.skipped td{color:#9ca3af}
  img{max-width:240px;border:1px solid #e5e7eb;border-radius:4px}
  pre{white-space:pre-wrap;color:#b91c1c;font-size:12px;margin:6px 0 0}
  video{max-width:100%;margin-top:16px;border:1px solid #e5e7eb}
</style></head><body>
<h1><span class="kw">Scenario:</span> ${esc(run.caseName)} <span class="badge ${run.status}">${run.status === 'passed' ? 'Passed' : 'Failed'}</span></h1>
${run.description ? `<p class="desc">${esc(run.description)}</p>` : ''}
<div class="meta">Machine: ${esc(run.machine)} · Started: ${esc(run.startedAt)} · Duration: ${run.durationSec}s · Case source: ${esc(run.source)} · Version: ${esc(run.codeVersion)}</div>
<table><thead><tr><th>#</th><th>Step</th><th>Action</th><th>Result</th><th>Screenshot</th></tr></thead><tbody>${rows}</tbody></table>
${run.video ? `<video src="${esc(run.video)}" controls></video>` : ''}
<p class="meta">Full replay: trace.zip (QA can open it with npx playwright show-trace to inspect step by step)</p>
</body></html>`;
  fs.writeFileSync(path.join(dir, 'report.html'), html, 'utf-8');
}

function openFile(file) {
  try {
    const { spawn } = require('child_process');
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', file], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [file], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* fine if it cannot be opened; the path has already been printed */ }
}

// ---------------- Saving settings ----------------
// Update only the given keys in the config file and leave everything else in it untouched.
function saveConfig(file, values) {
  const doc = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '')) : {};
  for (const [key, v] of Object.entries(values)) {
    const parts = key.split('.');
    let o = doc;
    for (const p of parts.slice(0, -1)) o = o[p] = o[p] && typeof o[p] === 'object' ? o[p] : {};
    o[parts.at(-1)] = v;
  }
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
}

// ---------------- Execution ----------------
async function runCase({ file, doc }, config) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const caseId = path.basename(file, '.json');
  const dir = path.join(EVIDENCE_DIR, `${caseId}_${stamp}`);
  fs.mkdirSync(dir, { recursive: true });

  const isSecret = (key) => /password|secret|token/i.test(key);
  const getCfg = (key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), config);
  const setCfg = (key, v) => {
    const parts = key.split('.');
    let o = config;
    for (const p of parts.slice(0, -1)) o = o[p] = o[p] || {};
    o[parts.at(-1)] = v;
  };
  const isEmpty = (v) => v === undefined || v === '';
  const required = doc.requiredConfig || [];
  const toSave = {}; // non-secret values typed in during this run, offered for saving afterwards

  // Ask the PO at run time for missing config (e.g. passwords); kept in memory only
  const askConfig = async (key) => {
    const v = isSecret(key)
      ? await askHidden(`Enter ${key} (input is hidden): `)
      : await ask(`Enter ${key}: `);
    setCfg(key, v);
    if (!isSecret(key) && v !== '') toSave[key] = v;
    return v;
  };

  // When settings are already provided, show them and let the PO switch environment or account
  // for this run without editing any file.
  const editable = ['baseUrl', ...required.filter((k) => !isSecret(k))];
  if (editable.some((k) => !isEmpty(getCfg(k)))) {
    console.log('\nSettings for this run:');
    for (const k of editable) console.log(`  ${k}: ${isEmpty(getCfg(k)) ? '(not set)' : getCfg(k)}`);
    const answer = await ask('\nPress Enter to continue with these settings, or type C to change the environment or account: ');
    if (answer.toLowerCase() === 'c') {
      console.log('\nType a new value, or just press Enter to keep the current one.');
      const secrets = required.filter(isSecret);
      for (const k of editable) {
        const cur = getCfg(k);
        const v = await ask(`  ${k} [${isEmpty(cur) ? 'not set' : cur}]: `);
        if (v === '' || v === cur) continue;
        setCfg(k, v);
        toSave[k] = v;
        // A saved password belongs to the old environment/account: drop it so it is asked for again
        // instead of being sent to the wrong place.
        const scope = k === 'baseUrl' ? '' : k.slice(0, k.lastIndexOf('.') + 1);
        for (const s of secrets) if (s.startsWith(scope)) { setCfg(s, ''); toSave[s] = ''; }
      }
    }
  }

  // Collect all required config up front so the run does not stop halfway
  if (!config.baseUrl) {
    config.baseUrl = await ask('Enter the system address (e.g. https://xxx:8088): ');
    if (config.baseUrl) toSave.baseUrl = config.baseUrl;
  }
  for (const key of required) {
    if (isEmpty(getCfg(key))) await askConfig(key);
  }

  // Offer to remember what was typed in, so the next run starts from it. Passwords are never written:
  // the only secret entries in toSave are blanked ones, which remove a password that no longer matches.
  if (Object.keys(toSave).some((k) => !isSecret(k))) {
    const name = path.basename(config.__file);
    const answer = await ask(`\nSave the address and account to ${name} for next time? Passwords are not saved. (y/N): `);
    if (/^y(es)?$/i.test(answer)) {
      try {
        saveConfig(config.__file, toSave);
        console.log(`  Saved to ${config.__file}`);
      } catch (e) {
        console.log(`  Could not save (${String(e.message).split('\n')[0]}); the settings still apply to this run.`);
      }
    } else {
      console.log('  Not saved; the settings apply to this run only.');
    }
  }

  console.log(`\n▶ Scenario: ${doc.name}\n  Evidence folder: ${dir}\n`);
  const run = {
    caseName: doc.name, description: doc.description, caseFile: path.basename(file), source: doc.source, codeVersion: doc.codeVersion,
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
      // Missing ffmpeg does not block execution; there is just no video (screenshots and trace are still saved).
      // Relaunch a clean browser so the failed context cannot affect the rest of the run.
      await browser.close().catch(() => {});
      browser = await chromium.launch(launchOptions(config));
      context = undefined;
      console.log(`  (Note: video recording is unavailable; only screenshots and trace will be saved. Reason: ${String(e.message).split('\n')[0]})\n`);
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
      if (step.action === 'read') rec.desc += ` (read: ${r})`;
      console.log('✔');
    } catch (e) {
      rec.status = 'failed';
      rec.error = String(e.message || e).split('\n').slice(0, 6).join('\n');
      failed = true;
      run.status = 'failed';
      console.log('✘');
      console.log(`\n    Failure reason: ${rec.error}\n`);
    }
    try {
      const shot = `step-${String(i + 1).padStart(2, '0')}.png`;
      await page.screenshot({ path: path.join(dir, shot) });
      rec.screenshot = shot;
    } catch { /* ignore cases such as the page already being closed */ }
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

  console.log(run.status === 'passed' ? '\n✅ Run passed' : '\n❌ Run failed');
  console.log(`   Report: ${path.join(dir, 'report.html')}\n`);
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
    console.error('\nRunner error:', String((e && e.message) || e).split('\n').slice(0, 3).join('\n'));
    const first = String((e && e.message) || '').split('\n')[0];
    if (/browserType\.launch/.test(first) && /Executable doesn't exist|Chromium distribution|is not found/i.test(first)) {
      console.error('Hint: no browser was found. Make sure Edge is installed on this computer, or change browser.channel in config.local.json to "chrome".');
    }
    process.exitCode = 3;
  });
