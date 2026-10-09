#!/usr/bin/env node
// PO-side runner: reads case files from cases/ and really executes them in the local browser.
// Usage:
//   double-click run-case.bat               -> browse the folders under cases/ or search, type a number to run a case
//   drag a case .json onto run-case.bat     -> run that case directly
//   node runner/runner.js cases/<folder>/xxx.json
//   double-click view-trace.bat             -> serve reports and full replays (trace viewer) of earlier runs

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('@playwright/test');
const { FORMAT_VERSION, executeStep, savedValues, describeStep, showPlaceholders, resolveDataFile, dataFilesOf } = require('../core/actions');
const { loadConfig, launchOptions, secretEntries } = require('../core/config');

const ROOT = path.resolve(__dirname, '..');
const CASES_DIR = path.join(ROOT, 'cases');
const EVIDENCE_DIR = path.join(ROOT, 'evidence');

// ---------------- Command-line interaction ----------------
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let muted = false;
// While the case is running on a real console, typed keys are not echoed (they would garble the step log)
let quietKeys = false;
rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); };
const interactive = !!process.stdin.isTTY;

// Read line by line through the async iterator: input is buffered, so no line is lost to prompt timing
const lines = rl[Symbol.asyncIterator]();
let typedLines = 0, readLines = 0;
rl.on('line', () => { typedLines++; });
async function readLine(q, hidden, optional) {
  rl.output.write(q);
  muted = hidden;
  const { value, done } = await lines.next();
  readLines++;
  muted = quietKeys;
  if (hidden) rl.output.write('\n');
  if (done) {
    if (optional) { rl.output.write('\n'); return ''; }
    throw new Error('Input ended before the required information was provided');
  }
  return value;
}
const ask = async (q) => (await readLine(q, false)).trim();
const askHidden = (q) => readLine(q, true);
// For prompts that have a default: when the input has ended (piped input, closed window) the default is used
const askOptional = async (q) => (await readLine(q, false, true)).trim();

