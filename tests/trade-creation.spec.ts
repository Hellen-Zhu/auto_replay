import fs from 'fs';
import path from 'path';
import { test } from '../framework/fixtures';
import { datFile, type TradeCreationData } from '../framework/flows';
import { productsWith } from '../framework/products';

// Mirrors trade_creation.feature of the E2E project: one test per scenario, each looping the products that
// support it (framework/products.ts), since not every product supports StepIn full / partial. To cover another
// product, add it to that registry and put its data/<PRODUCT>.dat in place; nothing changes here (a case needs a
// row in testdata/trade-creation.json only for values that differ from the shared ones).

/** Skips the case when the product's dat file is not there, and sets the description shown to the PO */
function prepare(product: string, what: string) {
  test.skip(!fs.existsSync(path.resolve(__dirname, '..', datFile(product))), `${datFile(product)} is missing`);
  test.info().annotations.push({
    type: 'description',
    description: `Maker books a new ${product} ${what} from its dat file and verifies it is created with pending approval status`,
  });
}

test.describe('Trade creation', () => {
  for (const product of productsWith('create')) {
    test(`[TC-TRADE-CREATION-${product}-UI-001] Maker creates a new ${product} trade`, async ({ flows, testData }) => {
      prepare(product, 'trade');
      const data = testData<TradeCreationData>();

      await flows.auth.login('maker');
      const tradeId = await flows.tradeCreation.createTrade(product, data);
      await flows.tradeCreation.expectPendingApproval(tradeId);
    });
  }

  for (const product of productsWith('stepInFull')) {
    test(`[TC-TRADE-CREATION-${product}-UI-002] Maker creates a new ${product} StepIn full trade`, async ({ flows, testData }) => {
      prepare(product, 'StepIn full trade');
      const data = testData<TradeCreationData>();

      await flows.auth.login('maker');
      const tradeId = await flows.tradeCreation.createStepInFullTrade(product, data);
      await flows.tradeCreation.expectPendingApproval(tradeId);
    });
  }

  for (const product of productsWith('stepInPartial')) {
    test(`[TC-TRADE-CREATION-${product}-UI-003] Maker creates a new ${product} StepIn partial trade`, async ({ flows, testData }) => {
      prepare(product, 'StepIn partial trade');
      const data = testData<TradeCreationData>();

      await flows.auth.login('maker');
      const tradeId = await flows.tradeCreation.createStepInPartialTrade(product, data);
      await flows.tradeCreation.expectPendingApproval(tradeId);
    });
  }

  // A data variation of one product, so a single test outside the loops; the direction comes from this case's
  // row in testdata/trade-creation.json
  test('[TC-TRADE-CREATION-FX_TRF-UI-004] Maker creates a new FX_TRF trade with direction Sell', async ({ flows, testData }) => {
    const product = 'FX_TRF';
    prepare(product, 'trade with direction Sell');
    const data = testData<TradeCreationData>();

    await flows.auth.login('maker');
    const tradeId = await flows.tradeCreation.createTrade(product, data);
    await flows.tradeCreation.expectPendingApproval(tradeId);
  });
});
