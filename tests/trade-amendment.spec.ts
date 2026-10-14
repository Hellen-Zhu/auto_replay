import { test } from '../framework/fixtures';
import type { TradeAmendmentData, TradeProvisioningData } from '../framework/flows';
import { productsWith } from '../framework/products';
import { givenProduct, givenTrade, productTag, type GivenTradeData, type ProductData } from './support';

// Mirrors trade_amendment.feature of the E2E project, steps included.
// The live trade of the Given is created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl
// in the local config.
// A case logs in once (user decision), so each scenario of the feature is the maker's part here, which ends when
// the amendment is pending (-UI-002). The checker's decision on a pending amendment has no case of its own (user
// decision): it is the same approve / reject as on a pending new trade, which TC-TRADE-APPROVE-CREATION-UI-001 /
// TC-TRADE-REJECT-CREATION-UI-001 cover. That a pending amendment shows the status PARV in the blotter is inferred.
// The feature's two scenarios (counterparty, risk portfolio) are one case (user decision): the field is the case
// data amendmentField, which the PO chooses in the runner, and the new value of each field is case data too.

// Not ported: the feature's first scenario (-UI-001, amendment of the Deal Date). Its date is "today plus 1
// business day", worked out when the case runs: a case file has no such value, and the date field of the trade
// details is a control this project does not operate yet.

type Data = TradeProvisioningData & TradeAmendmentData & ProductData;

// One case for every product (explicit user requirement): QA's run repeats it for each product with the event's
// capability (framework/products.ts), each run creating its trade through the API (titles tagged @product:<PRODUCT>,
// so --grep @product:FX_TRF runs one). The case file is exported once, from the run for the product of the test
// data; the PO chooses the product, or gives the ID of a trade of that product, in the runner. Values that differ
// for a product go under "byProduct" in the test data.
test.describe('Trade amendment', () => {
  for (const forProduct of productsWith('amendment')) {
    test(`[TC-TRADE-AMENDMENT-UI-002] Amendment of a Live trade is pending checker approval after Maker submits it ${productTag(forProduct)}`, async ({ Given, When, Then, And, flows, testData }) => {
      const { product, data } = givenProduct(flows, testData<Data & GivenTradeData>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker changes the field named by the case data amendmentField (Counterparty or Risk Portfolio) in the trade details and the amendment is pending checker approval', forProduct);
      givenTrade(flows, data);

      const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.trades.orCreate(() => flows.tradeProvisioning.provisionLiveTrade(product, data)));
      await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
      await When("perform amendment for '${param:amendmentField}' on the trade", () => flows.tradeAmendment.amend(tradeId, data));
      await Then('the amendment is pending checker approval', () => flows.tradeAmendment.expectPendingCheckerApproval(tradeId));
    });
  }
});
