import { test } from '../framework/fixtures';
import type { TradeEarlyTerminationData, TradeProvisioningData } from '../framework/flows';
import { productsWith } from '../framework/products';
import { givenProduct, givenTrade, productTag, type GivenTradeData, type ProductData } from './support';

// Mirrors trade_early_termination.feature of the E2E project, steps included. The live trade of the Given is
// created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl in the local config.

// The direction, amount and currency of the event are case data, taken from the E2E project's test data.

type Data = TradeProvisioningData & TradeEarlyTerminationData & ProductData;

// One case for every product (explicit user requirement): QA's run repeats it for each product with the event's
// capability (framework/products.ts), each run creating its trade through the API (titles tagged @product:<PRODUCT>,
// so --grep @product:FX_TRF runs one). The case file is exported once, from the run for the product of the test
// data; the PO chooses the product, or gives the ID of a trade of that product, in the runner. Values that differ
// for a product go under "byProduct" in the test data.
test.describe('Trade early termination', () => {
  for (const forProduct of productsWith('earlyTermination')) {
    test(`[TC-TRADE-EARLY-TERMINATION-UI-001] should able to perform EarlyTermination event for a trade successfully ${productTag(forProduct)}`, async ({ Given, When, Then, And, flows, testData }) => {
      const { product, data } = givenProduct(flows, testData<Data & GivenTradeData>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker terminates it early from the trade portal and the trade is Dead with the event status Terminated', forProduct);
      givenTrade(flows, data);

      const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.trades.orCreate(() => flows.tradeProvisioning.provisionLiveTrade(product, data)));
      await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
      await When(`perform the Early Termination event on the '${product}' trade`, () => flows.tradeEarlyTermination.terminateEarly(tradeId, data));
      await Then('the early termination is completed successfully', () => flows.tradeEarlyTermination.expectCompleted());
      await And('the trade is closed as Terminated', () => flows.tradeEarlyTermination.expectClosedAsTerminated(tradeId));
    });
  }
});
