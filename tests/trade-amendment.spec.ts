import { test } from '../framework/fixtures';
import type { TradeAmendmentData, TradeProvisioningData } from '../framework/flows';
import { givenProduct, givenTradeId, loggedIn, type ProductData } from './support';

// Mirrors trade_amendment.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.
// Both scenarios log in twice in the same browser: the maker amends, then the checker decides.
// The feature runs each scenario for three products; here they run for one (user decision, minimal coverage: the
// pages of an amendment are the same for every product).
// Not ported: the feature's first scenario (-UI-001, amendment of the Deal Date). Its date is "today plus 1
// business day", worked out when the case runs: a case file has no such value, and the date field of the trade
// details is a control this project does not operate yet.

type Data = TradeProvisioningData & TradeAmendmentData & ProductData;

test.describe('Trade amendment', () => {
  test('[TC-TRADE-AMENDMENT-UI-002] Trade returns to Live after checker approves amendment', async ({ Given, When, Then, And, flows, testData }) => {
    const { product, data } = givenProduct(flows, testData<Data>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker changes its counterparty in the trade details, checker approves the amendment from the trade portal; the trade is Live with the event status Amended and its trade details show the new counterparty');

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await And('perform amendment for Counterparty on the trade', () => flows.tradeAmendment.amendCounterparty(tradeId, data));
    await And('checker is logged in to the trade portal', () => flows.auth.login('checker'));
    await When('approves the pending trade from trade portal', () => flows.tradeApproval.approveFromTradePortal(tradeId));
    await Then('the trade is approved successfully', () => flows.tradeApproval.expectApproved());
    await And('the trade remains Live and is marked as Amended', () => flows.tradeAmendment.expectLiveAndAmended(tradeId));
    await And('the trade details show the amended Counterparty value', () => flows.tradeAmendment.expectAmendedCounterparty(tradeId, data));
  });

  test('[TC-TRADE-AMENDMENT-UI-003] Trade reverts to Live after checker rejects amendment', async ({ Given, When, Then, And, flows, testData }) => {
    const { product, data } = givenProduct(flows, testData<Data>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker changes its risk portfolio in the trade details, checker rejects the amendment from the trade detail page; the trade is Live and shows its original portfolio');

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When('perform amendment for Risk Portfolio on the trade', () => flows.tradeAmendment.amendRiskPortfolio(tradeId, data));
    await When('checker is logged in to the trade portal', () => flows.auth.login('checker'));
    await And('rejects the trade from the trade detail page', () => flows.tradeDetail.reject(tradeId));
    await Then('the trade is rejected successfully', () => flows.tradeApproval.expectRejected());
    await And('the trade remains Live in trade details', () => flows.tradeDetail.expectLive());
    await And('Risk Portfolio field shows the original value in the trade detail page', () => flows.tradeAmendment.expectOriginalRiskPortfolio(data));
  });

  test('[TC-TRADE-AMENDMENT-EXISTING-UI-002] Given Live trade returns to Live after checker approves amendment', async ({ Given, When, Then, And, flows, testData }) => {
    const tradeId = flows.trades.existingTrade(givenTradeId('Maker changes the counterparty of the live trade with the given ID in the trade details, checker approves the amendment from the trade portal; the trade is Live with the event status Amended and its trade details show the new counterparty'));
    const data = testData<TradeAmendmentData>();

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    await And('the given trade is Live', () => flows.trades.expectLive(tradeId));
    await And('perform amendment for Counterparty on the trade', () => flows.tradeAmendment.amendCounterparty(tradeId, data));
    await And('checker is logged in to the trade portal', () => flows.auth.login('checker'));
    await When('approves the pending trade from trade portal', () => flows.tradeApproval.approveFromTradePortal(tradeId));
    await Then('the trade is approved successfully', () => flows.tradeApproval.expectApproved());
    await And('the trade remains Live and is marked as Amended', () => flows.tradeAmendment.expectLiveAndAmended(tradeId));
    await And('the trade details show the amended Counterparty value', () => flows.tradeAmendment.expectAmendedCounterparty(tradeId, data));
  });

  test('[TC-TRADE-AMENDMENT-EXISTING-UI-003] Given Live trade reverts to Live after checker rejects amendment', async ({ Given, When, Then, And, flows, testData }) => {
    const tradeId = flows.trades.existingTrade(givenTradeId('Maker changes the risk portfolio of the live trade with the given ID in the trade details, checker rejects the amendment from the trade detail page; the trade is Live and shows its original portfolio, which is the case data originalPortfolio'));
    const data = testData<TradeAmendmentData>();

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    await And('the given trade is Live', () => flows.trades.expectLive(tradeId));
    await When('perform amendment for Risk Portfolio on the trade', () => flows.tradeAmendment.amendRiskPortfolio(tradeId, data));
    await When('checker is logged in to the trade portal', () => flows.auth.login('checker'));
    await And('rejects the trade from the trade detail page', () => flows.tradeDetail.reject(tradeId));
    await Then('the trade is rejected successfully', () => flows.tradeApproval.expectRejected());
    await And('the trade remains Live in trade details', () => flows.tradeDetail.expectLive());
    await And('Risk Portfolio field shows the original value in the trade detail page', () => flows.tradeAmendment.expectOriginalRiskPortfolio(data));
  });
});
