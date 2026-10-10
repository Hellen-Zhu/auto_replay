// Running several cases in one go, with a summary.

const fs = require('fs');
const path = require('path');
const state = require('./state');
const { askOptional, setQuietKeys, fmtSec, plural, printError } = require('./console');
const { esc } = require('./report');
const { reportUrl, traceUrl } = require('./view-server');
const { askedParamsOf, checkCase, askSettings } = require('./settings');
const { evidenceDir, executeCase } = require('./execute');

// ---------------- Running several cases ----------------
// A folder or the cases the PO ticked run as a batch: the settings are asked once, then the cases run one after
// another or, when the PO asks for it, several at the same time, each in a browser of its own. Every case still gets
// its own evidence folder; the batch adds a summary with a link to each of them.
const MAX_PARALLEL = 8; // browsers open at the same time: more than that only slows an office computer down

async function runBatch(list, config) {
  const firstLine = (e) => String((e && e.message) || e).split('\n')[0];
  const items = list.map((chosen) => ({
    chosen, id: chosen.id || path.basename(chosen.file, '.json'), name: (chosen.doc && chosen.doc.name) || '', status: 'notrun',
  }));
  for (const it of items) {
    try {
      checkCase(it.chosen);
      // a batch asks nothing per case, so a case that needs a value typed in cannot be part of it
      const asked = askedParamsOf(it.chosen.doc);
      if (asked.length) throw new Error(`needs ${asked.join(', ')} to be entered: run this case on its own`);
    } catch (e) { it.error = firstLine(e); }
  }
  const ready = items.filter((it) => !it.error);
  const bad = items.filter((it) => it.error);
  if (bad.length) {
    console.log(`\n${bad.length} of the ${plural(items.length)} cannot be run and ${bad.length === 1 ? 'is' : 'are'} left out:`);
    for (const it of bad) console.log(`  ${it.id}: ${it.error}`);
  }
  if (!ready.length) throw new Error('None of the selected cases can be run');
  const total = ready.length;
  const { params, askConfig, stepByStep } = await askSettings(ready.map((it) => it.chosen), config);

  // One after another unless the PO asks for more: whether the system takes the same account working in several
  // browsers at once is for the PO to decide
  const most = Math.min(total, MAX_PARALLEL);
  let parallel = 1;
  if (most >= 2 && !stepByStep) {
    const together = most === 2 ? 'type 2 to run both at the same time' : `type a number (2-${most}) to run that many at the same time`;
    for (;;) {
      const answer = await askOptional(`\nPress Enter to run the ${total} cases one after another, or ${together}: `);
      if (answer === '') break;
      if (/^\d+$/.test(answer) && Number(answer) >= 1 && Number(answer) <= most) { parallel = Number(answer); break; }
      console.log(`  Please type ${most === 2 ? '2' : `a number from 2 to ${most}`}, or just press Enter.`);
    }
  }

  const startedAt = new Date().toLocaleString();
  const t0 = Date.now();
  let halt = ''; // why no further case is started
  let finished = null;
  const finish = (interrupted) => {
    if (finished) return finished;
    state.activeBatch = null;
    if (interrupted) halt = 'the batch was stopped';
    for (const it of items) {
      if (it.status === 'running') { it.status = 'notrun'; it.error = 'stopped before it finished'; }
      else if (it.status === 'notrun' && !it.error) it.error = `not started: ${halt || 'the batch ended early'}`;
    }
    const count = (status) => items.filter((it) => it.status === status).length;
    const result = {
      mode: 'batch', caseName: `Batch of ${plural(items.length)}`, status: count('passed') === items.length ? 'passed' : 'failed',
      machine: require('os').hostname(), startedAt, durationSec: Math.round((Date.now() - t0) / 1000), parallel, stepByStep,
      ...(interrupted ? { interrupted: true } : {}),
      cases: items.map((it) => ({
        caseFile: path.basename(it.chosen.file), caseName: it.name, status: it.status, durationSec: it.durationSec,
        values: it.values, evidence: it.evidence, error: it.error,
      })),
    };
    // Created only now, so that the list of all runs (newest first) shows the batch above its cases
    const dir = evidenceDir('batch');
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2), 'utf-8');
    writeBatchReport(dir, result, config);

    const counts = `${count('passed')} passed, ${count('failed')} failed${count('notrun') ? `, ${count('notrun')} not run` : ''}`;
    console.log(`\n===== Batch ${interrupted ? 'stopped' : 'finished'}: ${counts} (${fmtSec(result.durationSec)}) =====`);
    // Up to 20 cases are all listed; of more, only the ones that need a look
    const listed = items.length <= 20 ? items : items.filter((it) => it.status !== 'passed');
    for (const it of listed) console.log(`  ${RESULT_TEXT[it.status]} ${it.id}${resultNote(it) ? `   ${resultNote(it)}` : ''}`);
    if (listed.length < items.length) console.log(`  (the ${plural(items.length - listed.length)} that passed ${items.length - listed.length === 1 ? 'is' : 'are'} in the summary)`);
    // After Ctrl+C the runner ends at once and its links with it: the file is named instead
    console.log(`   Summary:     ${interrupted ? path.join(dir, 'report.html') : reportUrl(config, path.basename(dir))}`);
    console.log(`   Folder:      ${dir}`);
    return (finished = { status: result.status, dir });
  };
  state.activeBatch = { finish };

  // Runs one case and keeps its outcome. A case that fails, or cannot be run at all, never ends the batch - except
  // when the browser cannot be started: every other case would end the same way.
  const runOne = async (it, options) => {
    it.status = 'running';
    const t = Date.now();
    try {
      const { run, dir } = await executeCase(it.chosen, config, options);
      it.status = run.status;
      it.durationSec = run.durationSec;
      it.values = run.values;
      it.evidence = path.basename(dir);
      const at = run.steps.findIndex((s) => s.status === 'failed');
      if (at >= 0) it.error = `step ${at + 1} of ${run.steps.length}: ${String(run.steps[at].error).split('\n')[0]}`;
    } catch (e) {
      it.status = 'failed';
      it.durationSec = Math.round((Date.now() - t) / 1000);
      it.error = firstLine(e);
      const noBrowser = /browserType\.launch/.test(it.error);
      if (!options.quiet || (noBrowser && !halt)) printError(e);
      if (noBrowser) halt = 'the browser could not be started';
    }
  };

  console.log(`\n===== Running ${plural(total)}${parallel > 1 ? `, ${parallel} at the same time` : stepByStep ? ', step by step' : ''} =====`);
  if (parallel === 1) {
    for (const [i, it] of ready.entries()) {
      if (halt) break;
      console.log(`\n===== Case ${i + 1} of ${total}: ${it.id} =====`);
      await runOne(it, { stepByStep, askConfig, ...(total === 1 ? { params } : {}) });
    }
  } else {
    console.log('  Each case runs in its own browser window and only its result is shown here; the steps are in its report.');
    console.log('  Pausing (P) is not available while cases run at the same time. Ctrl+C stops the batch.\n');
    setQuietKeys(true);
    const tag = (i) => `  [${String(i + 1).padStart(String(total).length)}/${total}]`;
    let next = 0;
    const worker = async (slot) => {
      while (!halt && next < total) {
        const i = next++;
        const it = ready[i];
        console.log(`${tag(i)} started   ${it.id}`);
        await runOne(it, { quiet: true, slot });
        console.log(`${tag(i)} ${RESULT_TEXT[it.status]} ${it.id}   (${fmtSec(it.durationSec)})${resultNote(it) ? `   ${resultNote(it)}` : ''}`);
      }
    };
    try {
      await Promise.all(Array.from({ length: parallel }, (_, slot) => worker(slot)));
    } finally {
      setQuietKeys(false);
    }
  }
  return finish(false);
}

