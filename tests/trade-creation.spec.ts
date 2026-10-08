import fs from 'fs';
import path from 'path';
import { test } from '../framework/fixtures';
import { datFile, type TradeCreationData } from '../framework/flows';

// Mirrors trade_creation.feature of the E2E project: one test per scenario, each with its own list of products,
// since not every product supports StepIn full / partial. To cover another product, add it to the lists of the
// scenarios it supports and put its data/<PRODUCT>.dat in place (a case needs a row in
// testdata/trade-creation.json only for values that differ from the shared ones); the product type is also what is typed into the Product ID field.
const PRODUCTS = ['FX_PSCRIPT', 'FX_TRF', 'FX_PSCRIPT_FSKO'];
const STEPIN_FULL_PRODUCTS = ['FX_PSCRIPT', 'FX_TRF', 'FX_PSCRIPT_FSKO'];
const STEPIN_PARTIAL_PRODUCTS = ['FX_PSCRIPT', 'FX_TRF', 'FX_PSCRIPT_FSKO'];
const SELL_PRODUCTS = ['FX_TRF'];

/** Skips the case when the product's dat file is not there, and sets the description shown to the PO */
function prepare(product: string, what: string) {
  test.skip(!fs.existsSync(path.resolve(__dirname, '..', datFile(product))), `${datFile(product)} is missing`);
  test.info().annotations.push({
    type: 'description',
    description: `Maker books a new ${product} ${what} from its dat file and verifies it is created with pending approval status`,
  });
}

test.describe('Trade creation', () => {
  for (const product of PRODUCTS) {
    test(`[TC-TRADE-CREATION-${product}-UI-001] Maker creates a new ${product} trade`, async ({ flows, testData }) => {
      prepare(product, 'trade');
      const data = testData<TradeCreationData>();

      await flows.auth.login('maker');
      const tradeId = await flows.tradeCreation.createTrade(product, data);
      await flows.tradeCreation.expectPendingApproval(tradeId);
    });
  }

  for (const product of STEPIN_FULL_PRODUCTS) {
    test(`[TC-TRADE-CREATION-${product}-UI-002] Maker creates a new ${product} StepIn full trade`, async ({ flows, testData }) => {
      prepare(product, 'StepIn full trade');
      const data = testData<TradeCreationData>();

      await flows.auth.login('maker');
      const tradeId = await flows.tradeCreation.createStepInFullTrade(product, data);
      await flows.tradeCreation.expectPendingApproval(tradeId);
    });
  }

  for (const product of STEPIN_PARTIAL_PRODUCTS) {
    test(`[TC-TRADE-CREATION-${product}-UI-003] Maker creates a new ${product} StepIn partial trade`, async ({ flows, testData }) => {
      prepare(product, 'StepIn partial trade');
      const data = testData<TradeCreationData>();

      await flows.auth.login('maker');
      const tradeId = await flows.tradeCreation.createStepInPartialTrade(product, data);
      await flows.tradeCreation.expectPendingApproval(tradeId);
    });
  }

  // The direction comes from this case's row in testdata/trade-creation.json
  for (const product of SELL_PRODUCTS) {
    test(`[TC-TRADE-CREATION-${product}-UI-004] Maker creates a new ${product} trade with direction Sell`, async ({ flows, testData }) => {
      prepare(product, 'trade with direction Sell');
      const data = testData<TradeCreationData>();

      await flows.auth.login('maker');
      const tradeId = await flows.tradeCreation.createTrade(product, data);
      await flows.tradeCreation.expectPendingApproval(tradeId);
    });
  }
});
