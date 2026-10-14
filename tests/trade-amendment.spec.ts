import { test } from '../framework/fixtures';
import type { TradeAmendmentData, TradeProvisioningData } from '../framework/flows';
import { givenProduct, type ProductData } from './support';

// Mirrors trade_amendment.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.
// A case logs in once (user decision), so each scenario of the feature is two cases here: the maker's part, which
// ends when the amendment is pending (-UI-002 / -003), and the checker's part on a given trade whose amendment is
// pending (-EXISTING-UI-004 / -005 in tests/existing-trade.spec.ts, with -EXISTING-UI-002 / -003, the maker's part
// on a given trade), run on the trade the maker's case leaves. No API request that leaves a trade with a pending amendment is known, so the checker's
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
});