const RESULT_TEXT = { passed: 'passed   ', failed: 'FAILED   ', notrun: 'not run  ' };
// What is worth knowing about a case of a batch in one line: why it did not pass, or the values it produced
const resultNote = (it) => (it.status === 'passed'
  ? Object.entries(it.values || {}).map(([k, v]) => `${k} = ${v}`).join(', ')
  : it.error || '');

function writeBatchReport(dir, result, config) {
  const text = { passed: 'Passed', failed: 'Failed', notrun: 'Not run' };
  const count = (status) => result.cases.filter((c) => c.status === status).length;
  const rows = result.cases.map((c, i) => {
    const id = c.caseFile.replace(/\.json$/i, '');
    const name = c.caseName.startsWith(`[${id}]`) ? c.caseName.slice(id.length + 2).trim() : c.caseName;
    const values = Object.entries(c.values || {}).map(([k, v]) => `<div class="saved">${esc(k)}: <b>${esc(v)}</b></div>`).join('');
    // The reports are neighbours of this folder, so the link also works when the file is opened without the runner
    const links = c.evidence
      ? `<a href="../${esc(encodeURIComponent(c.evidence))}/report.html">Report</a> · <a href="${esc(traceUrl(config, c.evidence))}">Full replay</a>`
      : '';
    return `
    <tr class="${c.status === 'notrun' ? 'skipped' : c.status}">
      <td>${i + 1}</td>
      <td><div class="step">${esc(id)}</div>${name ? `<div class="name">${esc(name)}</div>` : ''}</td>
      <td>${text[c.status]}</td>
      <td>${c.durationSec === undefined ? '' : fmtSec(c.durationSec)}</td>
      <td>${values}${c.error ? `<pre>${esc(c.error)}</pre>` : ''}</td>
      <td>${links}</td>
    </tr>`;
  }).join('');
  const summary = `${plural(result.cases.length)}: ${count('passed')} passed${count('failed') ? `, ${count('failed')} failed` : ''}${count('notrun') ? `, ${count('notrun')} not run` : ''}`;
  const mode = result.parallel > 1 ? `${result.parallel} cases at the same time` : result.stepByStep ? 'one after another, step by step' : 'one after another';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(result.caseName)} - Execution Report</title>
