import { test } from '../framework/fixtures';
import type { TradeAllocationData, TradeProvisioningData } from '../framework/flows';
import { productsWith } from '../framework/products';
import { givenProduct, givenTrade, type GivenTradeData, type ProductData } from './support';

// Mirrors trade_allocation.feature of the E2E project, steps included. The live trade of the Given is created
// through the API (flows.tradeProvisioning), so the cases need apiBaseUrl in the local config.
// The feature has three cases (50/50, 30/30/30/10, 34/34/32); here they are one (explicit user requirement): the
// number of subtrades is the case data allocationWays (2, 3 or 4), which the PO chooses in the runner, and each
// subtrade's counterparty and percentage are case data too. Data: testdata/trade-allocation.json.

type Data = TradeProvisioningData & TradeAllocationData & ProductData;

// One case per product (explicit user requirement): the test is repeated for each product with the event's capability
// (framework/products.ts), the product in its case ID like the creation cases ([TC-TRADE-<EVENT>-<PRODUCT>-UI-001],
// so --grep FX_TRF-UI runs one product), each run creating its trade through the API and exporting its own case file.
// Values that differ for a product go under "byProduct" in the test data.
test.describe('Trade allocation', () => {
  for (const forProduct of productsWith('allocation')) {
    test(`[TC-TRADE-ALLOCATION-${forProduct}-UI-001] Live ${forProduct} trade splits into sub-trades after allocation`, async ({ Given, When, Then, And, flows, testData }) => {
      const { product, data } = givenProduct(flows, testData<Data & GivenTradeData>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker allocates it to the number of subtrades in the case data (2, 3 or 4) from the trade portal and the trade is Dead', forProduct);
      givenTrade(flows, data);

      const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.trades.orCreate(() => flows.tradeProvisioning.provisionLiveTrade(product, data)));
      await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
      await When("perform '${param:allocationWays}' way allocation for the trade", () => flows.tradeAllocation.allocate(tradeId, data));
      await Then('the allocation is completed successfully', () => flows.tradeAllocation.expectCompleted(data));
      await And('the trade is allocated to Dead in the trade details', () => flows.tradeAllocation.expectAllocatedToDead(tradeId));
    });
  }
});
