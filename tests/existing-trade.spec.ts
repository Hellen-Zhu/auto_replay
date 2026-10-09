import { test } from '../framework/fixtures';
import type { Flows, TradeCancellationData } from '../framework/flows';
import { givenTradeId } from './support';

// Cases that go on with a trade that is already in the system instead of creating their own (explicit user
// requirement: the PO has often worked on a trade and wants to continue with it). They are an addition to the cases
// that prepare their trade through the API, not a replacement.
// The trade ID is case data that is entered for every run: the PO types it in the runner, QA gives it in the
// environment variable OREO_TRADE_ID (without it these cases are skipped). The exported case file holds no ID.
// The first step after the login checks that the trade is in the state the case starts from, so a wrong trade
// fails there and nothing is done to it.
// Unlike every other case these cannot be repeated on the same trade: a run changes its state. No product in the
// ID or the title, since the given trade decides it. Case IDs and titles are this repo's own: the E2E project has
// no such scenarios.

// The state check that follows opens the trade portal by its address, so the login must be over before it starts:
// the case waits for the Trades page, which the cases that go on with a search do not need
async function loggedIn(flows: Flows, role: string) {
  await flows.auth.login(role);
  await flows.trades.expectOnTradesPage('And');
}

test.describe('Existing trade', () => {
  test('[TC-EXISTING-TRADE-UI-001] Checker approves a given trade that is pending approval', async ({ Given, When, Then, And, flows }) => {
    const tradeId = flows.trades.existingTrade(givenTradeId('Checker approves the new trade with the given ID, which must be pending approval; the trade is live afterwards'));

    await Given('checker is logged in to the trade portal', () => loggedIn(flows, 'checker'));
    await And('the given trade is pending approval', () => flows.trades.expectPendingApproval(tradeId));
    await When('approves the pending trade from trade portal', () => flows.tradeApproval.approveFromTradePortal(tradeId));
    await Then('the trade is approved successfully', () => flows.tradeApproval.expectApproved());
    await And('the trade is Live', () => flows.tradeApproval.expectLive(tradeId));
  });

  test('[TC-EXISTING-TRADE-UI-002] Checker rejects a given trade that is pending approval', async ({ Given, When, Then, And, flows }) => {
    const tradeId = flows.trades.existingTrade(givenTradeId('Checker rejects the new trade with the given ID, which must be pending approval; the trade is a draft afterwards'));

    await Given('checker is logged in to the trade portal', () => loggedIn(flows, 'checker'));
    await And('the given trade is pending approval', () => flows.trades.expectPendingApproval(tradeId));
    await When('rejects the pending trade from trade portal', () => flows.tradeApproval.rejectFromTradePortal(tradeId));
    await Then('the trade is rejected successfully', () => flows.tradeApproval.expectRejected());
    await And('the trade is reverted to Draft', () => flows.tradeApproval.expectDraft(tradeId));
  });

  test('[TC-EXISTING-TRADE-UI-003] Maker cancels a given Live trade', async ({ Given, When, Then, And, flows, testData }) => {
    const tradeId = flows.trades.existingTrade(givenTradeId('Maker cancels the live trade with the given ID; the cancellation is then pending checker approval'));
    const data = testData<TradeCancellationData>();

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    await And('the given trade is Live', () => flows.trades.expectLive(tradeId));
    await When('perform cancellation for the trade from trade portal', () => flows.tradeCancellation.cancelFromTradePortal(tradeId, data));
    await Then('the cancellation is submitted successfully', () => flows.tradeCancellation.expectSubmitted());
    await And('the cancellation request is pending checker approval', () => flows.tradeCancellation.expectPendingCheckerApproval(tradeId));
  });

  test('[TC-EXISTING-TRADE-UI-004] Checker approves the pending cancellation of a given trade', async ({ Given, When, Then, And, flows }) => {
    const tradeId = flows.trades.existingTrade(givenTradeId('Checker approves the cancellation of the trade with the given ID, which must be pending approval; the trade is dead afterwards'));

    await Given('checker is logged in to the trade portal', () => loggedIn(flows, 'checker'));
    await And('the cancellation of the given trade is pending checker approval', () => flows.tradeCancellation.expectPendingCheckerApproval(tradeId));
    await When('approves the pending trade from trade portal', () => flows.tradeApproval.approveFromTradePortal(tradeId));
    await Then('the trade is approved successfully', () => flows.tradeApproval.expectApproved());
    await And('the trade is closed as Cancelled', () => flows.tradeCancellation.expectClosedAsCancelled(tradeId));
  });

  test('[TC-EXISTING-TRADE-UI-005] Checker rejects the pending cancellation of a given trade', async ({ Given, When, Then, And, flows }) => {
    const tradeId = flows.trades.existingTrade(givenTradeId('Checker rejects the cancellation of the trade with the given ID, which must be pending approval; the trade is live again'));

    await Given('checker is logged in to the trade portal', () => loggedIn(flows, 'checker'));
    await And('the cancellation of the given trade is pending checker approval', () => flows.tradeCancellation.expectPendingCheckerApproval(tradeId));
    await When('rejects the pending trade from trade portal', () => flows.tradeApproval.rejectFromTradePortal(tradeId));
    await Then('the trade is rejected successfully', () => flows.tradeApproval.expectRejected());
    await And('the trade is Live and marked as New', () => flows.trades.expectLiveAndNew(tradeId));
  });
});
