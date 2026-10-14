// Running one case: browser, steps, screenshots, trace, pause.

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { executeStep, savedValues, describeStep, fillParams, isMocked, conditionHolds } = require('../../core/actions');
const { launchOptions } = require('../../core/config');
const { ROOT, EVIDENCE_DIR } = require('./paths');
const state = require('./state');
const { interactive, askOptional, discardTyped, setQuietKeys } = require('./console');
const { writeReport } = require('./report');
const { reportUrl, traceUrl } = require('./view-server');
const { paramsOf, caseDataOf, checkCase, askSettings, FIXED_SETTINGS } = require('./settings');

// A new folder evidence/<name>_<timestamp>. The timestamp has seconds only, so two runs of one case that start in
// the same second (cases running at the same time) would share a folder: the later one gets the next free second.
function evidenceDir(name) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  for (let t = Date.now(); ; t += 1000) {
    const dir = path.join(EVIDENCE_DIR, `${name}_${new Date(t).toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
    try { fs.mkdirSync(dir); return dir; } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
}

// Browsers that run at the same time open a little apart, so that every window can be seen and reached.
// The page takes the size of the window (viewport: null in executeCase): a single case opens maximized, cases that
// run at the same time get a window of a fixed size. A size in browser.args of the config wins
function launchFor(config, slot, maximized = false) {
  const options = launchOptions(config);
  const has = (flag) => (options.args || []).some((a) => String(a).startsWith(flag));
  if (slot > 0 && !has('--window-position')) {
    options.args = [...(options.args || []), `--window-position=${slot * 60},${slot * 40}`];
  }
  if (!has('--window-size') && !has('--start-maximized')) {
    options.args = [...(options.args || []), maximized ? '--start-maximized' : '--window-size=1280,800'];
  }
  return options;
}

// The actions whose element is framed before they run, and the color of the frame: what the step works on, or what
// it checks. expectHidden has nothing to show
const HIGHLIGHT = { click: '#f97316', fill: '#f97316', press: '#f97316', select: '#f97316', upload: '#f97316',
  read: '#2563eb', expectVisible: '#16a34a', expectEnabled: '#16a34a', expectDisabled: '#16a34a', expectValue: '#16a34a', expectText: '#16a34a' };

/**
 * ctx.highlight of executeStep: frames the element the action is about to work on, with a dot where a click lands,
 * and waits browser.highlightMs before the action runs, so the PO can see what the replay does. The frame is drawn
 * in a layer of its own over the page (no click reaches it) and disappears by itself shortly after. It is only an
 * aid: an element that does not show up within 2 s, or anything else that goes wrong, just means no frame (the
 * action then waits and fails on its own terms)
 */
function highlighterOf(config) {
  const b = config.browser || {};
  const ms = Number(b.highlightMs ?? 600);
  if (b.highlight === false || !(ms > 0)) return undefined;
  return async (locator, step) => {
    const color = HIGHLIGHT[step.action];
    if (!color) return;
    try {
      const el = locator.first();
      await el.waitFor({ state: step.action === 'upload' || step.action === 'read' ? 'attached' : 'visible', timeout: 2000 });
      const drawn = await el.evaluate((node, { color, ms, dot }) => {
        const r = node.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const id = '__oreo_replay_highlight__';
        document.getElementById(id)?.remove();
        const layer = document.createElement('div');
        layer.id = id;
        layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
        const box = document.createElement('div');
        box.style.cssText = `position:fixed;left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width + 6}px;height:${r.height + 6}px;`
          + `border:3px solid ${color};border-radius:4px;box-shadow:0 0 0 4px ${color}40;box-sizing:border-box`;
        layer.appendChild(box);
        if (dot) {
          const d = document.createElement('div');
          d.style.cssText = `position:fixed;left:${r.left + r.width / 2 - 9}px;top:${r.top + r.height / 2 - 9}px;width:18px;height:18px;`
            + `border-radius:50%;background:${color}99;border:2px solid #fff;box-shadow:0 0 4px #0006`;
          layer.appendChild(d);
        }
        document.documentElement.appendChild(layer);
        setTimeout(() => layer.remove(), ms + 1200);
        return true;
      }, { color, ms, dot: step.action === 'click' }, { timeout: 2000 });
      if (drawn) await new Promise((r) => setTimeout(r, ms));
    } catch { /* no frame for this action */ }
  };
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
    caseName: doc.name, description: doc.description, caseFile: path.basename(file), source: doc.source,
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

  // The page has the size of the browser window (no viewport of its own): with a fixed viewport in a larger window,
  // every screenshot of a step made the page jump between that size and the window's, which flickered on the PO's screen.
  // A video needs a size; it is only recorded when the config asks for it
  const viewport = null;
  const videoSize = { width: 1280, height: 720 };
  let browser, context, page, onKey;
  let kept = false;
  state.openRuns++;
  // However the run ends (also with an error, e.g. a browser closed by hand): the browser is closed and the
  // keyboard given back, since the window goes on with the next case
  try {
    browser = await chromium.launch(launchFor(config, slot, !quiet));
    if (config.evidence?.video === true) {
      try {
        context = await browser.newContext({ viewport, recordVideo: { dir, size: videoSize } });
        page = await context.newPage();
      } catch (e) {
        // Missing ffmpeg does not block execution; there is just no video (screenshots and trace are still saved).
        // Relaunch a clean browser so the failed context cannot affect the rest of the run.
        await browser.close().catch(() => {});
        browser = await chromium.launch(launchFor(config, slot, !quiet));
        context = undefined;
        say(`  (Note: video recording is unavailable; only screenshots and trace will be saved. Reason: ${String(e.message).split('\n')[0]})\n`);
      }
    }
    if (!context) {
      context = await browser.newContext({ viewport });
      page = await context.newPage();
    }
    await context.tracing.start({ screenshots: true, snapshots: true });
    const ctx = { config, vars: {}, params, askConfig: quiet ? undefined : askConfig, rootDir: ROOT, fixed: FIXED_SETTINGS, highlight: highlighterOf(config) };

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
      console.log(`\n  ⏸ Paused after step ${n}/${shown}. The browser stays open so you can look at the page.`);
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

    // An action of a group that runs only for some values of a case data (format version 13), e.g. the third subtrade
    // of an allocation into two: with this run's data it is not needed. A wrong value is left to the step, which fails on it
    const notNeeded = (s) => { try { return !!s && !!s.when && !conditionHolds(s.when, ctx.params); } catch { return false; } };
    // Actions that run only while a case data is empty (creating the given trade, format version 15): when the PO gave
    // its value they are not shown at all, the step line says which value is used instead. The actions of any other
    // group this run does not need (the third subtrade of an allocation into two) are not shown either. Their number
    // is left out of the count, so the actions shown are numbered 1 to n
    const given = (s) => !!s && !!s.when && s.when.empty === true && notNeeded(s);
    const shown = doc.steps.filter((s) => !notNeeded(s)).length;
    let shownNo = 0;
    const givenSaid = new Set();
    // the step line of a group whose first actions are not shown: printed with the first action that is
    let titleDue = null;
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

      if (given(step)) {
        rec.status = 'notNeeded';
        rec.given = { [step.when.param]: ctx.params[step.when.param] };
        if (title || titleDue) say(`  ■ ${title || titleDue}`);
        titleDue = null;
        if (!givenSaid.has(step.when.param)) say(`    - uses the given ${step.when.param} ${ctx.params[step.when.param]}`);
        givenSaid.add(step.when.param);
        continue;
      }
      if (notNeeded(step)) {
        rec.status = 'notNeeded';
        rec.hidden = true;
        if (title) titleDue = title;
        continue;
      }
      if (title) titleDue = title;
      if (titleDue) say(`  ■ ${titleDue}`);
      titleDue = null;
      if (substep) say(`    - ${substep}`);
      if (!quiet) process.stdout.write(`    [${++shownNo}/${shown}] ${desc} ... `);
      try {
        if (step.when) conditionHolds(step.when, ctx.params); // fails the step for a value that is not one of its choices
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
      if (!quiet && !failed && next && !notNeeded(next) && (pauseRequested || (stepByStep && (next.title || next.substep)))) await pause(rec, shownNo);
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
