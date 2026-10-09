import { test } from '../framework/fixtures';
import type { StepInProvisioningData, TradeProvisioningData } from '../framework/flows';
import { prepare } from './support';

// The checker's decision on a new trade; mirrors the E2E project's approval / reject feature (case IDs
// TC-TRADE-APPROVAL-REJECT-...). The pending trade of the Given is created through the API (flows.tradeProvisioning),
// so the case needs apiBaseUrl in the local config.
// One case per kind of trade, not per product (user decision): the checker's pages are the same for every product.
// The product is case data ("product" in testdata/trade-approval-reject.json), so the case IDs have no product in
// them (the feature's have) and the PO runs a case for another product by changing "product" before the run. Scenario UI-001 (a normal trade is approved) is the
// journey through the pages in trade-creation.spec.ts (TC-TRADE-CREATION-UI-005) and is not repeated here.
// Not as in the feature: there the checker decides in UI-002 and UI-003 "from the trade detail page" and the result
// is checked "in trade details"; those snippets are not known, so here the decision is made from the trade portal
// and the result is checked in the blotter, and the step lines say so. UI-004 was not seen: its ID and title are
// taken to continue UI-003.

type Data = TradeProvisioningData & StepInProvisioningData & { product: string };

test.describe('Trade approval and rejection', () => {
  test(`[TC-TRADE-APPROVAL-REJECT-UI-002] Trade reverts to Draft when Checker rejects the submission`, async ({ Given, When, Then, And, flows, testData }) => {
    const { product: productOfRow, ...data } = testData<Data>();
    prepare(productOfRow, 'A trade of the product in the case data is submitted through the API; checker rejects it from the trade portal and the trade is a draft again');
    const product = flows.tradeCreation.productAsCaseData(productOfRow);

    const tradeId = await Given(`a Draft Pending Approval '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionPendingTrade(product, data));
    await When('checker is logged in to the trade portal', () => flows.auth.login('checker'));
    await And('rejects the pending trade from trade portal', () => flows.tradeApproval.rejectFromTradePortal(tradeId));
    await Then('the trade is rejected successfully', () => flows.tradeApproval.expectRejected());
    await And('the trade is reverted to Draft', () => flows.tradeApproval.expectDraft(tradeId));
  });

  test(`[TC-TRADE-APPROVAL-REJECT-UI-003] StepIn Full trade is Live after Maker submits and Checker approves`, async ({ Given, When, Then, And, flows, testData }) => {
    const { product: productOfRow, ...data } = testData<Data>();
    prepare(productOfRow, 'A StepIn full trade of the product in the case data is submitted through the API; checker approves it from the trade portal and the trade is live');
    const product = flows.tradeCreation.productAsCaseData(productOfRow);

    const tradeId = await Given(`a Draft Pending Approval '${product}' StepIn Full trade exists in the blotter`, () => flows.tradeProvisioning.provisionPendingStepInTrade(product, 'StepInFull', data));
    await When('checker is logged in to the trade portal', () => flows.auth.login('checker'));
    await And('approves the pending trade from trade portal', () => flows.tradeApproval.approveFromTradePortal(tradeId));
    await Then('the trade is approved successfully', () => flows.tradeApproval.expectApproved());
    await And('the StepIn Full trade is Live', () => flows.tradeApproval.expectLive(tradeId));
  });

  test(`[TC-TRADE-APPROVAL-REJECT-UI-004] StepIn Partial trade is Live after Maker submits and Checker approves`, async ({ Given, When, Then, And, flows, testData }) => {
    const { product: productOfRow, ...data } = testData<Data>();
    prepare(productOfRow, 'A StepIn partial trade of the product in the case data is submitted through the API; checker approves it from the trade portal and the trade is live');
    const product = flows.tradeCreation.productAsCaseData(productOfRow);

    const tradeId = await Given(`a Draft Pending Approval '${product}' StepIn Partial trade exists in the blotter`, () => flows.tradeProvisioning.provisionPendingStepInTrade(product, 'StepInPartial', data));
    await When('checker is logged in to the trade portal', () => flows.auth.login('checker'));
    await And('approves the pending trade from trade portal', () => flows.tradeApproval.approveFromTradePortal(tradeId));
    await Then('the trade is approved successfully', () => flows.tradeApproval.expectApproved());
    await And('the StepIn Partial trade is Live', () => flows.tradeApproval.expectLive(tradeId));
  });
});
