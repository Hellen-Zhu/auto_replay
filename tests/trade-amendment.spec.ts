import { test } from '../framework/fixtures';
import type { TradeAmendmentData, TradeProvisioningData } from '../framework/flows';
import { givenProduct, givenTradeId, loggedIn, type ProductData } from './support';

// Mirrors trade_amendment.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.
// A case logs in once (user decision), so each scenario of the feature is two cases here: the maker's part, which
// ends when the amendment is pending (-UI-002 / -003, and -EXISTING-UI-002 / -003 on a given trade), and the
// checker's part on a given trade whose amendment is pending (-EXISTING-UI-004 / -005), run on the trade the
// maker's case leaves. No API request that leaves a trade with a pending amendment is known, so the checker's
// Given cannot be provisioned. That a pending amendment shows the status PARV in the blotter is inferred.
// The feature runs each scenario for three products; here they run for one (user decision, minimal coverage: the
// pages of an amendment are the same for every product).
// Not ported: the feature's first scenario (-UI-001, amendment of the Deal Date). Its date is "today plus 1
// business day", worked out when the case runs: a case file has no such value, and the date field of the trade
// details is a control this project does not operate yet.

type Data = TradeProvisioningData & TradeAmendmentData & ProductData;

test.describe('Trade amendment', () => {
  test('[TC-TRADE-AMENDMENT-UI-002] Counterparty amendment of a Live trade is pending checker approval after Maker submits it', async ({ Given, When, Then, And, flows, testData }) => {
    const { product, data } = givenProduct(flows, testData<Data>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker changes its counterparty in the trade details and the amendment is pending checker approval');

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When('perform amendment for Counterparty on the trade', () => flows.tradeAmendment.amendCounterparty(tradeId, data));
    await Then('the amendment is pending checker approval', () => flows.tradeAmendment.expectPendingCheckerApproval(tradeId));
  });

  test('[TC-TRADE-AMENDMENT-UI-003] Risk Portfolio amendment of a Live trade is pending checker approval after Maker submits it', async ({ Given, When, Then, And, flows, testData }) => {
    const { product, data } = givenProduct(flows, testData<Data>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker changes its risk portfolio in the trade details and the amendment is pending checker approval');

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When('perform amendment for Risk Portfolio on the trade', () => flows.tradeAmendment.amendRiskPortfolio(tradeId, data));
    await Then('the amendment is pending checker approval', () => flows.tradeAmendment.expectPendingCheckerApproval(tradeId));
  });

  test('[TC-TRADE-AMENDMENT-EXISTING-UI-002] Counterparty amendment of a given Live trade is pending checker approval after Maker submits it', async ({ Given, When, Then, And, flows, testData }) => {
    const tradeId = flows.trades.existingTrade(givenTradeId('Maker changes the counterparty of the live trade with the given ID in the trade details; the amendment is then pending checker approval'));
    const data = testData<TradeAmendmentData>();

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    await And('the given trade is Live', () => flows.trades.expectLive(tradeId));
    await When('perform amendment for Counterparty on the trade', () => flows.tradeAmendment.amendCounterparty(tradeId, data));
    await Then('the amendment is pending checker approval', () => flows.tradeAmendment.expectPendingCheckerApproval(tradeId));
  });

  test('[TC-TRADE-AMENDMENT-EXISTING-UI-003] Risk Portfolio amendment of a given Live trade is pending checker approval after Maker submits it', async ({ Given, When, Then, And, flows, testData }) => {
    const tradeId = flows.trades.existingTrade(givenTradeId('Maker changes the risk portfolio of the live trade with the given ID in the trade details; the amendment is then pending checker approval'));
    const data = testData<TradeAmendmentData>();

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    await And('the given trade is Live', () => flows.trades.expectLive(tradeId));
    await When('perform amendment for Risk Portfolio on the trade', () => flows.tradeAmendment.amendRiskPortfolio(tradeId, data));
    await Then('the amendment is pending checker approval', () => flows.tradeAmendment.expectPendingCheckerApproval(tradeId));
  });

  test('[TC-TRADE-AMENDMENT-EXISTING-UI-004] Given trade returns to Live after checker approves its pending Counterparty amendment', async ({ Given, When, Then, And, flows, testData }) => {
    const tradeId = flows.trades.existingTrade(givenTradeId('Checker approves, from the trade portal, the counterparty amendment of the trade with the given ID, which must be pending approval; the trade is Live with the event status Amended and its trade details show the new counterparty, which is the case data newCounterpartyName'));
    const data = testData<TradeAmendmentData>();

    await Given('checker is logged in to the trade portal', () => loggedIn(flows, 'checker'));
    await And('the amendment of the given trade is pending checker approval', () => flows.tradeAmendment.expectPendingCheckerApproval(tradeId));
    await When('approves the pending trade from trade portal', () => flows.tradeApproval.approveFromTradePortal(tradeId));
    await Then('the trade is approved successfully', () => flows.tradeApproval.expectApproved());
    await And('the trade remains Live and is marked as Amended', () => flows.tradeAmendment.expectLiveAndAmended(tradeId));
    await And('the trade details show the amended Counterparty value', () => flows.tradeAmendment.expectAmendedCounterparty(tradeId, data));
  });

  test('[TC-TRADE-AMENDMENT-EXISTING-UI-005] Given trade reverts to Live after checker rejects its pending Risk Portfolio amendment', async ({ Given, When, Then, And, flows, testData }) => {
    const tradeId = flows.trades.existingTrade(givenTradeId('Checker rejects, from the trade detail page, the risk portfolio amendment of the trade with the given ID, which must be pending approval; the trade is Live and shows its original portfolio, which is the case data originalPortfolio'));
    const data = testData<TradeAmendmentData>();

    await Given('checker is logged in to the trade portal', () => loggedIn(flows, 'checker'));
    await And('the amendment of the given trade is pending checker approval', () => flows.tradeAmendment.expectPendingCheckerApproval(tradeId));
    await When('rejects the trade from the trade detail page', () => flows.tradeDetail.reject(tradeId));
    await Then('the trade is rejected successfully', () => flows.tradeApproval.expectRejected());
    await And('the trade remains Live in trade details', () => flows.tradeDetail.expectLive());
    await And('Risk Portfolio field shows the original value in the trade detail page', () => flows.tradeAmendment.expectOriginalRiskPortfolio(data));
  });
});
