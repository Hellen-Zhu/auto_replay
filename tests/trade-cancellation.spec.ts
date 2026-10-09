import { test } from '../framework/fixtures';
import type { TradeCancellationData, TradeProvisioningData } from '../framework/flows';
import { prepare } from './support';

// Mirrors trade_cancellation.feature of the E2E project, steps included. The live trade of the Given is created
// through the API (flows.tradeProvisioning), so the case needs apiBaseUrl in the local config.
// Both scenarios log in twice in the same browser: the maker cancels, then the checker decides.
// One product only (user decision, minimal coverage): the pages of a cancellation and of the checker's decision
// are the same for every product, while the feature's Examples list three.

const product = 'FX_TRF';

test.describe('Trade cancellation', () => {
  test(`[TC-TRADE-CANCELLATION-${product}-UI-001] ${product} Trade transitions to Dead status after checker confirms cancellation approval`, async ({ Given, When, Then, And, flows, testData }) => {
    prepare(product, `A live ${product} trade is created through the API; maker cancels it from the trade portal, checker approves the cancellation and the trade is closed as Cancelled`);
    const data = testData<TradeProvisioningData & TradeCancellationData>();

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When('perform cancellation for the trade from trade portal', () => flows.tradeCancellation.cancelFromTradePortal(tradeId, data));
    await Then('the cancellation is submitted successfully', () => flows.tradeCancellation.expectSubmitted());
    await And('the cancellation request is pending checker approval', () => flows.tradeCancellation.expectPendingCheckerApproval(tradeId));
    await When('checker is logged in to the trade portal', () => flows.auth.login('checker'));
    await And('approves the pending trade from trade portal', () => flows.tradeApproval.approveFromTradePortal(tradeId));
    await Then('the trade is approved successfully', () => flows.tradeApproval.expectApproved());
    await And('the trade is closed as Cancelled', () => flows.tradeCancellation.expectClosedAsCancelled(tradeId));
  });

  test(`[TC-TRADE-CANCELLATION-${product}-UI-002] ${product} Trade reverts to Live status after checker confirms cancellation rejection`, async ({ Given, When, Then, And, flows, testData }) => {
    prepare(product, `A live ${product} trade is created through the API; maker cancels it from the trade portal, checker rejects the cancellation and the trade is live again`);
    const data = testData<TradeProvisioningData & TradeCancellationData>();

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When('perform cancellation for the trade from trade portal', () => flows.tradeCancellation.cancelFromTradePortal(tradeId, data));
    await Then('the cancellation is submitted successfully', () => flows.tradeCancellation.expectSubmitted());
    await And('the cancellation request is pending checker approval', () => flows.tradeCancellation.expectPendingCheckerApproval(tradeId));
    await When('checker is logged in to the trade portal', () => flows.auth.login('checker'));
    await And('rejects the pending trade from trade portal', () => flows.tradeApproval.rejectFromTradePortal(tradeId));
    await Then('the trade is rejected successfully', () => flows.tradeApproval.expectRejected());
    await And('the trade is Live and marked as New', () => flows.trades.expectLiveAndNew(tradeId));
  });
});
