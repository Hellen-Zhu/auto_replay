import { test } from '../framework/fixtures';
import type { TradeNovationRemainingData, TradeProvisioningData } from '../framework/flows';
import { productsWith } from '../framework/products';
import { givenProduct, givenTrade, type GivenTradeData, type ProductData } from './support';

// Mirrors trade_novation_remaining.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.
// The feature's input profiles (WITH_TARGET_AMOUNT / WITHOUT_TARGET_AMOUNT per product) are replaced by the test data
// (user decision): the target amount is typed when novationTargetAmount has a value, and left out when it is empty
// (byProduct.<PRODUCT> in testdata/trade-novation-remaining.json for a product without one; the PO may empty it too).
// The feature's last step is "the original trade is closed as Novated and new novated trade is live". How the new
// trade is found was not seen in the E2E project, so only the original trade is checked and the step says so.

type Data = TradeProvisioningData & TradeNovationRemainingData & ProductData;

// One case per product (explicit user requirement): the test is repeated for each product with the event's capability
// (framework/products.ts), the product in its case ID like the creation cases ([TC-TRADE-<EVENT>-<PRODUCT>-UI-001],
// so --grep FX_TRF-UI runs one product), each run creating its trade through the API and exporting its own case file.
// Values that differ for a product go under "byProduct" in the test data.
test.describe('Trade novation remaining', () => {
  for (const forProduct of productsWith('novationRemaining')) {
    test(`[TC-TRADE-NOVATION-REMAINING-${forProduct}-UI-001] should able to perform Novation Remaining event for a ${forProduct} trade successfully`, async ({ Given, When, Then, And, flows, testData }) => {
      const { product, data } = givenProduct(flows, testData<Data & GivenTradeData>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker novates the remaining trade to another counterparty from the trade portal and the original trade is Dead with the event status Novated', forProduct);
      givenTrade(flows, data);

      const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.trades.orCreate(() => flows.tradeProvisioning.provisionLiveTrade(product, data)));
      await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
      await When(`perform the Novation Remaining event on the '${product}' trade`, () => flows.tradeNovationRemaining.novateRemaining(tradeId, data));
      await Then('the novation remaining is completed successfully', () => flows.tradeNovationRemaining.expectCompleted());
      await And('the original trade is closed as Novated', () => flows.tradeNovationRemaining.expectOriginalClosedAsNovated(tradeId));
    });
  }
});
