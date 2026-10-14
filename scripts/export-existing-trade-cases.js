#!/usr/bin/env node
// Runs the cases of tests/existing-trade.spec.ts on trades it creates, so that their case files are exported in the
// form the PO needs: the trade ID is entered in the runner.
//
//   npm run export:existing-trade                      (product FX_TRF)
//   npm run export:existing-trade -- --product=FX_DCD --headed
//   npm run export:existing-trade -- --events          (also the TC-TRADE-<EVENT>-EXISTING-UI-... cases of that spec)
//
// Without a trade ID those cases create their own trade (and their exported case file would do the same), or are
// skipped when the state they start from cannot be created. This script gives each the ID of a trade in
// OREO_TRADE_ID. It gets the trades by running the trade creation case of the product, which leaves its trade pending approval, and then
// runs each case with the ID of a trade that is in the state the case starts from:
//
//   trade 1: 001 approve (LIVE) -> 003 cancel (pending cancellation) -> 004 approve the cancellation (DEAD)
//   trade 2: 002 reject (DRFT)
//   trade 3: 001 approve (LIVE) -> 003 cancel (pending cancellation) -> 005 reject the cancellation (LIVE)
//
// 001 and 003 run twice; the second run only prepares the trade and exports the same case file again.
// Every run books three real trades in the system the local config points at. It stops at the first case that
// does not pass; nothing is rolled back.
// With --events it goes on with the case on an existing trade of each other lifecycle event
// (TC-TRADE-<EVENT>-EXISTING-UI-..., in the same spec): one more trade per case, made Live by 001, then the event (for the amendment the
// maker's case and then the checker's on the same trade). That books ten
// more real trades. The values those cases check come from testdata/ and are those of testdata/dat/<PRODUCT>/<PRODUCT>.dat
// of FX_TRF (the notionals of the partial novation, for one).
// Any other argument is passed on to Playwright (--headed, --trace ...).

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLAYWRIGHT = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
const SPEC = 'tests/existing-trade.spec.ts';
const CREATION_SPEC = 'tests/trade-creation.spec.ts';

const args = process.argv.slice(2);
const productArg = args.find((a) => a.startsWith('--product='));
const product = productArg ? productArg.slice('--product='.length) : 'FX_TRF';
const withEvents = args.includes('--events');
const passOn = args.filter((a) => a !== productArg && a !== '--events');

const existing = (n) => `TC-EXISTING-TRADE-UI-00${n}`;
const own = (...numbers) => numbers.map((n) => ({ spec: SPEC, caseId: existing(n) }));
// An event's case on an existing trade starts from a Live trade: the trade is made Live first
const event = (name, ...numbers) => [...own(1), ...(numbers.length ? numbers : [1]).map((n) => ({ spec: SPEC, caseId: `TC-TRADE-${name.toUpperCase()}-EXISTING-UI-00${n}` }))];
const PLAN = [
  own(1, 3, 4),
  own(2),
  own(1, 3, 5),
  ...(withEvents ? [
    event('allocation'),
    event('early-termination'),
    event('partial-termination'),
    event('novation-remaining'),
    event('step-out-full'),
    event('step-out-partial'),
    event('portfolio-reassignment'),
    // the maker amends, then the checker decides: two cases, each with its own login
    event('amendment', 2, 4),
    event('amendment', 3, 5),
    event('partial-novation-remaining'),
  ] : []),
];

/** Runs one case by its ID; resolves with what Playwright printed */
function runCase(spec, caseId, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PLAYWRIGHT, 'test', spec, '-g', `\\[${caseId}\\]`, '--workers=1', ...passOn], {
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
      if (code !== 0) return reject(new Error(`${caseId} did not pass (exit code ${code})`));
      // A skipped case also ends with exit code 0
      if (!/Exported case: /.test(output)) return reject(new Error(`${caseId} was not run: see the reason above (skipped, or no test with that ID)`));
      resolve(output);
    });
  });
}

/** A new trade that is pending approval: the creation case of the product. Returns its ID */
async function createPendingTrade() {
  const caseId = `TC-TRADE-CREATION-${product}-UI-001`;
  const output = await runCase(CREATION_SPEC, caseId, {});
  const id = output.match(/createdTradeId = (\S+)/)?.[1];
  if (!id) throw new Error(`${caseId} passed but printed no createdTradeId`);
  return id;
}

async function main() {
  if (!fs.existsSync(PLAYWRIGHT)) throw new Error('Playwright is not installed: run npm install first');

  const trades = [];
  try {
    for (const [i, cases] of PLAN.entries()) {
      console.log(`\n=== Trade ${i + 1} of ${PLAN.length}: creating a ${product} trade that is pending approval ===`);
      const tradeId = await createPendingTrade();
      trades.push(tradeId);
      for (const { spec, caseId } of cases) {
        console.log(`\n=== Trade ${i + 1} (${tradeId}): ${caseId} ===`);
        await runCase(spec, caseId, { OREO_TRADE_ID: tradeId });
      }
    }
  } finally {
    if (trades.length) console.log(`\nTrades created by this run: ${trades.join(', ')}`);
  }
  console.log('The case files are in cases/existing-trade/');
}

main().catch((e) => {
  console.error(`\nStopped: ${e.message}`);
  process.exit(1);
});
