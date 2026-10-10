import { test } from '../framework/fixtures';
import type { TradeAmendmentData, TradeProvisioningData } from '../framework/flows';
import { prepare } from './support';

// Mirrors trade_amendment.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.
// Both scenarios log in twice in the same browser: the maker amends, then the checker decides.
// The feature runs each scenario for three products; here they run for one (user decision, minimal coverage: the
// pages of an amendment are the same for every product).
// Not ported: the feature's first scenario (-UI-001, amendment of the Deal Date). Its date is "today plus 1
// business day", worked out when the case runs: a case file has no such value, and the date field of the trade
// details is a control this project does not operate yet.

type Data = TradeProvisioningData & TradeAmendmentData;

const product = 'FX_TRF';

test.describe('Trade amendment', () => {
  test(`[TC-TRADE-AMENDMENT-${product}-UI-002] ${product} Trade returns to Live after checker approves amendment`, async ({ Given, When, Then, And, flows, testData }) => {
    prepare(product, `A live ${product} trade is created through the API; maker changes its counterparty in the trade details, checker approves the amendment from the trade portal; the trade is Live with the event status Amended and its trade details show the new counterparty`);
    const data = testData<Data>();

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await And('perform amendment for Counterparty on the trade', () => flows.tradeAmendment.amendCounterparty(tradeId, data));
    await And('checker is logged in to the trade portal', () => flows.auth.login('checker'));
    await When('approves the pending trade from trade portal', () => flows.tradeApproval.approveFromTradePortal(tradeId));
    await Then('the trade is approved successfully', () => flows.tradeApproval.expectApproved());
    await And('the trade remains Live and is marked as Amended', () => flows.tradeAmendment.expectLiveAndAmended(tradeId));
    await And('the trade details show the amended Counterparty value', () => flows.tradeAmendment.expectAmendedCounterparty(tradeId, data));
  });

  test(`[TC-TRADE-AMENDMENT-${product}-UI-003] ${product} Trade reverts to Live after checker rejects amendment`, async ({ Given, When, Then, And, flows, testData }) => {
    prepare(product, `A live ${product} trade is created through the API; maker changes its risk portfolio in the trade details, checker rejects the amendment from the trade detail page; the trade is Live and shows its original portfolio`);
    const data = testData<Data>();

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When('perform amendment for Risk Portfolio on the trade', () => flows.tradeAmendment.amendRiskPortfolio(tradeId, data));
    await When('checker is logged in to the trade portal', () => flows.auth.login('checker'));
    await And('rejects the trade from the trade detail page', () => flows.tradeDetail.reject(tradeId));
    await Then('the trade is rejected successfully', () => flows.tradeApproval.expectRejected());
    await And('the trade remains Live in trade details', () => flows.tradeDetail.expectLive());
    await And('Risk Portfolio field shows the original value in the trade detail page', () => flows.tradeAmendment.expectOriginalRiskPortfolio(data));
  });
});
