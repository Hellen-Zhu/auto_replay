import { test } from '../framework/fixtures';
import type { TradeAllocationData, TradeProvisioningData } from '../framework/flows';
import { prepare } from './support';

// Mirrors trade_allocation.feature of the E2E project, steps included. The live trade of the Given is created
// through the API (flows.tradeProvisioning), so the cases need apiBaseUrl in the local config.
// The feature runs -UI-001 for three products; here it runs for one (user decision, minimal coverage: the pages of
// an allocation are the same for every product). -UI-003 is about one product, FX_CO there, FX_PSCRIPT here.
// How the trade is split (the subtrades and their percentages) is the data of each case.

type Data = TradeProvisioningData & TradeAllocationData;

test.describe('Trade allocation', () => {
  const product = 'FX_TRF';

  test(`[TC-TRADE-ALLOCATION-${product}-UI-001] Live ${product} trade splits into two equal sub-trades after 50/50 allocation`, async ({ Given, When, Then, And, flows, testData }) => {
    prepare(product, `A live ${product} trade is created through the API; maker allocates it 50/50 to two subtrades from the trade portal and the trade is Dead`);
    const data = testData<Data>();

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When("perform equal '2' way allocation for the trade", () => flows.tradeAllocation.allocate(tradeId, 2, data));
    await Then('the allocation is completed successfully', () => flows.tradeAllocation.expectCompleted());
    await And('the trade is allocated to Dead in the trade details', () => flows.tradeAllocation.expectAllocatedToDead(tradeId));
  });

  test('[TC-TRADE-ALLOCATION-UI-002] Live trade splits into four sub-trades after 30/30/30/10 allocation successfully', async ({ Given, When, Then, And, flows, testData }) => {
    prepare(product, `A live ${product} trade is created through the API; maker allocates it 30/30/30/10 to four subtrades from the trade portal and the trade is Dead`);
    const data = testData<Data>();

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When("perform unequal '4' way allocation for the trade", () => flows.tradeAllocation.allocate(tradeId, 4, data));
    await Then('the allocation is completed successfully', () => flows.tradeAllocation.expectCompleted());
    await And('the trade is allocated to Dead in the trade details', () => flows.tradeAllocation.expectAllocatedToDead(tradeId));
  });

  test('[TC-TRADE-ALLOCATION-UI-003] Live FX_PSCRIPT trade splits into three sub-trades after 34/34/32 allocation successfully', async ({ Given, When, Then, And, flows, testData }) => {
    const product = 'FX_PSCRIPT';
    prepare(product, `A live ${product} trade is created through the API; maker allocates it 34/34/32 to three subtrades from the trade portal and the trade is Dead`);
    const data = testData<Data>();

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When("perform unequal '3' way allocation for the trade", () => flows.tradeAllocation.allocate(tradeId, 3, data));
    await Then('the allocation is completed successfully', () => flows.tradeAllocation.expectCompleted());
    await And('the trade is allocated to Dead in the trade details', () => flows.tradeAllocation.expectAllocatedToDead(tradeId));
  });
});
