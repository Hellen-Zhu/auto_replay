import { test } from '../framework/fixtures';
import type { TradePartialTerminationData, TradeProvisioningData } from '../framework/flows';
import { productsWith } from '../framework/products';
import { givenProduct, givenTrade, type GivenTradeData, type ProductData } from './support';

// Mirrors trade_partial_termination.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.

// The end of the feature's title was not visible when it was copied: it is completed here with the event's name.

type Data = TradeProvisioningData & TradePartialTerminationData & ProductData;

// One case per product (explicit user requirement): the test is repeated for each product with the event's capability
// (framework/products.ts), the product in its case ID like the creation cases ([TC-TRADE-<EVENT>-<PRODUCT>-UI-001],
// so --grep FX_TRF-UI runs one product), each run creating its trade through the API and exporting its own case file.
// Values that differ for a product go under "byProduct" in the test data.
test.describe('Trade partial termination', () => {
  for (const forProduct of productsWith('partialTermination')) {
    test(`[TC-TRADE-PARTIAL-TERMINATION-${forProduct}-UI-001] Updated trade position is reflected accurately for a trade after maker triggers Partial Termination`, async ({ Given, When, Then, And, flows, testData }) => {
      const { product, data } = givenProduct(flows, testData<Data & GivenTradeData>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker reduces its notional with a partial termination from the trade portal and the trade details show the new notional, the trade still Live', forProduct);
      givenTrade(flows, data);

      const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.trades.orCreate(() => flows.tradeProvisioning.provisionLiveTrade(product, data)));
      await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
      await When(`perform Partial Termination event on the '${product}' trade`, () => flows.tradePartialTermination.terminatePartially(tradeId, data));
      await Then('the partial termination is completed successfully', () => flows.tradePartialTermination.expectCompleted());
      await And('the trade notional reflects the partial termination reduction in trade detail page', () => flows.tradePartialTermination.expectNotionalReduced(tradeId, data));
    });
  }
});
