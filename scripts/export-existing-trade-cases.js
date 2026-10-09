#!/usr/bin/env node
// Runs the five cases of tests/existing-trade.spec.ts once each, so that their case files are exported.
//
//   npm run export:existing-trade                      (product FX_TRF)
//   npm run export:existing-trade -- --product=FX_DCD --headed
//
// Those cases work on a trade that already exists and are skipped without OREO_TRADE_ID. This script gets the
// trades by running the trade creation case of the product, which leaves its trade pending approval, and then
// runs each case with the ID of a trade that is in the state the case starts from:
//
//   trade 1: 001 approve (LIVE) -> 003 cancel (pending cancellation) -> 004 approve the cancellation (DEAD)
//   trade 2: 002 reject (DRFT)
//   trade 3: 001 approve (LIVE) -> 003 cancel (pending cancellation) -> 005 reject the cancellation (LIVE)
//
// 001 and 003 run twice; the second run only prepares the trade and exports the same case file again.
// Every run books three real trades in the system the local config points at. It stops at the first case that
// does not pass; nothing is rolled back.
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
const passOn = args.filter((a) => a !== productArg);

const existing = (n) => `TC-EXISTING-TRADE-UI-00${n}`;
const PLAN = [
  { trade: 1, cases: [1, 3, 4] },
  { trade: 2, cases: [2] },
  { trade: 3, cases: [1, 3, 5] },
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
    for (const { trade, cases } of PLAN) {
      console.log(`\n=== Trade ${trade} of ${PLAN.length}: creating a ${product} trade that is pending approval ===`);
      const tradeId = await createPendingTrade();
      trades.push(tradeId);
      for (const n of cases) {
        console.log(`\n=== Trade ${trade} (${tradeId}): ${existing(n)} ===`);
        await runCase(SPEC, existing(n), { OREO_TRADE_ID: tradeId });
      }
    }
  } finally {
    if (trades.length) console.log(`\nTrades created by this run: ${trades.join(', ')}`);
  }
  console.log('The five case files are in cases/existing-trade/');
}

main().catch((e) => {
  console.error(`\nStopped: ${e.message}`);
  process.exit(1);
});
