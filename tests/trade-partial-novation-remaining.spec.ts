import { test } from '../framework/fixtures';
import type { PartialNovationStart, TradePartialNovationRemainingData, TradeProvisioningData } from '../framework/flows';
import { prepare } from './support';

// Mirrors trade_partial_novation_remaining.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.
// The feature runs the scenario for three products; here it runs for one (user decision, minimal coverage: the
// pages of the event are the same for every product). The page the event is started from is the one the feature's
// Examples give for this product.
// The equation line and the new notional of the test data follow from the notional of the product's dat file.
// The feature's step "the partial novation remaining is completed successfully" is commented out there, so it is
// not a step here either.

type Data = TradeProvisioningData & TradePartialNovationRemainingData;

test.describe('Trade partial novation remaining', () => {
  const product = 'FX_TRF';
  const from: PartialNovationStart = 'portal';

  test(`[TC-TRADE-PARTIAL-NOVATION-REMAINING-${product}-UI-001] should able to perform Partial Novation event for ${product} trade successfully`, async ({ Given, When, Then, And, flows, testData }) => {
    prepare(product, `A live ${product} trade is created through the API; maker novates a part of it to another counterparty from the trade portal; the original trade is Live with the remaining notional and a new Live trade holds the rest for the new counterparty`);
    const data = testData<Data>();

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    const newTradeId = await When(`perform the Partial Novation Remaining event on the '${product}' trade from ${from} page`, () => flows.tradePartialNovationRemaining.novatePartially(tradeId, from, data));
    await Then(`trade is partially novated with remaining notional retained and counterparty transferred for '${product}'`, () => flows.tradePartialNovationRemaining.expectPartiallyNovated(tradeId, newTradeId, data));
  });
});
