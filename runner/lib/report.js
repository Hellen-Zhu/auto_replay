// The HTML report of a run.

const fs = require('fs');
const path = require('path');
const { fmtSec } = require('./console');

// ---------------- Report ----------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Step titles written as Given / When / Then get the keyword emphasized, so the report reads like a BDD scenario
const bdd = (title) => esc(title).replace(/^(Given|When|Then|And|But)\b/, '<b class="kw">$1</b>');

// given: a step whose actions only create what the PO gave (the trade of a given tradeId), so none of them was shown.
// An action this run's case data does not need (status notNeeded) is not in the report at all
const STATUS_TEXT = { passed: 'Passed', failed: 'Failed', skipped: 'Not run', given: 'Given' };

// Group the recorded actions by BDD step: a titled action starts a new group and the untitled ones after it belong to it.
// A substep (a step of the flow behind the case's step) is a heading inside the group's action list
// The actions of a given value (rec.given) are left out: the row names the value instead. So are the actions this
// run's case data did not need (rec.hidden, the third subtrade of an allocation into two), and a step line that has
// nothing else
function groupSteps(steps) {
  const groups = [];
  let no = 0;
  steps.forEach((s) => {
    if (s.title || !groups.length) groups.push({ title: s.title || '', actions: [], given: {} });
    const g = groups[groups.length - 1];
    if (s.given) Object.assign(g.given, s.given);
    else if (!s.hidden) g.actions.push({ ...s, no: ++no });
  });
  for (let i = groups.length - 1; i >= 0; i--) if (!groups[i].actions.length && !Object.keys(groups[i].given).length) groups.splice(i, 1);
  for (const g of groups) {
    if (!g.actions.length) {
      Object.assign(g, { status: 'given', saved: {}, pausedSec: 0, paused: false });
      continue;
    }
    const failed = g.actions.find((a) => a.status === 'failed');
    g.status = failed ? 'failed'
      : g.actions.every((a) => a.status === 'passed') ? 'passed' : g.actions.some((a) => a.status === 'passed') ? 'failed' : 'skipped';
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

// The screenshots of the run in order, for the replay player of the report: one frame per action that has one,
// with the step line and substep it belongs to. Built from the groups, so what the table leaves out is left out here too
function framesOf(groups) {
  const frames = [];
  for (const g of groups) {
    let sub = '';
    for (const a of g.actions) {
      if (a.substep) sub = a.substep;
      if (a.screenshot) frames.push({ src: a.screenshot, step: g.title, sub, no: a.no, desc: a.desc, status: a.status });
    }
  }
  return frames;
}

// The replay player: the step screenshots shown one after another at full size, since the screencast of the trace
// viewer is at most 800 pixels wide (fixed by Playwright). The page works without it; the thumbnails then stay links
const PLAYER = `
<div id="player" hidden>
  <div class="pl-top"><div class="pl-step" id="pl-step"></div><div class="pl-sub" id="pl-sub"></div>
    <div class="pl-desc"><span id="pl-no"></span> <span id="pl-desc"></span> <span id="pl-st"></span></div>
    <button class="pl-close" id="pl-close" title="Close (Esc)">&times;</button></div>
  <div class="pl-img"><img id="pl-img" alt=""></div>
  <div class="pl-bar">
    <button id="pl-prev" title="Previous (Left)">&#9664;&#9664;</button>
    <button id="pl-play" title="Play / pause (Space)">&#9654;</button>
    <button id="pl-next" title="Next (Right)">&#9654;&#9654;</button>
    <input type="range" id="pl-pos" min="0" value="0">
    <span id="pl-count"></span>
    <select id="pl-speed" title="Time per screenshot"><option value="1000">1 s</option><option value="2000" selected>2 s</option><option value="3000">3 s</option><option value="5000">5 s</option></select>
  </div>
</div>
<script>
(function () {
  var frames = JSON.parse(document.getElementById('frames').textContent);
  if (!frames.length) return;
  var $ = function (id) { return document.getElementById(id); };
  var player = $('player'), pos = $('pl-pos'), i = 0, timer = null;
  pos.max = frames.length - 1;
  var STATUS = { passed: 'Passed', failed: 'Failed', skipped: 'Not run' };
  var bdd = function (el, t) { var m = /^(Given|When|Then|And|But)\\b(.*)$/.exec(t || ''); el.textContent = ''; if (m) { var b = document.createElement('b'); b.className = 'kw'; b.textContent = m[1]; el.appendChild(b); el.appendChild(document.createTextNode(m[2])); } else el.textContent = t || ''; };
  function show(n) {
    i = Math.max(0, Math.min(frames.length - 1, n));
    var f = frames[i];
    $('pl-img').src = f.src;
    bdd($('pl-step'), f.step); bdd($('pl-sub'), f.sub);
    $('pl-no').textContent = f.no + '.'; $('pl-desc').textContent = f.desc;
    $('pl-st').textContent = STATUS[f.status] || ''; $('pl-st').className = f.status;
    pos.value = i; $('pl-count').textContent = (i + 1) + ' / ' + frames.length;
    if (frames[i + 1]) new Image().src = frames[i + 1].src;
  }
  function stop() { clearTimeout(timer); timer = null; $('pl-play').innerHTML = '&#9654;'; }
  function tick() { if (i >= frames.length - 1) return stop(); show(i + 1); timer = setTimeout(tick, +$('pl-speed').value); }
  function play() { if (i >= frames.length - 1) show(0); $('pl-play').innerHTML = '&#10074;&#10074;'; timer = setTimeout(tick, +$('pl-speed').value); }
  function open(n) { player.hidden = false; document.body.style.overflow = 'hidden'; show(n); }
  function close() { stop(); player.hidden = true; document.body.style.overflow = ''; }
  $('pl-open').hidden = false;
  $('pl-open').onclick = function () { open(0); play(); };
  $('pl-close').onclick = close;
  $('pl-prev').onclick = function () { stop(); show(i - 1); };
  $('pl-next').onclick = function () { stop(); show(i + 1); };
  $('pl-play').onclick = function () { timer ? stop() : play(); };
  pos.oninput = function () { stop(); show(+pos.value); };
  document.addEventListener('keydown', function (e) {
    if (player.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') { stop(); show(i - 1); }
    else if (e.key === 'ArrowRight') { stop(); show(i + 1); }
    else if (e.key === ' ') { e.preventDefault(); timer ? stop() : play(); }
  });
  // A screenshot of the table opens the player at that screenshot
  document.querySelectorAll('a[data-shot]').forEach(function (a) {
    a.onclick = function (e) {
      var n = frames.findIndex(function (f) { return f.src === a.getAttribute('data-shot'); });
      if (n < 0) return;
      e.preventDefault(); open(n);
    };
  });
})();
</script>`;

function writeReport(dir, run) {
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(run, null, 2), 'utf-8');
  const shot = (file) => (file ? `<a href="${esc(file)}" target="_blank" data-shot="${esc(file)}"><img src="${esc(file)}"></a>` : '');
  const groups = groupSteps(run.steps);
  const frames = framesOf(groups);
  const rows = groups.map((g, i) => {
    const actions = g.actions.map((a) => `
          ${a.substep ? `<li class="sub">${bdd(a.substep)}</li>` : ''}<li class="${a.status}"><span class="no">${a.no}.</span> ${esc(a.desc)} <span class="st">${STATUS_TEXT[a.status]}</span>${a.screenshot ? ` <a href="${esc(a.screenshot)}" target="_blank" data-shot="${esc(a.screenshot)}">screenshot</a>` : ''}${a.pausedSec !== undefined ? `<div class="paused">Paused for ${fmtSec(a.pausedSec)} after this action</div>` : ''}</li>`).join('');
    return `
    <tr class="${g.status}">
      <td>${i + 1}</td>
      <td><div class="step">${bdd(g.title) || esc((g.actions[0] || {}).desc)}</div>${Object.entries(g.given).map(([k, v]) => `<div class="saved">${esc(k)}: <b>${esc(v)}</b> (given for this run)</div>`).join('')}${Object.entries(g.saved).map(([k, v]) => `<div class="saved">${esc(k)}: <b>${esc(v)}</b></div>`).join('')}${g.error ? `<pre>${esc(g.error)}</pre>` : ''}${g.paused ? `<div class="paused">Paused for ${fmtSec(g.pausedSec)} during this step</div>` : ''}
        ${g.actions.length ? `<details${g.status === 'failed' ? ' open' : ''}><summary>${g.actions.length} action${g.actions.length === 1 ? '' : 's'}</summary><ul>${actions}</ul></details>` : ''}</td>
      <td>${STATUS_TEXT[g.status]}</td>
      <td>${shot(g.screenshot)}</td>
    </tr>`;
  }).join('');
  const count = (st) => groups.filter((g) => g.status === st).length;
  const summary = `${groups.length} step${groups.length === 1 ? '' : 's'}: ${count('passed')} passed${count('failed') ? `, ${count('failed')} failed` : ''}${count('skipped') ? `, ${count('skipped')} not run` : ''}${count('given') ? `, ${count('given')} given` : ''}`;
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
  tr.failed td{background:#fef2f2} tr.skipped td{color:#9ca3af} tr.given td{color:#374151}
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
  .pl-open{font:inherit;font-size:13px;padding:6px 14px;margin:0 0 16px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:6px;cursor:pointer}
  #player{position:fixed;inset:0;z-index:10;background:#111827;color:#f9fafb;display:flex;flex-direction:column}
  #player[hidden]{display:none}
  .pl-top{position:relative;padding:12px 56px 8px 20px;font-size:14px} .pl-step{font-size:16px;font-weight:600}
  .pl-sub{color:#d1d5db;margin-top:2px} .pl-desc{color:#9ca3af;font-size:13px;margin-top:4px}
  #player .kw{color:#93c5fd} #pl-st.passed{color:#4ade80} #pl-st.failed{color:#f87171} #pl-st.skipped{color:#9ca3af}
  .pl-close{position:absolute;top:8px;right:14px;font-size:28px;line-height:1;background:none;border:0;color:#f9fafb;cursor:pointer}
  .pl-img{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:0 12px}
  .pl-img img{max-width:100%;max-height:100%;object-fit:contain;border:0;border-radius:2px}
  .pl-bar{display:flex;align-items:center;gap:10px;padding:10px 20px 14px;font-size:13px}
  .pl-bar button,.pl-bar select{font:inherit;background:#374151;color:#f9fafb;border:0;border-radius:4px;padding:5px 10px;cursor:pointer}
  #pl-pos{flex:1;min-width:60px}
</style></head><body>
<h1><span class="kw">Scenario:</span> ${esc(run.caseName)} <span class="badge ${run.status}">${run.status === 'passed' ? 'Passed' : 'Failed'}</span></h1>
${run.description ? `<p class="desc">${esc(run.description)}</p>` : ''}
<div class="meta">${summary} · Machine: ${esc(run.machine)} · Started: ${esc(run.startedAt)} · Duration: ${fmtSec(run.durationSec)}${run.pausedSec ? ` (plus ${fmtSec(run.pausedSec)} paused)` : ''}${run.stepByStep ? ' · Mode: step by step' : ''}${run.source ? ` · Case source: ${esc(run.source)}` : ''}</div>
${run.mocked && run.mocked.length ? `<p class="desc changed">Note: ${esc(run.mocked.join(', '))} was set to "mock" for this run: its requests were answered by the runner, not by the system.</p>` : ''}
${frames.length ? `<button class="pl-open" id="pl-open" hidden>&#9654; Play the screenshots (${frames.length})</button>
` : ''}${caseData}${runValues}<table><thead><tr><th>#</th><th>Step</th><th>Result</th><th>Screenshot</th></tr></thead><tbody>${rows}</tbody></table>
${run.video ? `<video src="${esc(run.video)}" controls></video>` : ''}
<p class="meta">Full replay: <a href="${esc(run.traceUrl)}">Open trace viewer</a><br>
Opens the trace viewer (every action with page snapshots, console and network). Click an action on the left to see the page as it was in the large view, which is sharp; the strip at the top and its playback are small pictures (Playwright records them at most 800 pixels wide): for a sharp playback use "Play the screenshots" above. The link works while the runner window is still open; later, double-click view-trace.bat first. The same data is in trace.zip in this folder.</p>
<script type="application/json" id="frames">${JSON.stringify(frames).replace(/</g, '\\u003c')}</script>${frames.length ? PLAYER : ''}
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

module.exports = { esc, writeReport, openFile };