// Throw away whatever was typed while the case was running, so that a stray Enter cannot answer the next prompt.
// Only on a real console: piped input is buffered up front and every line of it is an intended answer.
async function discardTyped() {
  if (!interactive) return;
  while (readLines < typedLines) { await lines.next(); readLines++; }
  rl.line = '';
  rl.cursor = 0;
}
function setQuietKeys(on) { quietKeys = interactive && on; muted = quietKeys; }
const fmtSec = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`);

// ---------------- Case selection ----------------
// Every case file under cases/, at any depth. dir is the folder of a case inside cases/ ('' = directly in it):
// QA exports one folder per spec, i.e. per lifecycle event (cases/trade-cancellation/TC-....json)
function listCases(dir = CASES_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) // the same order on every computer
    .flatMap((e) => {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) return listCases(file);
      if (!e.name.toLowerCase().endsWith('.json')) return [];
      const rel = path.relative(CASES_DIR, file).split(path.sep);
      const where = { file, id: rel.at(-1).slice(0, -'.json'.length), dir: rel.slice(0, -1).join('/') };
      try {
        return [{ ...where, doc: JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '')) }];
      } catch (err) {
        return [{ ...where, error: err.message }];
      }
    });
}

// A list longer than this is cut: with hundreds of cases the PO narrows it by typing text instead of scrolling
const LIST_MAX = 40;
const inFolder = (c, dir) => !dir || c.dir === dir || c.dir.startsWith(`${dir}/`);

// What a folder shows: its sub-folders (with the number of cases below each), then the cases directly in it
function folderEntries(cases, dir) {
  const folders = new Map();
  const here = [];
  for (const c of cases.filter((x) => inFolder(x, dir))) {
    if (c.dir === dir) { here.push(c); continue; }
    const name = c.dir.slice(dir ? dir.length + 1 : 0).split('/')[0];
    folders.set(name, (folders.get(name) || 0) + 1);
  }
  return [...[...folders].map(([name, count]) => ({ folder: dir ? `${dir}/${name}` : name, name, count })), ...here];
}

// The cases in a folder (and below it) that contain every word typed, in their ID, folder, name or description
function searchCases(cases, dir, text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  return cases.filter((c) => {
    if (!inFolder(c, dir)) return false;
    const hay = `${c.dir} ${c.id} ${c.doc.name || ''} ${c.doc.description || ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

function printEntries(entries, dir) {
  const shown = entries.slice(0, LIST_MAX);
  const detailed = shown.length <= 20; // descriptions only in a short list, a long one stays one line per case
  shown.forEach((e, i) => {
    const no = `  ${String(i + 1).padStart(2)}. `;
    if (e.folder) {
      console.log(`${no}${e.name}/   (${e.count} case${e.count === 1 ? '' : 's'})`);
      return;
    }
    const name = e.doc.name || e.id;
    console.log(`${no}${name}${name.includes(e.id) ? '' : `   [${e.id}.json]`}${e.dir === dir ? '' : `   (in ${e.dir})`}`);
    if (detailed && e.doc.description) console.log(`      ${e.doc.description}`);
  });
  if (entries.length > shown.length) console.log(`\n  ... and ${entries.length - shown.length} more. Type text to narrow the list.`);
  return shown;
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
  console.log(`\nFound ${cases.length} case(s) in ${CASES_DIR}:`);

  // A folder that holds nothing but one sub-folder is not worth a question
  const open = (dir) => {
    for (;;) {
      const entries = folderEntries(cases, dir);
      if (entries.length !== 1 || !entries[0].folder) return dir;
      dir = entries[0].folder;
    }
  };
  let dir = open('');
  const back = []; // the folders the PO came through, for B
  let search = '';
  let shown, question;
  for (let list = true; ; ) {
    if (list) {
      const entries = search ? searchCases(cases, dir, search) : folderEntries(cases, dir);
      if (search) console.log(`\n${entries.length} case(s) match "${search}"${dir ? ` in ${dir}` : ''}:\n`);
      else console.log(dir ? `\n${dir}/  (${cases.filter((c) => inFolder(c, dir)).length} case(s)):\n` : '');
      shown = printEntries(entries, dir);
      const hasFolders = shown.some((e) => e.folder), hasCases = shown.some((e) => !e.folder);
      const what = hasFolders && hasCases ? 'open a folder or run a case' : hasFolders ? 'open a folder' : 'run a case';
      question = `\nEnter a number to ${what} (${shown.length > 1 ? `1-${shown.length}; ` : ''}just Enter = 1), `
        + `or type ${search ? 'other text to search again' : 'text to search, e.g. a product or part of a case ID'}`
        + `${search || back.length ? ', or B to go back' : ''}: `;
    }
    const answer = await ask(question);
    list = true;

    if ((search || back.length) && /^b$/i.test(answer)) {
      if (search) search = ''; else dir = back.pop();
      continue;
    }
    // A number picks from the list; anything else is searched for, also digits with a leading zero such as 001
    if (answer !== '' && !/^[1-9]\d*$/.test(answer)) {
      if (searchCases(cases, dir, answer).length) { search = answer; continue; }
      console.log(`\nNo case matches "${answer}"${dir ? ` in ${dir}` : ''}.`);
      list = false; // ask again under the list that is already on the screen
      continue;
    }
    const picked = shown[answer === '' ? 0 : Number(answer) - 1];
    if (!picked) {
      console.log(`\nThere is no number ${answer} in this list.`);
      list = false;
      continue;
    }
    if (!picked.folder) {
      console.log(`\nSelected: ${picked.doc.name || picked.id}`);
      return picked;
    }
    back.push(dir);
    dir = open(picked.folder);
    search = '';
  }
}

// ---------------- Report ----------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Step titles written as Given / When / Then get the keyword emphasized, so the report reads like a BDD scenario
const bdd = (title) => esc(title).replace(/^(Given|When|Then|And|But)\b/, '<b class="kw">$1</b>');

const STATUS_TEXT = { passed: 'Passed', failed: 'Failed', skipped: 'Not run' };

// Group the recorded actions by BDD step: a titled action starts a new group and the untitled ones after it belong to it.
// A substep (a step of the flow behind the case's step) is a heading inside the group's action list
function groupSteps(steps) {
  const groups = [];
  steps.forEach((s, i) => {
    if (s.title || !groups.length) groups.push({ title: s.title || '', actions: [] });
    groups[groups.length - 1].actions.push({ ...s, no: i + 1 });
  });
  for (const g of groups) {
    const failed = g.actions.find((a) => a.status === 'failed');
    g.status = failed ? 'failed' : g.actions.every((a) => a.status === 'passed') ? 'passed' : g.actions.some((a) => a.status === 'passed') ? 'failed' : 'skipped';
    g.error = failed && failed.error;
    // The screenshot that represents the step: where it failed, otherwise how the page looked when it finished
    g.screenshot = (failed || [...g.actions].reverse().find((a) => a.screenshot) || {}).screenshot;
    // What the step read or received (e.g. the ID of a trade it created), shown in its row
    g.saved = Object.assign({}, ...g.actions.map((a) => a.saved || {}));
    g.pausedSec = g.actions.reduce((sum, a) => sum + (a.pausedSec || 0), 0);
    g.paused = g.actions.some((a) => a.pausedSec !== undefined);
  }
  return groups;
}

function writeReport(dir, run) {
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(run, null, 2), 'utf-8');
  const shot = (file) => (file ? `<a href="${esc(file)}" target="_blank"><img src="${esc(file)}"></a>` : '');
  const groups = groupSteps(run.steps);
  const rows = groups.map((g, i) => {
    const actions = g.actions.map((a) => `
          ${a.substep ? `<li class="sub">${bdd(a.substep)}</li>` : ''}<li class="${a.status}"><span class="no">${a.no}.</span> ${esc(a.desc)} <span class="st">${STATUS_TEXT[a.status]}</span>${a.screenshot ? ` <a href="${esc(a.screenshot)}" target="_blank">screenshot</a>` : ''}${a.pausedSec !== undefined ? `<div class="paused">Paused for ${fmtSec(a.pausedSec)} after this action</div>` : ''}</li>`).join('');
    return `
    <tr class="${g.status}">
      <td>${i + 1}</td>
      <td><div class="step">${bdd(g.title) || esc(g.actions[0].desc)}</div>${Object.entries(g.saved).map(([k, v]) => `<div class="saved">${esc(k)}: <b>${esc(v)}</b></div>`).join('')}${g.error ? `<pre>${esc(g.error)}</pre>` : ''}${g.paused ? `<div class="paused">Paused for ${fmtSec(g.pausedSec)} during this step</div>` : ''}
        <details${g.status === 'failed' ? ' open' : ''}><summary>${g.actions.length} action${g.actions.length === 1 ? '' : 's'}</summary><ul>${actions}</ul></details></td>
      <td>${STATUS_TEXT[g.status]}</td>
      <td>${shot(g.screenshot)}</td>
    </tr>`;
  }).join('');
  const count = (st) => groups.filter((g) => g.status === st).length;
  const summary = `${groups.length} step${groups.length === 1 ? '' : 's'}: ${count('passed')} passed${count('failed') ? `, ${count('failed')} failed` : ''}${count('skipped') ? `, ${count('skipped')} not run` : ''}`;
  // The data the case ran with; a value the PO changed for this run is flagged, with the value of the case file
  const caseData = run.caseData && run.caseData.length ? `<table class="data"><caption>Case data</caption><tbody>${run.caseData.map((d) => `
    <tr><td>${esc(d.name)}</td><td>${esc(d.value)}${d.changedFrom !== undefined ? ` <span class="changed">changed for this run (case file: ${esc(d.changedFrom)})</span>` : ''}</td></tr>`).join('')}
</tbody></table>
` : '';
  // What the run read or received from the system, above all the IDs of what it created
  const values = Object.entries(run.values || {});
  const runValues = values.length ? `<table class="data"><caption>Values from this run</caption><tbody>${values.map(([k, v]) => `
    <tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}
