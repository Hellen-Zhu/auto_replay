#!/usr/bin/env node
// PO-side runner: reads case files from cases/ and really executes them in the local browser.
// Usage:
//   double-click run-case.bat               -> the folders under cases/ as a list: the arrow keys move, Right / Left open
//                                              or close a folder, typing searches, Enter runs the case. Space ticks
//                                              cases or a whole folder, which Enter then runs together: one after
//                                              another, or several at the same time. After a run the window goes back
//                                              to the list for the next case
//   drag a case .json onto run-case.bat     -> run that case directly
//   drag a folder or several case files     -> run all those cases together
//   node runner/runner.js cases/<folder>/xxx.json
//   node runner/runner.js cases/<folder>
//   double-click view-trace.bat             -> serve reports and full replays (trace viewer) of earlier runs
// Where the list cannot be redrawn (piped input, a very small window) or with OREO_PLAIN_MENU=1, the cases are
// offered as numbered folders instead: a number opens a folder or runs a case, text searches.
//
// This file is the entry point: the window that runs one case or batch after another, and Ctrl+C. The rest is in lib/:
//   console.js      prompts and keys          case-list.js / case-tree.js   choosing the cases
//   settings.js     what is asked before a run execute.js / batch.js         running one case / several
//   report.js       the HTML report           view-server.js                report and trace viewer links
//   record.js       recording a manual session
//   state.js        what the modules share    paths.js                      where the files are

const path = require('path');
const { loadConfig, secretEntries } = require('../core/config');
const { ROOT } = require('./lib/paths');
const state = require('./lib/state');
const { rl, interactive, askOptional, discardTyped, printError } = require('./lib/console');
const { QUIT, chooseCases, casesFromArgs } = require('./lib/case-tree');
const { openFile } = require('./lib/report');
const { viewPort, viewBase, startViewServer, serveUntilEnter } = require('./lib/view-server');
const { setCfg } = require('./lib/settings');
const { runCase } = require('./lib/execute');
const { runBatch } = require('./lib/batch');
const { recordSession } = require('./lib/record');

// ---------------- Ctrl+C ----------------
// readline keeps the console in raw mode, so Ctrl+C arrives as a key and is reported here instead of ending the
// process (in the case tree the keys do not reach readline: Ctrl+C is handled there, with the same result).
// - While cases run it stops them: the summary of a batch is still written. Exit code 130.
// - While a session is recorded it ends the input, i.e. the session, like Enter: what was recorded is saved.
// - At any other prompt it closes the window. It must not end the input there: the prompts that have a default
//   (settings, run mode) would take it, and the case the PO wanted to give up would run.
rl.on('SIGINT', () => {
  if (state.recording) { rl.close(); return; }
  if (state.openRuns || state.activeBatch) {
    console.log('\n\nStopped with Ctrl+C.');
    if (state.activeBatch) state.activeBatch.finish(true);
    else console.log('The run did not finish: its evidence folder has no report.');
    process.exit(130); // Playwright closes the browsers it started when the process ends
  }
  console.log('\n\nClosed with Ctrl+C.');
  process.exit(state.sessionFailed ? 1 : 0);
});

async function main() {
  const config = loadConfig(ROOT);
  const args = process.argv.slice(2);
  if (args[0] === '--view') {
    console.log(`\nReports and full replays of earlier runs: ${viewBase(config)}/`);
    if (!process.env.OREO_NO_OPEN) openFile(`${viewBase(config)}/`);
    await serveUntilEnter(config);
    return 0;
  }
  if (args[0] === '--record') {
    const { dir, pendingEnter } = await recordSession(config);
    if (!process.env.OREO_NO_OPEN) openFile(path.join(dir, 'report.html'));
    await serveUntilEnter(config, pendingEnter);
    return 0;
  }

  // A login password is never taken from the config file: whoever runs a case types it, at a hidden prompt. It is
  // asked for once per window and kept in memory only. (A recording above keeps them: there they are only used to
  // mask what is typed.)
  const ignored = secretEntries(config).map(([key]) => key);
  for (const key of ignored) setCfg(config, key, '');
  if (ignored.length) {
    console.log(`\nNote: the passwords in ${path.basename(config.__file)} are not used (${ignored.join(', ')}). You will be asked to type the password of each account a case logs in with.`);
  }

  // One window runs as many cases as the PO wants: after a run it goes back to the case list instead of closing.
  // config is the same object for all of them, so what was typed in for one run (address, account, password) is not
  // asked for again; it stays in memory only. The links of every run work until the window is closed.
  // With piped input there is nobody to ask: one choice (a case, or the cases given as arguments), as before.
  let server = null;
  for (let first = true; ; first = false) {
    let ran = false;
    let kept = null; // the browser of the case that just ran, left open until the PO goes on
    try {
      const chosen = first && args.length ? casesFromArgs(args) : await chooseCases();
      if (chosen === QUIT) break;
      if (!chosen) { if (first) return 2; break; }
      // One case runs with every step on the screen; several run as a batch that ends with a summary
      let status, dir;
      if (chosen.length === 1) {
        const one = await runCase(chosen[0], config);
        status = one.run.status;
        dir = one.dir;
        kept = one.browser;
      } else {
        ({ status, dir } = await runBatch(chosen, config));
      }
      ran = true;
      if (status !== 'passed') state.sessionFailed = true;
      if (!process.env.OREO_NO_OPEN) openFile(path.join(dir, 'report.html'));
    } catch (e) {
      // A case that cannot be run (a file of a newer format, a missing data file, a browser closed by hand) ends
      // that case, not the window
      if (!interactive || state.inputEnded) throw e;
      state.sessionFailed = true;
      printError(e);
    }
    if (ran && !server) {
      server = await startViewServer(config);
      if (!server) console.log(`   (Port ${viewPort(config)} is already in use - normally by another runner or view-trace window, which keeps the links working.)`);
    }
    if (!interactive) break;
    if (ran && server) console.log('\nThe links above work while this window stays open.');
    await discardTyped(); // an Enter pressed while the case was running must not answer this
    // A browser closed by hand in the meantime is no longer connected: there is nothing to say or to close then
    if (kept && !kept.isConnected()) kept = null;
    if (kept) {
      console.log('\nThe browser stays open on the page the case ended on, so you can look at it or go on by hand.');
      console.log('What you do there now is not part of the report or the full replay.');
    }
    const answer = await askOptional(`${(ran && server) || kept ? '' : '\n'}Press Enter to ${kept ? 'close the browser and ' : ''}choose another case, or type Q to close: `);
    if (kept) await kept.close().catch(() => {});
    if (state.inputEnded || /^(q|quit|exit)$/i.test(answer)) break;
  }
  if (server) { server.closeAllConnections?.(); server.close(); }
  return state.sessionFailed ? 1 : 0;
}

main()
  .then((code) => { rl.close(); process.exitCode = code; })
  .catch((e) => {
    rl.close();
    printError(e);
    process.exitCode = 3;
  });
