import { test } from '../framework/fixtures';
import type { NovationInputProfile, TradeNovationRemainingData, TradeProvisioningData } from '../framework/flows';
import { productsWith } from '../framework/products';
import { givenProduct, givenTrade, productTag, type GivenTradeData, type ProductData } from './support';

// Mirrors trade_novation_remaining.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.
// The input profile is the one the feature's Examples give for the product (PROFILES).
// The feature's last step is "the original trade is closed as Novated and new novated trade is live". How the new
// trade is found was not seen in the E2E project, so only the original trade is checked and the step says so.

type Data = TradeProvisioningData & TradeNovationRemainingData & ProductData;

// One case for every product (explicit user requirement): QA's run repeats it for each product with the event's
// capability (framework/products.ts), each run creating its trade through the API (titles tagged @product:<PRODUCT>,
// so --grep @product:FX_TRF runs one). The case file is exported once, from the run for the product of the test
// data; the PO chooses the product, or gives the ID of a trade of that product, in the runner. Values that differ
// for a product go under "byProduct" in the test data.
test.describe('Trade novation remaining', () => {
  // The input profile of each product, as the feature's Examples give it. A product that is not listed is skipped
  // until its value is added: it is not known yet (FX_PSCRIPT and FX_PSCRIPT_FSKO, FX_CO and FX_FSB in the feature)
  const PROFILES: Partial<Record<string, NovationInputProfile>> = { FX_TRF: 'WITH_TARGET_AMOUNT' };

  for (const forProduct of productsWith('novationRemaining')) {
    test(`[TC-TRADE-NOVATION-REMAINING-UI-001] should able to perform Novation Remaining event for a trade successfully ${productTag(forProduct)}`, async ({ Given, When, Then, And, flows, testData }) => {
      test.skip(!PROFILES[forProduct], `The input profile of ${forProduct} is not known yet: add the feature's Examples value to PROFILES`);
      const profile = PROFILES[forProduct] as NovationInputProfile;
      const { product, data } = givenProduct(flows, testData<Data & GivenTradeData>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker novates the remaining trade to another counterparty from the trade portal and the original trade is Dead with the event status Novated', forProduct);
      givenTrade(flows, data);

      const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.trades.orCreate(() => flows.tradeProvisioning.provisionLiveTrade(product, data)));
      await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
      await When(`perform the Novation Remaining event on the '${product}' trade with '${profile}' input profile`, () => flows.tradeNovationRemaining.novateRemaining(tradeId, profile, data));
      await Then('the novation remaining is completed successfully', () => flows.tradeNovationRemaining.expectCompleted());
      await And('the original trade is closed as Novated', () => flows.tradeNovationRemaining.expectOriginalClosedAsNovated(tradeId));
    });
  }
});