</tbody></table>
` : '';
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
  .step{font-size:14px} li.sub{list-style:none;margin:6px 0 2px -14px;font-weight:600;color:#374151}
  details{margin-top:6px;color:#4b5563;font-size:12px} summary{cursor:pointer;color:#6b7280}
  ul{list-style:none;margin:6px 0 0;padding:0} li{padding:2px 0} li.skipped{color:#9ca3af}
  .no{color:#9ca3af} .st{color:#16a34a} li.failed .st{color:#dc2626} li.skipped .st{color:#9ca3af}
  img{max-width:240px;border:1px solid #e5e7eb;border-radius:4px}
  pre{white-space:pre-wrap;color:#b91c1c;font-size:12px;margin:6px 0 0}
  .paused{color:#b45309;font-size:12px;margin-top:6px} .saved{font-size:12px;margin-top:4px;color:#374151}
  table.data{width:auto;margin-bottom:16px} table.data caption{text-align:left;font-weight:600;padding:0 8px 2px}
  table.data td{padding:4px 8px} table.data td:first-child{color:#6b7280} .changed{color:#b45309}
  video{max-width:100%;margin-top:16px;border:1px solid #e5e7eb}
</style></head><body>
<h1><span class="kw">Scenario:</span> ${esc(run.caseName)} <span class="badge ${run.status}">${run.status === 'passed' ? 'Passed' : 'Failed'}</span></h1>
${run.description ? `<p class="desc">${esc(run.description)}</p>` : ''}
<div class="meta">${summary} · Machine: ${esc(run.machine)} · Started: ${esc(run.startedAt)} · Duration: ${fmtSec(run.durationSec)}${run.pausedSec ? ` (plus ${fmtSec(run.pausedSec)} paused)` : ''}${run.stepByStep ? ' · Mode: step by step' : ''} · Case source: ${esc(run.source)} · Version: ${esc(run.codeVersion)}</div>
${caseData}${runValues}<table><thead><tr><th>#</th><th>Step</th><th>Result</th><th>Screenshot</th></tr></thead><tbody>${rows}</tbody></table>
${run.video ? `<video src="${esc(run.video)}" controls></video>` : ''}
<p class="meta">Full replay: <a href="${esc(run.traceUrl)}">Open trace viewer</a><br>
Opens the trace viewer (every action with page snapshots, console and network). The link works while the runner window is still open; later, double-click view-trace.bat first. The same data is in trace.zip in this folder.</p>
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

// ---------------- Report and trace viewer links ----------------
// Playwright's trace viewer is a static web app shipped inside playwright-core, but it needs http (a service
// worker), so a file:// link cannot open it. A tiny local-only server serves the viewer and the evidence
// folder, which gives every report and every trace.zip a URL.
const VIEW_HOST = '127.0.0.1';
const viewPort = (config) => Number(process.env.OREO_VIEW_PORT) || Number(config?.evidence?.viewPort) || 9400;
const viewBase = (config) => `http://${VIEW_HOST}:${viewPort(config)}`;
const reportUrl = (config, runDir) => `${viewBase(config)}/evidence/${encodeURIComponent(runDir)}/report.html`;
// By default the viewer bundled with playwright-core is used, which needs no internet access. With
// "evidence": { "traceViewer": "official" } the link opens https://trace.playwright.dev instead. Nothing is
// uploaded either way: the viewer runs in the browser and reads trace.zip from this computer.
const OFFICIAL_VIEWER = 'https://trace.playwright.dev';
const officialViewer = (config) => config?.evidence?.traceViewer === 'official';
const traceUrl = (config, runDir) =>
  `${officialViewer(config) ? OFFICIAL_VIEWER + '/' : viewBase(config) + '/trace/index.html'}?trace=${encodeURIComponent(`${viewBase(config)}/evidence/${encodeURIComponent(runDir)}/trace.zip`)}`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.zip': 'application/zip', '.ttf': 'font/ttf', '.webm': 'video/webm', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
};

