import { test } from '../framework/fixtures';
import type { TradeCreationData } from '../framework/flows';
import { productsWith } from '../framework/products';
import { prepare as prepareCase } from './support';

// Mirrors trade_creation.feature of the E2E project, steps included: one test per scenario, each looping the products that
// support it (framework/products.ts), since not every product supports StepIn full / partial. To cover another
// product, add it to that registry and put its data/<PRODUCT>.dat in place; nothing changes here (a case needs a
// row in testdata/trade-creation.json only for values that differ from the shared ones).

const prepare = (product: string, what: string) =>
  prepareCase(product, `Maker books a new ${product} ${what} from its dat file and verifies it is created with pending approval status`);

test.describe('Trade creation', () => {
  for (const product of productsWith('create')) {
    test(`[TC-TRADE-CREATION-${product}-UI-001] Maker creates a new ${product} trade`, async ({ When, And, Then, flows, testData }) => {
      prepare(product, 'trade');
      const data = testData<TradeCreationData>();

      await When('maker is logged in to the trade portal', () => flows.auth.login('maker'));
      const tradeId = await And(`creates a new '${product}' trade`, () => flows.tradeCreation.createTrade(product, data));
      await Then('trade is created with pending approval status and info', () => flows.tradeCreation.expectPendingApproval(tradeId));
    });
  }

  for (const product of productsWith('stepInFull')) {
    test(`[TC-TRADE-CREATION-${product}-UI-002] Maker creates a new ${product} StepIn full trade`, async ({ When, And, Then, flows, testData }) => {
      prepare(product, 'StepIn full trade');
      const data = testData<TradeCreationData>();

      await When('maker is logged in to the trade portal', () => flows.auth.login('maker'));
      const tradeId = await And(`creates a new '${product}' StepIn full trade`, () => flows.tradeCreation.createStepInFullTrade(product, data));
      await Then('trade is created with pending approval status and info', () => flows.tradeCreation.expectPendingApproval(tradeId));
    });
  }

  for (const product of productsWith('stepInPartial')) {
    test(`[TC-TRADE-CREATION-${product}-UI-003] Maker creates a new ${product} StepIn partial trade`, async ({ When, And, Then, flows, testData }) => {
      prepare(product, 'StepIn partial trade');
      const data = testData<TradeCreationData>();

      await When('maker is logged in to the trade portal', () => flows.auth.login('maker'));
      const tradeId = await And(`creates a new '${product}' StepIn partial trade`, () => flows.tradeCreation.createStepInPartialTrade(product, data));
      await Then('trade is created with pending approval status and info', () => flows.tradeCreation.expectPendingApproval(tradeId));
    });
  }

  // The checker's decision on a new trade. These two scenarios are not in the E2E project's feature as far as it is
  // known here: the case IDs and the last step line of each are this repo's, the other step lines are the feature's.
  for (const product of productsWith('create')) {
    test(`[TC-TRADE-CREATION-${product}-UI-005] New ${product} trade becomes Live after checker approves it`, async ({ When, And, Then, flows, testData }) => {
      prepareCase(product, `Maker books a new ${product} trade from its dat file, checker approves it from the trade portal and the trade is live`);
      const data = testData<TradeCreationData>();

      await When('maker is logged in to the trade portal', () => flows.auth.login('maker'));
      const tradeId = await And(`creates a new '${product}' trade`, () => flows.tradeCreation.createTrade(product, data));
      await Then('trade is created with pending approval status and info', () => flows.tradeCreation.expectPendingApproval(tradeId));
      await When('checker is logged in to the trade portal', () => flows.auth.login('checker'));
      await And('approves the pending trade from trade portal', () => flows.tradeApproval.approveFromTradePortal(tradeId));
      await Then('the trade is approved successfully', () => flows.tradeApproval.expectApproved());
      await And('the trade is Live', () => flows.tradeCreation.expectLive(tradeId));
    });

    test(`[TC-TRADE-CREATION-${product}-UI-006] New ${product} trade goes back to Draft after checker rejects it`, async ({ When, And, Then, flows, testData }) => {
      prepareCase(product, `Maker books a new ${product} trade from its dat file, checker rejects it from the trade portal and the trade is a draft again`);
      const data = testData<TradeCreationData>();

      await When('maker is logged in to the trade portal', () => flows.auth.login('maker'));
      const tradeId = await And(`creates a new '${product}' trade`, () => flows.tradeCreation.createTrade(product, data));
      await Then('trade is created with pending approval status and info', () => flows.tradeCreation.expectPendingApproval(tradeId));
      await When('checker is logged in to the trade portal', () => flows.auth.login('checker'));
      await And('rejects the pending trade from trade portal', () => flows.tradeApproval.rejectFromTradePortal(tradeId));
      await Then('the trade is rejected successfully', () => flows.tradeApproval.expectRejected());
      await And('the trade is a Draft', () => flows.tradeCreation.expectDraft(tradeId));
    });
  }

  // A data variation of one product, so a single test outside the loops; the direction comes from this case's
  // row in testdata/trade-creation.json
  test('[TC-TRADE-CREATION-FX_TRF-UI-004] Maker creates a new FX_TRF trade with direction Sell', async ({ When, And, Then, flows, testData }) => {
    const product = 'FX_TRF';
    prepare(product, 'trade with direction Sell');
    const data = testData<TradeCreationData>();

    await When('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    const tradeId = await And(`creates a new '${product}' trade with direction Sell`, () => flows.tradeCreation.createTrade(product, data));
    await Then('trade is created with pending approval status and info', () => flows.tradeCreation.expectPendingApproval(tradeId));
  });
});
