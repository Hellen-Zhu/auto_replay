import { test } from '../framework/fixtures';
import type { TradeAllocationData, TradeProvisioningData } from '../framework/flows';
import { givenProduct, givenTradeId, loggedIn, type ProductData } from './support';

// Mirrors trade_allocation.feature of the E2E project, steps included. The live trade of the Given is created
// through the API (flows.tradeProvisioning), so the cases need apiBaseUrl in the local config.
// The feature runs -UI-001 for three products; here it runs for one (user decision, minimal coverage: the pages of
// an allocation are the same for every product). -UI-003 is about one product, FX_CO there, FX_PSCRIPT here.
// How the trade is split (the counterparty and the percentage of each subtrade) and the comments are the data of
// each case, taken from the E2E project's allocation test data.

type Data = TradeProvisioningData & TradeAllocationData & ProductData;

test.describe('Trade allocation', () => {
  test('[TC-TRADE-ALLOCATION-UI-001] Live trade splits into two equal sub-trades after 50/50 allocation', async ({ Given, When, Then, And, flows, testData }) => {
    const { product, data } = givenProduct(flows, testData<Data>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker allocates it 50/50 to two subtrades from the trade portal and the trade is Dead');

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When("perform equal '2' way allocation for the trade", () => flows.tradeAllocation.allocate(tradeId, 2, data));
    await Then('the allocation is completed successfully', () => flows.tradeAllocation.expectCompleted(2));
    await And('the trade is allocated to Dead in the trade details', () => flows.tradeAllocation.expectAllocatedToDead(tradeId));
  });

  test('[TC-TRADE-ALLOCATION-UI-002] Live trade splits into four sub-trades after 30/30/30/10 allocation successfully', async ({ Given, When, Then, And, flows, testData }) => {
    const { product, data } = givenProduct(flows, testData<Data>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker allocates it 30/30/30/10 to four subtrades from the trade portal and the trade is Dead');

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When("perform unequal '4' way allocation for the trade", () => flows.tradeAllocation.allocate(tradeId, 4, data));
    await Then('the allocation is completed successfully', () => flows.tradeAllocation.expectCompleted(4));
    await And('the trade is allocated to Dead in the trade details', () => flows.tradeAllocation.expectAllocatedToDead(tradeId));
  });

  test('[TC-TRADE-ALLOCATION-UI-003] Live FX_PSCRIPT trade splits into three sub-trades after 34/34/32 allocation successfully', async ({ Given, When, Then, And, flows, testData }) => {
    const { product, data } = givenProduct(flows, testData<Data>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker allocates it 34/34/32 to three subtrades from the trade portal and the trade is Dead');

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When("perform unequal '3' way allocation for the trade", () => flows.tradeAllocation.allocate(tradeId, 3, data));
    await Then('the allocation is completed successfully', () => flows.tradeAllocation.expectCompleted(3));
    await And('the trade is allocated to Dead in the trade details', () => flows.tradeAllocation.expectAllocatedToDead(tradeId));
  });

  test('[TC-TRADE-ALLOCATION-EXISTING-UI-001] Given Live trade splits into two equal sub-trades after 50/50 allocation', async ({ Given, When, Then, And, flows, testData }) => {
    const tradeId = flows.trades.existingTrade(givenTradeId('Maker allocates the live trade with the given ID 50/50 to two subtrades from the trade portal and the trade is Dead'));
    const data = testData<TradeAllocationData>();

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    await And('the given trade is Live', () => flows.trades.expectLive(tradeId));
    await When("perform equal '2' way allocation for the trade", () => flows.tradeAllocation.allocate(tradeId, 2, data));
    await Then('the allocation is completed successfully', () => flows.tradeAllocation.expectCompleted(2));
    await And('the trade is allocated to Dead in the trade details', () => flows.tradeAllocation.expectAllocatedToDead(tradeId));
  });
});
