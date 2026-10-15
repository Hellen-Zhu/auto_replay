import { test } from '../framework/fixtures';
import type { TradePartialNovationRemainingData, TradeProvisioningData } from '../framework/flows';
import { productsWith } from '../framework/products';
import { givenProduct, givenTrade, type GivenTradeData, type ProductData } from './support';

// Mirrors trade_partial_novation_remaining.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.
// The event is started from the action menu of the trade's row for every product (user decision; the feature's
// Examples start it from the trade details for FX_FSB = FX_PSCRIPT_FSKO).
// Values that follow from the notional of the product's dat file (the dialog's equation line, the new trade's
// notional) are not checked: the case performs the event (user decision).
// The feature's step "the partial novation remaining is completed successfully" is commented out there, so it is
// not a step here either.

type Data = TradeProvisioningData & TradePartialNovationRemainingData & ProductData;

// One case per product (explicit user requirement): the test is repeated for each product with the event's capability
// (framework/products.ts), the product in its case ID like the creation cases ([TC-TRADE-<EVENT>-<PRODUCT>-UI-001],
// so --grep FX_TRF-UI runs one product), each run creating its trade through the API and exporting its own case file.
// Values that differ for a product go under "byProduct" in the test data.
test.describe('Trade partial novation remaining', () => {
  for (const forProduct of productsWith('partialNovationRemaining')) {
    test(`[TC-TRADE-PARTIAL-NOVATION-REMAINING-${forProduct}-UI-001] should able to perform Partial Novation event for a ${forProduct} trade successfully`, async ({ Given, When, Then, And, flows, testData }) => {
      const { product, data } = givenProduct(flows, testData<Data & GivenTradeData>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker novates a part of it to another counterparty from the trade portal; the original trade is Live with the remaining notional and a new Live trade holds the rest for the new counterparty', forProduct);
      givenTrade(flows, data);

      const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.trades.orCreate(() => flows.tradeProvisioning.provisionLiveTrade(product, data)));
      await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
      const newTradeId = await When(`perform the Partial Novation Remaining event on the '${product}' trade from portal page`, () => flows.tradePartialNovationRemaining.novatePartially(tradeId, data));
      await Then(`trade is partially novated with remaining notional retained and counterparty transferred for '${product}'`, () => flows.tradePartialNovationRemaining.expectPartiallyNovated(tradeId, newTradeId, data));
    });
  }
});