function evidenceIndex(config) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const runs = fs.existsSync(EVIDENCE_DIR)
    ? fs.readdirSync(EVIDENCE_DIR).filter((d) => fs.existsSync(path.join(EVIDENCE_DIR, d, 'report.html')))
        .sort((a, b) => b.slice(-19).localeCompare(a.slice(-19))) // newest first: folder names end with the run timestamp
    : [];
  const rows = runs.map((d) => {
    let status = '';
    try { status = JSON.parse(fs.readFileSync(path.join(EVIDENCE_DIR, d, 'result.json'), 'utf-8')).status; } catch { /* older run */ }
    const trace = fs.existsSync(path.join(EVIDENCE_DIR, d, 'trace.zip')) ? `<a href="${esc(traceUrl(config, d))}">Full replay</a>` : '';
    return `<tr><td>${esc(d)}</td><td>${esc(status)}</td><td><a href="${esc(reportUrl(config, d))}">Report</a></td><td>${trace}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>UAT runs</title>
<style>body{font-family:system-ui;margin:24px;color:#111}table{border-collapse:collapse;font-size:13px}td,th{padding:6px 14px;border-bottom:1px solid #e5e7eb;text-align:left}</style></head>
<body><h1>UAT runs</h1>${runs.length ? `<table><thead><tr><th>Run</th><th>Result</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No runs yet.</p>'}</body></html>`;
}

/** Resolves to the server, or to null when the port is taken (normally by another runner window that already serves the links) */
function startViewServer(config) {
  const viewerDir = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib', 'vite', 'traceViewer');
  const roots = { trace: viewerDir, evidence: EVIDENCE_DIR };
  // the official viewer is another origin, so it may read the evidence only when it has been chosen
  const cors = officialViewer(config)
    ? { 'access-control-allow-origin': OFFICIAL_VIEWER, 'access-control-allow-private-network': 'true', 'access-control-allow-methods': 'GET, HEAD, OPTIONS', 'access-control-allow-headers': '*' }
    : {};
  const server = require('http').createServer((req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, viewBase(config)).pathname); } catch { res.writeHead(400); return res.end(); }
    if (pathname === '/') { res.writeHead(200, { 'content-type': MIME['.html'] }); return res.end(evidenceIndex(config)); }
    const [, top, ...rest] = pathname.split('/');
    const root = roots[top];
    const file = root && path.resolve(root, rest.join('/'));
    // never serve anything outside the viewer and evidence folders
    if (!file || !file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store', ...(top === 'evidence' ? cors : {}) });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.once('error', () => resolve(null));
    server.listen(viewPort(config), VIEW_HOST, () => resolve(server));
  });
}

