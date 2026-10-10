import { test } from '../framework/fixtures';
import type { TradePortfolioReassignmentData, TradeProvisioningData } from '../framework/flows';
import { prepare } from './support';

// Mirrors trade_portfolio_reassignment.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.
// The feature runs the scenario for three products; here it runs for one (user decision, minimal coverage: the
// pages of the event are the same for every product).
// The end of the feature's title was not visible when it was copied: it is completed here with the event's name.
// Not ported: the feature's second scenario (-UI-002, the td_bf value of a customized formula). User decision: it
// is not needed here.

type Data = TradeProvisioningData & TradePortfolioReassignmentData;

test.describe('Trade portfolio reassignment', () => {
  const product = 'FX_TRF';

  test(`[TC-TRADE-PORTFOLIO-REASSIGNMENT-${product}-UI-001] Updated portfolio is displayed for ${product} trade after maker triggers Portfolio Reassignment`, async ({ Given, When, Then, And, flows, testData }) => {
    prepare(product, `A live ${product} trade is created through the API; maker moves it to another portfolio from the trade portal; the trade is still Live with the event status Amended and its trade details show the new portfolio`);
    const data = testData<Data>();

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When(`perform Portfolio Reassignment event on the '${product}' trade`, () => flows.tradePortfolioReassignment.reassignPortfolio(tradeId, data));
    await Then('the portfolio reassignment is completed successfully', () => flows.tradePortfolioReassignment.expectCompleted());
    await And('the trade remains Live and is marked as Amended', () => flows.tradePortfolioReassignment.expectLiveAndAmended(tradeId));
    await And('the trade details show the updated portfolio assignment', () => flows.tradePortfolioReassignment.expectUpdatedPortfolio(tradeId, data));
  });
});
