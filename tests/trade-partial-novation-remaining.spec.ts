import { test } from '../framework/fixtures';
import type { PartialNovationStart, TradePartialNovationRemainingData, TradeProvisioningData } from '../framework/flows';
import { productsWith } from '../framework/products';
import { givenProduct, givenTrade, productTag, type GivenTradeData, type ProductData } from './support';

// Mirrors trade_partial_novation_remaining.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.
// The page the event is started from is the one the feature's Examples give for the product (STARTS).
// Values that follow from the notional of the product's dat file (the dialog's equation line, the new trade's
// notional) are not checked: the case performs the event (user decision).
// The feature's step "the partial novation remaining is completed successfully" is commented out there, so it is
// not a step here either.

type Data = TradeProvisioningData & TradePartialNovationRemainingData & ProductData;

// One case for every product (explicit user requirement): QA's run repeats it for each product with the event's
// capability (framework/products.ts), each run creating its trade through the API (titles tagged @product:<PRODUCT>,
// so --grep @product:FX_TRF runs one). The case file is exported once, from the run for the product of the test
// data; the PO chooses the product, or gives the ID of a trade of that product, in the runner. Values that differ
// for a product go under "byProduct" in the test data.
test.describe('Trade partial novation remaining', () => {
  // The page the event is started from for each product, as the feature's Examples give it (FX_PSCRIPT_FSKO is
  // FX_FSB there). A product that is not listed is skipped until its value is added: it is not known yet (FX_PSCRIPT,
  // FX_CO in the feature)
  const STARTS: Partial<Record<string, PartialNovationStart>> = { FX_TRF: 'portal', FX_PSCRIPT_FSKO: 'detail' };

  for (const forProduct of productsWith('partialNovationRemaining')) {
    test(`[TC-TRADE-PARTIAL-NOVATION-REMAINING-UI-001] should able to perform Partial Novation event for a trade successfully ${productTag(forProduct)}`, async ({ Given, When, Then, And, flows, testData }) => {
      test.skip(!STARTS[forProduct], `The page the event starts from for ${forProduct} is not known yet: add the feature's Examples value to STARTS`);
      const from = STARTS[forProduct] as PartialNovationStart;
      const { product, data } = givenProduct(flows, testData<Data & GivenTradeData>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker novates a part of it to another counterparty from the trade portal; the original trade is Live with the remaining notional and a new Live trade holds the rest for the new counterparty', forProduct);
      givenTrade(flows, data);

      const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.trades.orCreate(() => flows.tradeProvisioning.provisionLiveTrade(product, data)));
      await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
      const newTradeId = await When(`perform the Partial Novation Remaining event on the '${product}' trade from ${from} page`, () => flows.tradePartialNovationRemaining.novatePartially(tradeId, from, data));
      await Then(`trade is partially novated with remaining notional retained and counterparty transferred for '${product}'`, () => flows.tradePartialNovationRemaining.expectPartiallyNovated(tradeId, newTradeId, data));
    });
  }
});