/** Keep the links alive until the PO presses Enter (console only: with piped input there is nobody to wait for) */
async function serveUntilEnter(config, pendingEnter) {
  const server = await startViewServer(config);
  if (!server) {
    console.log(`   (Port ${viewPort(config)} is already in use - normally by another runner or view-trace window, which keeps the links working.)`);
    return;
  }
  // pendingEnter: a prompt that is already waiting for Enter (asking again would need a second Enter)
  if (pendingEnter) { console.log('\nThe links above work while this window stays open. Press Enter to close.'); await pendingEnter; }
  else if (interactive) await askOptional('\nThe links above work while this window stays open. Press Enter to close: ');
  server.closeAllConnections?.();
  server.close();
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
  if (Number(doc.formatVersion) > FORMAT_VERSION) {
    throw new Error(`${path.basename(file)} is case format version ${doc.formatVersion}; this runner supports up to version ${FORMAT_VERSION}. Ask QA for the current UAT-Runner package.`);
  }
  // Fail before asking for anything if a file the case uploads or sends to the API did not come with the package
  for (const s of doc.steps) for (const f of dataFilesOf(s)) resolveDataFile(ROOT, f);

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
      : await ask(key === 'apiBaseUrl' ? 'Enter the API address, with its path prefix (e.g. https://xxx:port/api/v1): ' : `Enter ${key}: `);
    setCfg(key, v);
    if (!isSecret(key) && v !== '') toSave[key] = v;
    return v;
  };

  // Case data (version 2 case files): the values the case types or selects. The PO can change them for this run;
  // the case file itself is never modified.
  const params = Object.fromEntries(Object.entries(doc.params || {}).map(([k, v]) => [k, String(v)]));
  const paramNames = Object.keys(params);
  const showData = (v) => showPlaceholders(v); // a value that points at local config is shown by its name

  // When settings are already provided, show them and let the PO switch environment or account
  // for this run without editing any file.
  const editable = ['baseUrl', ...required.filter((k) => !isSecret(k))];
  const hasSettings = editable.some((k) => !isEmpty(getCfg(k)));
  if (hasSettings || paramNames.length) {
    if (hasSettings) {
      console.log('\nSettings for this run:');
      for (const k of editable) console.log(`  ${k}: ${isEmpty(getCfg(k)) ? '(not set)' : getCfg(k)}`);
    }
    if (paramNames.length) {
      console.log('\nCase data:');
      for (const k of paramNames) console.log(`  ${k}: ${showData(params[k])}`);
    }
    const choices = [hasSettings && 'C to change the environment or account', paramNames.length && 'D to change the case data'].filter(Boolean).join(', ');
    const answer = (await ask(`\nPress Enter to continue${hasSettings ? ' with these settings' : ''}, or type ${choices}: `)).toLowerCase();
    const chose = (letter) => /^[cd\s,+]+$/.test(answer) && answer.includes(letter);
    if (hasSettings && chose('c')) {
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
    if (paramNames.length && chose('d')) {
      console.log('\nType a new value, or just press Enter to keep the current one. Changes apply to this run only.');
      for (const k of paramNames) {
        const v = await ask(`  ${k} [${showData(params[k])}]: `);
        if (v !== '') params[k] = v;
      }
    }
  }
  const caseData = paramNames.map((name) => {
    const original = String(doc.params[name]);
    return { name, value: showData(params[name]), ...(params[name] !== original ? { changedFrom: showData(original) } : {}) };
  });

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

  // Step-by-step mode stops after each titled group (Given / When / Then ...) and each substep, so the PO can look at the page
  const stepByStep = /^s/i.test(await askOptional('\nPress Enter to run, or type S to run step by step (pause after each Given / When / Then): '));

  console.log(`\n▶ Scenario: ${doc.name}\n  Evidence folder: ${dir}`);
  if (stepByStep) console.log('  Mode: step by step');
  for (const d of caseData) if (d.changedFrom !== undefined) console.log(`  Case data changed for this run: ${d.name} = ${d.value} (case file: ${d.changedFrom})`);
  if (interactive) console.log('  Tip: press P in this window at any time to pause after the current step.');
  console.log('');
  const run = {
    caseName: doc.name, description: doc.description, caseFile: path.basename(file), source: doc.source, codeVersion: doc.codeVersion,
    machine: require('os').hostname(), startedAt: new Date().toLocaleString(), status: 'passed', stepByStep, pausedSec: 0, steps: [],
    values: {}, // what the steps read or received during the run (name -> value), e.g. createdTradeId
    traceUrl: traceUrl(config, path.basename(dir)),
    ...(caseData.length ? { caseData } : {}),
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
  const ctx = { config, vars: {}, params, askConfig, rootDir: ROOT };

  // Pausing only ever happens between steps, never in the middle of an action.
  // P is picked up as a single key press (console only); the run stops once the current step has finished.
  let pauseRequested = false, pausing = false;
  const onKey = (s, key) => {
    if (pausing || pauseRequested || !key || key.ctrl || key.meta || key.name !== 'p') return;
    pauseRequested = true;
    console.log('\n    (Pause requested: the run will stop after the current step)');
  };
  if (interactive) process.stdin.on('keypress', onKey);
  setQuietKeys(true);
  let pausedMs = 0;
  const pause = async (rec, n) => {
    pausing = true;
    await discardTyped();
    setQuietKeys(false);
    console.log(`\n  ⏸ Paused after step ${n}/${doc.steps.length}. The browser stays open so you can look at the page.`);
    console.log('    Note: operating the page by hand, or waiting until the session expires, may make the remaining steps fail.');
    const t = Date.now();
    await askOptional('    Press Enter to continue: ');
    const ms = Date.now() - t;
    pausedMs += ms;
    rec.pausedSec = Math.round(ms / 1000);
    console.log('');
    setQuietKeys(true);
    pauseRequested = false;
    pausing = false;
  };

  let failed = false;
  for (let i = 0; i < doc.steps.length; i++) {
    const step = doc.steps[i];
    const desc = describeStep(step, ctx.vars, ctx.params);
    const rec = { title: step.title, desc, status: 'skipped' };
    if (step.substep) rec.substep = step.substep;
    run.steps.push(rec);
    if (failed) continue;

    if (step.title) console.log(`  ■ ${step.title}`);
    if (step.substep) console.log(`    - ${step.substep}`);
    process.stdout.write(`    [${i + 1}/${doc.steps.length}] ${desc} ... `);
    try {
      const r = await executeStep(page, step, ctx);
      rec.status = 'passed';
      if (step.action === 'read') rec.desc += ` (read: ${r})`;
      else if (step.capture) rec.desc += ` (captured: ${r})`;
      else if (step.action === 'api' && r && Object.keys(r).length) rec.desc += ` (saved: ${Object.entries(r).map(([k, v]) => `${k} = ${v}`).join(', ')})`;
      console.log('✔');
      // What the step read or received, e.g. the ID of the trade it created: shown right away and kept for the report
      const saved = savedValues(step, r);
      if (Object.keys(saved).length) {
        rec.saved = saved;
        Object.assign(run.values, saved);
        for (const [k, v] of Object.entries(saved)) console.log(`          ${k} = ${v}`);
      }
    } catch (e) {
      rec.status = 'failed';
      rec.error = String(e.message || e).split('\n').slice(0, 6).join('\n');
      failed = true;
      run.status = 'failed';
      console.log('✘');
      console.log(`\n    Failure reason: ${rec.error}\n`);
    }
    // An API call does not touch the page, so it has no picture: what it sent and received is in the trace
    if (step.action !== 'api') {
      try {
        const shot = `step-${String(i + 1).padStart(2, '0')}.png`;
        await page.screenshot({ path: path.join(dir, shot) });
        rec.screenshot = shot;
      } catch { /* ignore cases such as the page already being closed */ }
    }

    const next = doc.steps[i + 1];
    if (!failed && next && (pauseRequested || (stepByStep && (next.title || next.substep)))) await pause(rec, i + 1);
  }
  if (interactive) process.stdin.off('keypress', onKey);
  setQuietKeys(false);

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
  // Time spent paused is reported separately, so the duration reflects the run itself
  run.pausedSec = Math.round(pausedMs / 1000);
  run.durationSec = Math.round((Date.now() - t0 - pausedMs) / 1000);
  const values = Object.entries(run.values);
  if (!values.length) delete run.values;
  writeReport(dir, run);

  console.log(run.status === 'passed' ? '\n✅ Run passed' : '\n❌ Run failed');
  for (const [k, v] of values) console.log(`   ${k}: ${v}`);
  console.log(`   Report:      ${reportUrl(config, path.basename(dir))}`);
  console.log('   Full replay: "Open trace viewer" link at the bottom of the report');
  console.log(`   Folder:      ${dir}`);
  return { run, dir };
}

// ---------------- Recording a manual session ----------------
// No case is run: the browser opens with tracing on and the PO works by hand, e.g. to reproduce a bug. The trace
// only knows about actions made through Playwright, so a script in the page reports what the user does and each
// report becomes a named entry in the trace (with a page snapshot) and a row in the report.

// Runs inside every page. Listens on the document in the capture phase and reads composedPath(), because the
// OREO controls live in open shadow roots.
function watchUserActions() {
  if (window.__oreoWatching) return;
  window.__oreoWatching = true;
  // a long text means a container was hit, not a control: its text would only mislead
  const clean = (s) => { const t = String(s || '').trim().replace(/\s+/g, ' '); return t.length > 60 ? '' : t; };
  const describe = (ev) => {
    const els = ev.composedPath().filter((n) => n.nodeType === 1);
    const el = els[0];
    if (!el) return null;
    const holder = els.find((n) => n.getAttribute('data-testid'));
    const control = els.find((n) => /^(BUTTON|A|LABEL)$/.test(n.tagName) || /button|menuitem|option|link|tab|checkbox|radio/.test(n.getAttribute('role') || '') || /-/.test(n.tagName)) || el;
    return {
      el,
      testId: holder ? holder.getAttribute('data-testid') : '',
      // a button inside a shadow root has no text of its own (it is slotted), so fall back to the host
      text: clean(control.innerText) || clean(holder && holder.innerText) || clean(el.getAttribute('aria-label') || el.getAttribute('placeholder')),
      tag: el.tagName.toLowerCase(),
    };
  };
  const send = (kind, d, extra) => {
    if (!d || typeof window.__oreoRecord !== 'function') return;
    window.__oreoRecord({ kind, testId: d.testId, text: d.text, tag: d.tag, path: location.pathname, ...extra });
  };
  // Typed text: "change" does not leave a shadow root, so the field being edited is remembered from "input"
  // (which does) and reported once, before the next thing the user does.
  let editing = null;
  const flush = () => {
    if (!editing) return;
    const { el, d } = editing;
    editing = null;
    const value = el.type === 'password' ? '******'
      : el.type === 'file' ? Array.from(el.files || []).map((f) => f.name).join(', ')
      : el.type === 'checkbox' || el.type === 'radio' ? (el.checked ? 'checked' : 'unchecked')
      : String(el.value).slice(0, 2000);
    send('change', d, { value, text: '' });
  };
  const edited = (ev) => {
    const el = ev.composedPath()[0];
    if (!el || !('value' in el)) return;
    if (editing && editing.el !== el) flush();
    editing = { el, d: describe(ev) };
  };
  document.addEventListener('input', edited, true);
  document.addEventListener('change', (ev) => { edited(ev); flush(); }, true);
  document.addEventListener('focusout', (ev) => { if (editing && editing.el === ev.composedPath()[0]) flush(); }, true);
  window.addEventListener('pagehide', flush, true);
  // Clicks are taken at mousedown: a dropdown often closes on mousedown, and the click then lands on whatever
  // is behind it. A click without a mouse (keyboard, detail 0) has no mousedown, so it is taken from "click".
  document.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    if (editing && !ev.composedPath().includes(editing.el)) flush();
    send('click', describe(ev));
  }, true);
  document.addEventListener('click', (ev) => { if (ev.detail === 0 && ev.isTrusted) send('click', describe(ev)); }, true);
  // report what was typed before the Enter that submits it
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { flush(); send('press', describe(ev), { value: 'Enter', text: '' }); } }, true);
}

