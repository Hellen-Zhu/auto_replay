// Not a case: creates the trade a case on an existing trade starts from, through the API, for
// scripts/export-existing-trade-cases.js. It is skipped unless that script starts it:
//
//   OREO_PROVISION_STATE   pendingApproval or live
//   OREO_PROVISION_CASE    the ID of the case the trade is for: its data (testdata/existing-trade.json, with the
//                          shared block "given-trade") gives the product, the dat file, the trade type and the
//                          values the trade is created with, as when the case creates its own trade
//   OREO_PROVISION_PRODUCT, OREO_PROVISION_DAT_FILE, OREO_PROVISION_TRADE_TYPE   optional: other values for this run;
//                          another product without a dat file takes that product's default one
//
// The trade ID is printed as "createdTradeId = ...". The script points OREO_CASES_DIR at a folder of its own, so
// the file the fixture exports after the pass does not end up in cases/.

import { test } from '../../framework/fixtures';
import type { TradeProvisioningData } from '../../framework/flows';
import { findCase } from '../../framework/data';
import { prepare, type ProductData } from '../../tests/support';

const STATES = ['pendingApproval', 'live'] as const;
type State = (typeof STATES)[number];

const env = (name: string) => (process.env[name] || '').trim();

test('Given trade for a case on an existing trade', async ({ flows }) => {
  const state = env('OREO_PROVISION_STATE') as State;
  const caseId = env('OREO_PROVISION_CASE');
  test.skip(!state || !caseId, 'started by scripts/export-existing-trade-cases.js only');
  if (!STATES.includes(state)) throw new Error(`OREO_PROVISION_STATE is "${state}": it must be one of ${STATES.join(', ')}`);

  const { id, tradeId, ...row } = findCase<TradeProvisioningData & ProductData & { tradeId?: string }>('existing-trade', caseId);
  const data: TradeProvisioningData & ProductData = { ...row };
  if (env('OREO_PROVISION_PRODUCT')) {
    data.product = env('OREO_PROVISION_PRODUCT');
    delete data.datFile; // the dat file of another product is not the one of the test data
  }
  if (env('OREO_PROVISION_DAT_FILE')) data.datFile = env('OREO_PROVISION_DAT_FILE');
  if (env('OREO_PROVISION_TRADE_TYPE')) data.tradeType = env('OREO_PROVISION_TRADE_TYPE') as TradeProvisioningData['tradeType'];
  const { product, ...rest } = data;
  if (!product) throw new Error(`The test data of ${id} has no product`);
  prepare(product, `A ${state} ${product} trade for ${id}`, rest.datFile);

  const p = flows.tradeCreation.productAsCaseData(product);
  if (state === 'live') await flows.tradeProvisioning.provisionLiveTrade(p, rest);
  else await flows.tradeProvisioning.provisionPendingTrade(p, rest);
});
