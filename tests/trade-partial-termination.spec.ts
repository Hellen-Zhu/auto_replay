import { test } from '../framework/fixtures';
import type { TradePartialTerminationData, TradeProvisioningData } from '../framework/flows';
import { prepare } from './support';

// Mirrors trade_partial_termination.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.
// The feature runs the scenario for three products; here it runs for one (user decision, minimal coverage: the
// pages of the event are the same for every product).
// The end of the feature's title was not visible when it was copied: it is completed here with the event's name.

type Data = TradeProvisioningData & TradePartialTerminationData;

test.describe('Trade partial termination', () => {
  const product = 'FX_TRF';

  test(`[TC-TRADE-PARTIAL-TERMINATION-${product}-UI-001] Updated trade position is reflected accurately for ${product} trade after maker triggers Partial Termination`, async ({ Given, When, Then, And, flows, testData }) => {
    prepare(product, `A live ${product} trade is created through the API; maker reduces its notional with a partial termination from the trade portal and the trade details show the new notional, the trade still Live`);
    const data = testData<Data>();

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When(`perform Partial Termination event on the '${product}' trade`, () => flows.tradePartialTermination.terminatePartially(tradeId, data));
    await Then('the partial termination is completed successfully', () => flows.tradePartialTermination.expectCompleted());
    await And('the trade notional reflects the partial termination reduction in trade detail page', () => flows.tradePartialTermination.expectNotionalReduced(tradeId, data));
  });
});
