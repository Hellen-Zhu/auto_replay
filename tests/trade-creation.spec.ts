import { test } from '../framework/fixtures';
import type { TradeCreationData } from '../framework/flows';
import { productsWith } from '../framework/products';
import { givenProduct, prepare as prepareCase, type ProductData } from './support';

// Mirrors trade_creation.feature of the E2E project, steps included: one test per scenario, each looping the products that
// support it (framework/products.ts), since not every product supports StepIn full / partial. To cover another
// product, add it to that registry and put its testdata/dat/<PRODUCT>/<PRODUCT>.dat in place; nothing changes here (a case needs a
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

  // Creation for a product and a dat file that the PO chooses. A product has more than one dat file: each is a
  // variant of the product's structure, in testdata/dat/<PRODUCT>/. A variant is data, not a case of its own: the product
  // and the file name are the case data "product" and "datFile" (the row in testdata/trade-creation.json), and the
  // runner offers the products of the package and, for the chosen product, its dat files. This repo's own case ID.
  test('[TC-TRADE-CREATION-UI-006] Maker creates a new trade from a chosen dat file of the product', async ({ When, And, Then, flows, testData }) => {
    const { product, data } = givenProduct(flows, testData<TradeCreationData & ProductData>(), 'Maker books a new trade of the product in the case data from the dat file in the case data (one of the files in the folder of the product) and verifies it is created with pending approval status');

    await When('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    const tradeId = await And(`creates a new '${product}' trade`, () => flows.tradeCreation.createTrade(product, data));
    await Then('trade is created with pending approval status and info', () => flows.tradeCreation.expectPendingApproval(tradeId));
  });
});
