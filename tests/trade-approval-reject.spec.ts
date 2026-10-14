import { test } from '../framework/fixtures';
import type { StepInProvisioningData, TradeProvisioningData } from '../framework/flows';
import { givenProduct, givenTrade, type GivenTradeData, type ProductData } from './support';

// The checker's decision on a new trade; mirrors the E2E project's approval / reject feature (its case IDs
// are TC-TRADE-APPROVAL-REJECT-...; here every ID names the checker's decision: TC-TRADE-APPROVE-CREATION-... and
// TC-TRADE-REJECT-CREATION-..., user decision). The pending trade of the Given is created through the API (flows.tradeProvisioning),
// so the case needs apiBaseUrl in the local config.
// One case per kind of trade, not per product (user decision): the checker's pages are the same for every product.
// The product and its dat file are case data ("product" and "datFile" of testdata/shared/given-trade.json), so the case IDs have no product in
// them (the feature's have) and the PO runs a case for another product or another dat file of it by changing them before the run.
// A case logs in once (user decision): whatever the maker did before the checker decides is the Given and is done
// through the API, never by a second login in the browser.
// Not as in the feature: there the checker decides in its UI-002 and UI-003 "from the trade detail page" and the result
// is checked "in trade details"; here the decision is made from the trade portal and the result is checked in the
// blotter, and the step lines say so. The feature's way is written as flows.tradeDetail (approve, reject,
// expectDraft, expectLive, from trade_detail.snippet) but not used: the mock's trade detail page has no checker
// buttons and no status badge, so these cases would no longer run there. REJECT-CREATION-UI-002 (StepIn partial,
// rejected) is this repo's case (user decision); the titles are this repo's too, all in the form "... when Checker approves /
// rejects the submission".

type Data = TradeProvisioningData & StepInProvisioningData & ProductData;

test.describe('Trade approval and rejection', () => {
  test(`[TC-TRADE-APPROVE-CREATION-UI-001] Trade is Live when Checker approves the submission`, async ({ Given, When, Then, And, flows, testData }) => {
    const { product, data } = givenProduct(flows, testData<Data & GivenTradeData>(), 'A trade of the product in the case data is submitted through the API; checker approves it from the trade portal and the trade is live');
    givenTrade(flows, data);

    const tradeId = await Given(`a Draft Pending Approval '${product}' trade exists in the blotter`, () => flows.trades.orCreate(() => flows.tradeProvisioning.provisionPendingTrade(product, data)));
    await When('checker is logged in to the trade portal', () => flows.auth.login('checker'));
    await And('approves the pending trade from trade portal', () => flows.tradeApproval.approveFromTradePortal(tradeId));
    await Then('the trade is approved successfully', () => flows.tradeApproval.expectApproved());
    await And('the trade is Live and marked as New', () => flows.trades.expectLiveAndNew(tradeId));
  });

  test(`[TC-TRADE-REJECT-CREATION-UI-001] Trade reverts to Draft when Checker rejects the submission`, async ({ Given, When, Then, And, flows, testData }) => {
    const { product, data } = givenProduct(flows, testData<Data & GivenTradeData>(), 'A trade of the product in the case data is submitted through the API; checker rejects it from the trade portal and the trade is a draft again');
    givenTrade(flows, data);

    const tradeId = await Given(`a Draft Pending Approval '${product}' trade exists in the blotter`, () => flows.trades.orCreate(() => flows.tradeProvisioning.provisionPendingTrade(product, data)));
    await When('checker is logged in to the trade portal', () => flows.auth.login('checker'));
    await And('rejects the pending trade from trade portal', () => flows.tradeApproval.rejectFromTradePortal(tradeId));
    await Then('the trade is rejected successfully', () => flows.tradeApproval.expectRejected());
    await And('the trade is reverted to Draft', () => flows.tradeApproval.expectDraft(tradeId));
  });

  test(`[TC-TRADE-APPROVE-CREATION-UI-002] StepIn Full trade is Live when Checker approves the submission`, async ({ Given, When, Then, And, flows, testData }) => {
    const { product, data } = givenProduct(flows, testData<Data & GivenTradeData>(), 'A StepIn full trade of the product in the case data is submitted through the API; checker approves it from the trade portal and the trade is live');
    givenTrade(flows, data);

    const tradeId = await Given(`a Draft Pending Approval '${product}' StepIn Full trade exists in the blotter`, () => flows.trades.orCreate(() => flows.tradeProvisioning.provisionPendingStepInTrade(product, 'StepInFull', data)));
    await When('checker is logged in to the trade portal', () => flows.auth.login('checker'));
    await And('approves the pending trade from trade portal', () => flows.tradeApproval.approveFromTradePortal(tradeId));
    await Then('the trade is approved successfully', () => flows.tradeApproval.expectApproved());
    await And('the StepIn Full trade is Live', () => flows.tradeApproval.expectLive(tradeId));
  });

  test(`[TC-TRADE-REJECT-CREATION-UI-002] StepIn Partial trade reverts to Draft when Checker rejects the submission`, async ({ Given, When, Then, And, flows, testData }) => {
    const { product, data } = givenProduct(flows, testData<Data & GivenTradeData>(), 'A StepIn partial trade of the product in the case data is submitted through the API; checker rejects it from the trade portal and the trade is a draft again');
    givenTrade(flows, data);

    const tradeId = await Given(`a Draft Pending Approval '${product}' StepIn Partial trade exists in the blotter`, () => flows.trades.orCreate(() => flows.tradeProvisioning.provisionPendingStepInTrade(product, 'StepInPartial', data)));
    await When('checker is logged in to the trade portal', () => flows.auth.login('checker'));
    await And('rejects the pending trade from trade portal', () => flows.tradeApproval.rejectFromTradePortal(tradeId));
    await Then('the trade is rejected successfully', () => flows.tradeApproval.expectRejected());
    await And('the StepIn Partial trade is reverted to Draft', () => flows.tradeApproval.expectDraft(tradeId));
  });
});
