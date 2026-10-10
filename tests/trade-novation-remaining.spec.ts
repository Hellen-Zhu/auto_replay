import { test } from '../framework/fixtures';
import type { NovationInputProfile, TradeNovationRemainingData, TradeProvisioningData } from '../framework/flows';
import { prepare } from './support';

// Mirrors trade_novation_remaining.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.
// The feature runs the scenario for three products; here it runs for one (user decision, minimal coverage: the
// pages of the event are the same for every product).
// The input profile is the one the feature's Examples give for this product.
// The feature's last step is "the original trade is closed as Novated and new novated trade is live". How the new
// trade is found was not seen in the E2E project, so only the original trade is checked and the step says so.

type Data = TradeProvisioningData & TradeNovationRemainingData;

test.describe('Trade novation remaining', () => {
  const product = 'FX_TRF';
  const profile: NovationInputProfile = 'WITH_TARGET_AMOUNT';

  test(`[TC-TRADE-NOVATION-REMAINING-${product}-UI-001] should able to perform Novation Remaining event for ${product} trade successfully`, async ({ Given, When, Then, And, flows, testData }) => {
    prepare(product, `A live ${product} trade is created through the API; maker novates the remaining trade to another counterparty from the trade portal and the original trade is Dead with the event status Novated`);
    const data = testData<Data>();

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When(`perform the Novation Remaining event on the '${product}' trade with '${profile}' input profile`, () => flows.tradeNovationRemaining.novateRemaining(tradeId, profile, data));
    await Then('the novation remaining is completed successfully', () => flows.tradeNovationRemaining.expectCompleted());
    await And('the original trade is closed as Novated', () => flows.tradeNovationRemaining.expectOriginalClosedAsNovated(tradeId));
  });
});
