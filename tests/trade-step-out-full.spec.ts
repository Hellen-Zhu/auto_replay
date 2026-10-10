import { test } from '../framework/fixtures';
import type { TradeStepOutData, TradeProvisioningData } from '../framework/flows';
import { prepare } from './support';

// Mirrors trade_step_out_full.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.
// The feature runs the scenario for three products; here it runs for one (user decision, minimal coverage: the
// pages of the event are the same for every product).

type Data = TradeProvisioningData & TradeStepOutData;

test.describe('Trade step out full', () => {
  const product = 'FX_TRF';

  test(`[TC-TRADE-STEP-OUT-FULL-${product}-UI-001] should able to perform Step Out Full event for ${product} trade successfully`, async ({ Given, When, Then, And, flows, testData }) => {
    prepare(product, `A live ${product} trade is created through the API; maker steps out of it fully from the trade portal and the trade is Dead with the event status Novated`);
    const data = testData<Data>();

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When(`perform the Step Out Full event on the '${product}' trade`, () => flows.tradeStepOut.stepOutFull(tradeId, data));
    await Then('the step out full is completed successfully', () => flows.tradeStepOut.expectFullCompleted());
    await And('the original trade is closed as Novated', () => flows.tradeStepOut.expectClosedAsNovated(tradeId));
  });
});
