// Running one case: browser, steps, screenshots, trace, pause.

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { executeStep, savedValues, describeStep, fillParams, isMocked } = require('../../core/actions');
const { launchOptions } = require('../../core/config');
const { ROOT, EVIDENCE_DIR } = require('./paths');
const state = require('./state');
const { interactive, askOptional, discardTyped, setQuietKeys } = require('./console');
const { writeReport } = require('./report');
const { reportUrl, traceUrl } = require('./view-server');
const { paramsOf, caseDataOf, checkCase, askSettings } = require('./settings');

// A new folder evidence/<name>_<timestamp>. The timestamp has seconds only, so two runs of one case that start in
// the same second (cases running at the same time) would share a folder: the later one gets the next free second.
function evidenceDir(name) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  for (let t = Date.now(); ; t += 1000) {
    const dir = path.join(EVIDENCE_DIR, `${name}_${new Date(t).toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
    try { fs.mkdirSync(dir); return dir; } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
}

// Browsers that run at the same time open a little apart, so that every window can be seen and reached
function launchFor(config, slot) {
  const options = launchOptions(config);
  if (slot > 0 && !(options.args || []).some((a) => String(a).startsWith('--window-position'))) {
    options.args = [...(options.args || []), `--window-position=${slot * 60},${slot * 40}`];
  }
  return options;
}

/**
 * Runs one case in a browser of its own and writes its evidence folder. With quiet nothing is printed and nothing
 * is asked (cases running at the same time: the batch prints one line per case).
 * With keepOpen the browser is not closed when the run ends: it is returned as `browser`, on the last page, and
 * the caller closes it. The evidence is complete by then, so what is done in that browser afterwards is in no
 * report and no trace. Not with video: the video file is only written when the browser closes.
 */
async function executeCase({ file, doc }, config, { params = paramsOf(doc), stepByStep = false, askConfig, quiet = false, slot = 0, keepOpen = false } = {}) {
  const caseData = caseDataOf(doc, params);
  const say = (text) => { if (!quiet) console.log(text); };
  // Created only now, after everything was asked: the timestamp is the start of the run, and a run that is given up
  // at a prompt leaves no empty folder behind
  const dir = evidenceDir(path.basename(file, '.json'));

  say(`\n▶ Scenario: ${doc.name}\n  Evidence folder: ${dir}`);
  if (stepByStep) say('  Mode: step by step');
  for (const d of caseData) if (d.changedFrom !== undefined) say(`  Case data changed for this run: ${d.name} = ${d.value} (case file: ${d.changedFrom})`);
  if (interactive) say('  Tip: press P in this window at any time to pause after the current step.');
  say('');
  const run = {
    caseName: doc.name, description: doc.description, caseFile: path.basename(file), source: doc.source, codeVersion: doc.codeVersion,
    machine: require('os').hostname(), startedAt: new Date().toLocaleString(), status: 'passed', stepByStep, pausedSec: 0, steps: [],
    values: {}, // what the steps read or received during the run (name -> value), e.g. createdTradeId
    traceUrl: traceUrl(config, path.basename(dir)),
    ...(caseData.length ? { caseData } : {}),
  };
  // A run whose requests were answered by a mock (riskEngine: "mock") must say so, on the screen and in the report
  const mocked = [...new Set(doc.steps.filter((s) => isMocked(s, config)).map((s) => s.request.setting))];
  if (mocked.length) {
    run.mocked = mocked;
    say(`  NOTE: ${mocked.join(', ')} is "mock": its requests are answered by this runner, not by the system.`);
  }
  const t0 = Date.now();

  const viewport = { width: 1280, height: 720 };
  let browser, context, page, onKey;
  let kept = false;
  state.openRuns++;
  // However the run ends (also with an error, e.g. a browser closed by hand): the browser is closed and the
  // keyboard given back, since the window goes on with the next case
  try {
    browser = await chromium.launch(launchFor(config, slot));
    if (config.evidence?.video === true) {
      try {
        context = await browser.newContext({ viewport, recordVideo: { dir, size: viewport } });
        page = await context.newPage();
      } catch (e) {
        // Missing ffmpeg does not block execution; there is just no video (screenshots and trace are still saved).
        // Relaunch a clean browser so the failed context cannot affect the rest of the run.
        await browser.close().catch(() => {});
        browser = await chromium.launch(launchFor(config, slot));
        context = undefined;
        say(`  (Note: video recording is unavailable; only screenshots and trace will be saved. Reason: ${String(e.message).split('\n')[0]})\n`);
      }
    }
    if (!context) {
      context = await browser.newContext({ viewport });
      page = await context.newPage();
    }
    await context.tracing.start({ screenshots: true, snapshots: true });
    const ctx = { config, vars: {}, params, askConfig: quiet ? undefined : askConfig, rootDir: ROOT };

    // Pausing only ever happens between steps, never in the middle of an action.
    // P is picked up as a single key press (console only); the run stops once the current step has finished.
    let pauseRequested = false, pausing = false;
    if (interactive && !quiet) {
      onKey = (s, key) => {
        if (pausing || pauseRequested || !key || key.ctrl || key.meta || key.name !== 'p') return;
        pauseRequested = true;
        console.log('\n    (Pause requested: the run will stop after the current step)');
      };
      process.stdin.on('keypress', onKey);
    }
    if (!quiet) setQuietKeys(true);
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
      const desc = describeStep(step, ctx.vars, ctx.params, config);
      // a step line may name case data (the product): it is shown with the value of this run
      const title = step.title && fillParams(step.title, ctx.params);
      const substep = step.substep && fillParams(step.substep, ctx.params);
      const rec = { title, desc, status: 'skipped' };
      if (substep) rec.substep = substep;
      run.steps.push(rec);
      if (failed) continue;

      if (title) say(`  ■ ${title}`);
      if (substep) say(`    - ${substep}`);
      if (!quiet) process.stdout.write(`    [${i + 1}/${doc.steps.length}] ${desc} ... `);
      try {
        const r = await executeStep(page, step, ctx);
        rec.status = 'passed';
        if (step.action === 'read') rec.desc += ` (read: ${r})`;
        else if (step.capture) rec.desc += ` (captured: ${r})`;
        else if (step.action === 'api' && r && Object.keys(r).length) rec.desc += ` (saved: ${Object.entries(r).map(([k, v]) => `${k} = ${v}`).join(', ')})`;
        say('✔');
        // What the step read or received, e.g. the ID of the trade it created: shown right away and kept for the report
        const saved = savedValues(step, r);
        if (Object.keys(saved).length) {
          rec.saved = saved;
          Object.assign(run.values, saved);
          for (const [k, v] of Object.entries(saved)) say(`          ${k} = ${v}`);
        }
      } catch (e) {
        rec.status = 'failed';
        rec.error = String(e.message || e).split('\n').slice(0, 6).join('\n');
        failed = true;
        run.status = 'failed';
        say('✘');
        say(`\n    Failure reason: ${rec.error}\n`);
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
      if (!quiet && !failed && next && (pauseRequested || (stepByStep && (next.title || next.substep)))) await pause(rec, i + 1);
    }

    await context.tracing.stop({ path: path.join(dir, 'trace.zip') });
    const video = page.video();
    kept = keepOpen && !video;
    if (!kept) {
      await context.close();
      await browser.close();
    }
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
    if (!Object.keys(run.values).length) delete run.values;
    writeReport(dir, run);
  } finally {
    state.openRuns--;
    if (onKey) process.stdin.off('keypress', onKey);
    if (!quiet) setQuietKeys(false);
    if (browser && !kept) await browser.close().catch(() => {});
  }

  say(run.status === 'passed' ? '\n✅ Run passed' : '\n❌ Run failed');
  for (const [k, v] of Object.entries(run.values || {})) say(`   ${k}: ${v}`);
  say(`   Report:      ${reportUrl(config, path.basename(dir))}`);
  say('   Full replay: "Open trace viewer" link at the bottom of the report');
  say(`   Folder:      ${dir}`);
  return { run, dir, browser: kept ? browser : null };
}

/** One case: its settings and case data are asked, then it runs with every step shown */
async function runCase(chosen, config) {
  checkCase(chosen);
  const { params, askConfig, stepByStep } = await askSettings([chosen], config);
  checkCase(chosen, params);
  // On a console the browser stays open after the run, so that the PO can look at the page the case ended on
  return executeCase(chosen, config, { params, stepByStep, askConfig, keepOpen: interactive });
}

module.exports = { evidenceDir, executeCase, runCase };