<style>
  body{font-family:system-ui,"Segoe UI",sans-serif;margin:24px;color:#1f2937}
  h1{font-size:20px;margin:0 0 4px} .meta{color:#6b7280;font-size:13px;margin-bottom:16px}
  .badge{display:inline-block;padding:2px 10px;border-radius:12px;color:#fff;font-size:13px}
  .badge.passed{background:#16a34a} .badge.failed{background:#dc2626}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left;vertical-align:top}
  tr.failed td{background:#fef2f2} tr.skipped td{color:#9ca3af}
  .step{font-size:14px} .name{color:#6b7280;margin-top:2px} .saved{font-size:12px;color:#374151}
  pre{white-space:pre-wrap;color:#b91c1c;font-size:12px;margin:0} tr.skipped pre{color:#9ca3af}
  td:last-child{white-space:nowrap}
</style></head><body>
<h1>${esc(result.caseName)} <span class="badge ${result.status}">${result.status === 'passed' ? 'Passed' : 'Failed'}</span></h1>
<div class="meta">${summary}${result.interrupted ? ' · Stopped with Ctrl+C before it finished' : ''} · Machine: ${esc(result.machine)} · Started: ${esc(result.startedAt)} · Duration: ${fmtSec(result.durationSec)} · Mode: ${mode}</div>
<table><thead><tr><th>#</th><th>Case</th><th>Result</th><th>Duration</th><th>Values / failure</th><th></th></tr></thead><tbody>${rows}</tbody></table>
<p class="meta">Report: every step of the case with its screenshots. Full replay: the trace viewer, which works while the runner window is still open; later, double-click view-trace.bat first.</p>
</body></html>`;
  fs.writeFileSync(path.join(dir, 'report.html'), html, 'utf-8');
}

module.exports = { runBatch };
