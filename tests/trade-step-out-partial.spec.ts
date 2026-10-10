import { test } from '../framework/fixtures';
import type { TradeStepOutPartialData, TradeProvisioningData } from '../framework/flows';
import { prepare } from './support';

// Mirrors trade_step_out_partial.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.
// The feature runs the scenario for three products; here it runs for one (user decision, minimal coverage: the
// pages of the event are the same for every product).

type Data = TradeProvisioningData & TradeStepOutPartialData;

test.describe('Trade step out partial', () => {
  const product = 'FX_TRF';

  test(`[TC-TRADE-STEP-OUT-PARTIAL-${product}-UI-001] should able to perform Step Out Partial event for ${product} trade successfully`, async ({ Given, When, Then, And, flows, testData }) => {
    prepare(product, `A live ${product} trade is created through the API; maker steps out of a part of it from the trade portal and the trade is still Live, with the event status Novated`);
    const data = testData<Data>();

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When(`perform the Step Out Partial event on the '${product}' trade`, () => flows.tradeStepOut.stepOutPartial(tradeId, data));
    await Then('the step out partial is completed successfully', () => flows.tradeStepOut.expectPartialCompleted());
    await And('the trade remains Live and is marked as Novated', () => flows.tradeStepOut.expectLiveAndNovated(tradeId));
  });
});
