// Recording a session the PO works through by hand.

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { launchOptions, secretEntries } = require('../../core/config');
const { EVIDENCE_DIR } = require('./paths');
const state = require('./state');
const { interactive, ask, askOptional, fmtSec } = require('./console');
const { esc } = require('./report');
const { reportUrl, traceUrl } = require('./view-server');

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

  state.recording = true; // from here on Ctrl+C ends the session instead of closing the window
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
  state.recording = false;

  console.log(`\n■ Recording saved (${run.steps.length} action${run.steps.length === 1 ? '' : 's'})`);
  if (!traced) console.log('   Note: the trace could not be saved because the browser was already gone; the report and screenshots are there.');
  console.log(`   Report:      ${reportUrl(config, path.basename(dir))}`);
  console.log('   Full replay: "Open trace viewer" link at the bottom of the report');
  console.log(`   Folder:      ${dir}  (send this folder to QA)`);
  // when the browser was closed, the prompt above is still waiting for its Enter
  return { dir, pendingEnter: endedBy === 'closed' && interactive ? enter : undefined };
}

module.exports = { recordSession };
