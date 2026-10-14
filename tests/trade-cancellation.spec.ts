import { test } from '../framework/fixtures';
import type { TradeCancellationData, TradeProvisioningData } from '../framework/flows';
import { givenProduct, givenTrade, type GivenTradeData, type ProductData } from './support';

// Mirrors trade_cancellation.feature of the E2E project, steps included. The live trade of the Given is created
// through the API (flows.tradeProvisioning), so the case needs apiBaseUrl in the local config.
// A case logs in once (user decision), so the feature's two scenarios, which go on with the checker's approval or
// rejection, are one case here that ends when the cancellation is pending. The checker's decision on a pending
// cancellation has no case of its own (user decision): it is the same approve / reject as on a pending new trade,
// which TC-TRADE-APPROVE-CREATION-UI-001 / TC-TRADE-REJECT-CREATION-UI-001 cover.
// One product only (user decision, minimal coverage): the pages of a cancellation and of the checker's decision
// are the same for every product, while the feature's Examples list three.

test.describe('Trade cancellation', () => {
  test('[TC-TRADE-CANCELLATION-UI-001] Cancellation of a Live trade is pending checker approval after Maker submits it', async ({ Given, When, Then, And, flows, testData }) => {
    const { product, data } = givenProduct(flows, testData<TradeProvisioningData & TradeCancellationData & ProductData & GivenTradeData>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker cancels it from the trade portal and the cancellation is pending checker approval');
    givenTrade(flows, data);

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.trades.orCreate(() => flows.tradeProvisioning.provisionLiveTrade(product, data)));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When('perform cancellation for the trade from trade portal', () => flows.tradeCancellation.cancelFromTradePortal(tradeId, data));
    await Then('the cancellation is submitted successfully', () => flows.tradeCancellation.expectSubmitted());
    await And('the cancellation request is pending checker approval', () => flows.tradeCancellation.expectPendingCheckerApproval(tradeId));
  });
});
