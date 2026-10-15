import { test } from '../framework/fixtures';
import type { TradePortfolioReassignmentData, TradeProvisioningData } from '../framework/flows';
import { productsWith } from '../framework/products';
import { givenProduct, givenTrade, type GivenTradeData, type ProductData } from './support';

// Mirrors trade_portfolio_reassignment.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.

// The end of the feature's title was not visible when it was copied: it is completed here with the event's name.
// Not ported: the feature's second scenario (-UI-002, the td_bf value of a customized formula). User decision: it
// is not needed here.

type Data = TradeProvisioningData & TradePortfolioReassignmentData & ProductData;

// One case per product (explicit user requirement): the test is repeated for each product with the event's capability
// (framework/products.ts), the product in its case ID like the creation cases ([TC-TRADE-<EVENT>-<PRODUCT>-UI-001],
// so --grep FX_TRF-UI runs one product), each run creating its trade through the API and exporting its own case file.
// Values that differ for a product go under "byProduct" in the test data.
test.describe('Trade portfolio reassignment', () => {
  for (const forProduct of productsWith('portfolioReassignment')) {
    test(`[TC-TRADE-PORTFOLIO-REASSIGNMENT-${forProduct}-UI-001] Updated portfolio is displayed for a trade after maker triggers Portfolio Reassignment`, async ({ Given, When, Then, And, flows, testData }) => {
      const { product, data } = givenProduct(flows, testData<Data & GivenTradeData>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker moves it to another portfolio from the trade portal; the trade is still Live with the event status Amended and its trade details show the new portfolio', forProduct);
      givenTrade(flows, data);

      const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.trades.orCreate(() => flows.tradeProvisioning.provisionLiveTrade(product, data)));
      await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
      await When(`perform Portfolio Reassignment event on the '${product}' trade`, () => flows.tradePortfolioReassignment.reassignPortfolio(tradeId, data));
      await Then('the portfolio reassignment is completed successfully', () => flows.tradePortfolioReassignment.expectCompleted());
      await And('the trade remains Live and is marked as Amended', () => flows.tradePortfolioReassignment.expectLiveAndAmended(tradeId));
      await And('the trade details show the updated portfolio assignment', () => flows.tradePortfolioReassignment.expectUpdatedPortfolio(tradeId, data));
    });
  }
});
