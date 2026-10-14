import { test } from '../framework/fixtures';
import type { TradeStepOutPartialData, TradeProvisioningData } from '../framework/flows';
import { productsWith } from '../framework/products';
import { givenProduct, givenTrade, productTag, type GivenTradeData, type ProductData } from './support';

// Mirrors trade_step_out_partial.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.


type Data = TradeProvisioningData & TradeStepOutPartialData & ProductData;

// One case for every product (explicit user requirement): QA's run repeats it for each product with the event's
// capability (framework/products.ts), each run creating its trade through the API (titles tagged @product:<PRODUCT>,
// so --grep @product:FX_TRF runs one). The case file is exported once, from the run for the product of the test
// data; the PO chooses the product, or gives the ID of a trade of that product, in the runner. Values that differ
// for a product go under "byProduct" in the test data.
test.describe('Trade step out partial', () => {
  for (const forProduct of productsWith('stepOutPartial')) {
    test(`[TC-TRADE-STEP-OUT-PARTIAL-UI-001] should able to perform Step Out Partial event for a trade successfully ${productTag(forProduct)}`, async ({ Given, When, Then, And, flows, testData }) => {
      const { product, data } = givenProduct(flows, testData<Data & GivenTradeData>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker steps out of a part of it from the trade portal and the trade is still Live, with the event status Novated', forProduct);
      givenTrade(flows, data);

      const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.trades.orCreate(() => flows.tradeProvisioning.provisionLiveTrade(product, data)));
      await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
      await When(`perform the Step Out Partial event on the '${product}' trade`, () => flows.tradeStepOut.stepOutPartial(tradeId, data));
      await Then('the step out partial is completed successfully', () => flows.tradeStepOut.expectPartialCompleted());
      await And('the trade remains Live and is marked as Novated', () => flows.tradeStepOut.expectLiveAndNovated(tradeId));
    });
  }
});
