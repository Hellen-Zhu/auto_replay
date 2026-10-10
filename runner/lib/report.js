// The HTML report of a run.

const fs = require('fs');
const path = require('path');
const { fmtSec } = require('./console');

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
${run.mocked && run.mocked.length ? `<p class="desc changed">Note: ${esc(run.mocked.join(', '))} was set to "mock" for this run: its requests were answered by the runner, not by the system.</p>` : ''}
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

module.exports = { esc, writeReport, openFile };