function describeUserAction(a, secrets) {
  const where = a.testId ? `testId=${a.testId}` : `<${a.tag}>`;
  const quoted = a.text ? ` "${a.text}"` : '';
  // a password typed into a field that is not a password field must not reach the report either
  const value = secrets.includes(a.value) ? '******' : a.value;
  if (a.kind === 'click') return `Click${quoted} (${where})`;
  if (a.kind === 'press') return `Press ${value} in ${where}`;
  return `Enter "${String(value).slice(0, 80)}" in ${where}`;
}

function writeRecordingReport(dir, run) {
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(run, null, 2), 'utf-8');
  const rows = run.steps.map((s, i) => `
    <tr><td>${i + 1}</td><td>${esc(s.time)}</td><td>${esc(s.desc)}<div class="page">${esc(s.page)}</div></td>
      <td>${s.screenshot ? `<a href="${esc(s.screenshot)}" target="_blank"><img src="${esc(s.screenshot)}"></a>` : ''}</td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(run.caseName)} - Recorded Session</title>
<style>
  body{font-family:system-ui,"Segoe UI",sans-serif;margin:24px;color:#1f2937}
  h1{font-size:20px;margin:0 0 4px} .desc{font-size:14px;margin:0 0 6px} .meta{color:#6b7280;font-size:13px;margin-bottom:16px}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left;vertical-align:top}
  .page{color:#9ca3af;font-size:12px;margin-top:4px}
  img{max-width:240px;border:1px solid #e5e7eb;border-radius:4px}
</style></head><body>
<h1>Recorded session</h1>
${run.description ? `<p class="desc">${esc(run.description)}</p>` : ''}
<div class="meta">${run.steps.length} recorded action${run.steps.length === 1 ? '' : 's'} · Machine: ${esc(run.machine)} · Started: ${esc(run.startedAt)} · Duration: ${fmtSec(run.durationSec)}</div>
<table><thead><tr><th>#</th><th>Time</th><th>What was done (by hand)</th><th>Screenshot</th></tr></thead><tbody>${rows}</tbody></table>
<p class="meta">Full replay: <a href="${esc(run.traceUrl)}">Open trace viewer</a><br>
Opens the trace viewer (page snapshots, console and network of the whole session). The link works while the runner window is still open; later, double-click view-trace.bat first. The same data is in trace.zip in this folder.</p>
</body></html>`;
  fs.writeFileSync(path.join(dir, 'report.html'), html, 'utf-8');
}

