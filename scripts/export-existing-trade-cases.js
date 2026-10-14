#!/usr/bin/env node
// Runs the cases of tests/existing-trade.spec.ts on trades it creates, so that their case files are exported in the
// form the PO needs: the trade ID is entered in the runner.
//
//   npm run export:existing-trade
//   npm run export:existing-trade -- --events          (also the TC-TRADE-<EVENT>-EXISTING-UI-... cases of that spec)
//   npm run export:existing-trade -- --product=FX_DCD --datFile=FX_DCD.dat --tradeType=StepInFull --headed
//
// Without a trade ID those cases create their own trade (and their exported case file would do the same), or are
// skipped when the state they start from cannot be created. This script gives each the ID of a trade in
// OREO_TRADE_ID. Each trade is created through the API (scripts/provision/given-trade.spec.ts) in the state the
// first case of its chain starts from, with the data of that case: product, dat file, trade type and values of
// testdata/existing-trade.json and its shared blocks ("given-trade"), as when the case creates its own trade.
// --product, --datFile and --tradeType replace those values for every trade of the run; another product without
// --datFile takes that product's default dat file. Then the chain runs on the trade, each case leaving it in the
// state the next one starts from:
//
//   pending approval: approve-creation 001 (LIVE) -> cancellation 001 cancel -> approve-cancellation 001 (DEAD)
//   pending approval: reject-creation 001 (DRFT)
//   live:             cancellation 001 cancel -> reject-cancellation 001 (LIVE)
//
// Cancellation 001 runs twice; the second run only prepares the trade and exports the same case file again.
// Every run books three real trades in the system the local config points at. It stops at the first case that
// does not pass; nothing is rolled back.
// With --events it goes on with the case on an existing trade of each other lifecycle event
// (TC-TRADE-<EVENT>-EXISTING-UI-..., in the same spec): one more Live trade per chain, then the event (for the
// amendment the maker's case and then the checker's on the same trade: approve-amendment 001 on one trade,
// reject-amendment 001 on another; amendment 001 runs twice). That books ten more real trades. The values
// those cases check come from testdata/ and may depend on the dat file (the notionals of the partial novation).
// Any other argument is passed on to Playwright (--headed, --trace ...).

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLAYWRIGHT = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
const SPEC = 'tests/existing-trade.spec.ts';
const PROVISION_SPEC = 'scripts/provision/given-trade.spec.ts';
const PROVISION_CONFIG = 'scripts/provision/playwright.config.ts';

const args = process.argv.slice(2);
const OVERRIDES = { product: 'OREO_PROVISION_PRODUCT', datFile: 'OREO_PROVISION_DAT_FILE', tradeType: 'OREO_PROVISION_TRADE_TYPE' };
const overrides = {};
const ours = new Set(['--events']);
for (const a of args) {
  const m = /^--(\w+)=(.*)$/.exec(a);
  if (m && OVERRIDES[m[1]]) {
    overrides[OVERRIDES[m[1]]] = m[2];
    ours.add(a);
  }
}
const withEvents = args.includes('--events');
const passOn = args.filter((a) => !ours.has(a));

/** The ID of a case on an existing trade: the action it performs (an event, or approve-creation ...) and its number */
const id = (action, n = 1) => `TC-TRADE-${action.toUpperCase()}-EXISTING-UI-00${n}`;
/** A trade in the state the first case starts from, and the cases that run on it one after another */
const chain = (state, ...cases) => ({ state, cases });
const event = (name, ...then) => chain('live', id(name), ...then.map((action) => id(action)));
const PLAN = [
  chain('pendingApproval', id('approve-creation'), id('cancellation'), id('approve-cancellation')),
  chain('pendingApproval', id('reject-creation')),
  chain('live', id('cancellation'), id('reject-cancellation')),
  ...(withEvents ? [
    event('allocation'),
    event('early-termination'),
    event('partial-termination'),
    event('novation-remaining'),
    event('step-out-full'),
    event('step-out-partial'),
    event('portfolio-reassignment'),
    // the maker amends, then the checker decides: two cases, each with its own login
    event('amendment', 'approve-amendment'),
    event('amendment', 'reject-amendment'),
    event('partial-novation-remaining'),
  ] : []),
];

/** Runs the tests of a spec (the one case with that ID, or all); resolves with what Playwright printed */
function run(label, testArgs, env, notRun = 'see the reason above (skipped, or no test with that ID)') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PLAYWRIGHT, 'test', ...testArgs, '--workers=1', ...passOn], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['inherit', 'pipe', 'inherit'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`${label} did not pass (exit code ${code})`));
      // A skipped case also ends with exit code 0
      if (!/Exported case: /.test(output)) return reject(new Error(`${label} was not run: ${notRun}`));
      resolve(output);
    });
  });
}

const runCase = (caseId, env) => run(caseId, [SPEC, '-g', `\\[${caseId}\\]`], env);

/** A new trade in that state, created through the API with the data of the case it is for. Returns its ID */
async function createTrade(state, caseId, casesDir) {
  const output = await run(`Creating the trade for ${caseId}`, [PROVISION_SPEC, '--config', PROVISION_CONFIG], {
    ...overrides,
    OREO_PROVISION_STATE: state,
    OREO_PROVISION_CASE: caseId,
    // the file the fixture exports after the pass is not a case: kept out of cases/
    OREO_CASES_DIR: casesDir,
  }, 'skipped, because the dat file of the product is missing (testdata/dat/<PRODUCT>/<datFile>)');
  const tradeId = output.match(/createdTradeId = (\S+)/)?.[1];
  if (!tradeId) throw new Error(`The trade for ${caseId} was created but no createdTradeId was printed`);
  return tradeId;
}

async function main() {
  if (!fs.existsSync(PLAYWRIGHT)) throw new Error('Playwright is not installed: run npm install first');

  const casesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oreo-provision-'));
  const trades = [];
  try {
    for (const [i, { state, cases }] of PLAN.entries()) {
      console.log(`\n=== Trade ${i + 1} of ${PLAN.length}: creating a ${state} trade with the data of ${cases[0]} ===`);
      const tradeId = await createTrade(state, cases[0], casesDir);
      trades.push(tradeId);
      for (const caseId of cases) {
        console.log(`\n=== Trade ${i + 1} (${tradeId}): ${caseId} ===`);
        await runCase(caseId, { OREO_TRADE_ID: tradeId });
      }
    }
  } finally {
    fs.rmSync(casesDir, { recursive: true, force: true });
    if (trades.length) console.log(`\nTrades created by this run: ${trades.join(', ')}`);
  }
  console.log('The case files are in cases/existing-trade/');
}

main().catch((e) => {
  console.error(`\nStopped: ${e.message}`);
  process.exit(1);
});