async function recordSession(config) {
  if (!config.baseUrl) config.baseUrl = await ask('Enter the system address (e.g. https://xxx:8088): ');
  const note = await askOptional('\nWhat are you going to show? One line, e.g. the problem you see (optional, Enter to skip): ');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(EVIDENCE_DIR, `recording_${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const run = {
    caseName: 'Recorded session', description: note, mode: 'recording', status: 'recorded',
    machine: require('os').hostname(), startedAt: new Date().toLocaleString(), steps: [],
    traceUrl: traceUrl(config, path.basename(dir)),
  };
  const t0 = Date.now();
  const secrets = secretEntries(config).map(([, v]) => v);

  const browser = await chromium.launch({ ...launchOptions(config), slowMo: 0 });
  // viewport: null = a normal window the PO can resize
  const context = await browser.newContext({ viewport: null });
  await context.tracing.start({ screenshots: true, snapshots: true });

  // Reports are handled one at a time, so the trace entries and screenshots stay in the order things happened
  let queue = Promise.resolve(), open = true;
  const add = (page, a) => {
    if (!open) return;
    const desc = describeUserAction(a, secrets);
    queue = queue.then(async () => {
      const no = run.steps.length + 1;
      const rec = { desc, time: new Date().toLocaleTimeString(), page: a.path || '' };
      run.steps.push(rec);
      console.log(`    [${no}] ${desc}`);
      try {
        await context.tracing.group(desc);
        await new Promise((r) => setTimeout(r, 400)); // let the page react, so the picture shows the result
        const shot = `step-${String(no).padStart(2, '0')}.png`;
        await page.screenshot({ path: path.join(dir, shot) });
        rec.screenshot = shot;
      } catch { /* the page may already be gone */ }
      await context.tracing.groupEnd().catch(() => {});
    });
  };
  await context.exposeBinding('__oreoRecord', ({ page }, a) => add(page, a));
  await context.addInitScript(watchUserActions);

  const page = await context.newPage();
  const closed = new Promise((resolve) => {
    browser.on('disconnected', resolve);
    context.on('page', (p) => p.on('close', () => { if (!context.pages().length) resolve(); }));
    page.on('close', () => { if (!context.pages().length) resolve(); });
  });

  console.log(`\n● Recording. Work in the browser window as usual.\n  Evidence folder: ${dir}`);
  console.log('  Everything in that window is recorded, including what you type. Do not open anything unrelated in it.\n');
  await page.goto(config.baseUrl).catch((e) => console.log(`  (Could not open ${config.baseUrl}: ${String(e.message).split('\n')[0]})`));

  const enter = askOptional('  When you are done, press Enter here (or close the browser window): \n');
  const endedBy = await Promise.race([enter.then(() => 'enter'), closed.then(() => 'closed')]);
  open = false;
  await queue;

  let traced = true;
  await context.tracing.stop({ path: path.join(dir, 'trace.zip') }).catch(() => { traced = false; });
  await browser.close().catch(() => {});
  run.durationSec = Math.round((Date.now() - t0) / 1000);
  writeRecordingReport(dir, run);

  console.log(`\n■ Recording saved (${run.steps.length} action${run.steps.length === 1 ? '' : 's'})`);
  if (!traced) console.log('   Note: the trace could not be saved because the browser was already gone; the report and screenshots are there.');
  console.log(`   Report:      ${reportUrl(config, path.basename(dir))}`);
  console.log('   Full replay: "Open trace viewer" link at the bottom of the report');
  console.log(`   Folder:      ${dir}  (send this folder to QA)`);
  // when the browser was closed, the prompt above is still waiting for its Enter
  return { dir, pendingEnter: endedBy === 'closed' && interactive ? enter : undefined };
}

async function main() {
  const config = loadConfig(ROOT);
  if (process.argv[2] === '--view') {
    console.log(`\nReports and full replays of earlier runs: ${viewBase(config)}/`);
    if (!process.env.OREO_NO_OPEN) openFile(`${viewBase(config)}/`);
    await serveUntilEnter(config);
    return 0;
  }
  if (process.argv[2] === '--record') {
    const { dir, pendingEnter } = await recordSession(config);
    if (!process.env.OREO_NO_OPEN) openFile(path.join(dir, 'report.html'));
    await serveUntilEnter(config, pendingEnter);
    return 0;
  }
  const chosen = await chooseCase(process.argv[2]);
  if (!chosen) return 2;
  const { run, dir } = await runCase(chosen, config);
  if (!process.env.OREO_NO_OPEN) openFile(path.join(dir, 'report.html'));
  await serveUntilEnter(config);
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
