import { test } from '../framework/fixtures';
import type { TradeEarlyTerminationData, TradeProvisioningData } from '../framework/flows';
import { givenProduct, givenTradeId, loggedIn, type ProductData } from './support';

// Mirrors trade_early_termination.feature of the E2E project, steps included. The live trade of the Given is
// created through the API (flows.tradeProvisioning), so the case needs apiBaseUrl in the local config.
// The feature runs the scenario for three products; here it runs for one (user decision, minimal coverage: the
// pages of an early termination are the same for every product).
// The direction, amount and currency of the event are case data, taken from the E2E project's test data.

type Data = TradeProvisioningData & TradeEarlyTerminationData & ProductData;

test.describe('Trade early termination', () => {
  test('[TC-TRADE-EARLY-TERMINATION-UI-001] should able to perform EarlyTermination event for a trade successfully', async ({ Given, When, Then, And, flows, testData }) => {
    const { product, data } = givenProduct(flows, testData<Data>(), 'A live trade of the product in the case data is created through the API from the dat file of the case data; maker terminates it early from the trade portal and the trade is Dead with the event status Terminated');

    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When(`perform the Early Termination event on the '${product}' trade`, () => flows.tradeEarlyTermination.terminateEarly(tradeId, data));
    await Then('the early termination is completed successfully', () => flows.tradeEarlyTermination.expectCompleted());
    await And('the trade is closed as Terminated', () => flows.tradeEarlyTermination.expectClosedAsTerminated(tradeId));
  });

  test('[TC-TRADE-EARLY-TERMINATION-EXISTING-UI-001] should able to perform EarlyTermination event for a given Live trade successfully', async ({ Given, When, Then, And, flows, testData }) => {
    const tradeId = flows.trades.existingTrade(givenTradeId('Maker terminates the live trade with the given ID early from the trade portal and the trade is Dead with the event status Terminated'));
    const data = testData<TradeEarlyTerminationData>();

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    await And('the given trade is Live', () => flows.trades.expectLive(tradeId));
    await When('perform the Early Termination event on the trade', () => flows.tradeEarlyTermination.terminateEarly(tradeId, data));
    await Then('the early termination is completed successfully', () => flows.tradeEarlyTermination.expectCompleted());
    await And('the trade is closed as Terminated', () => flows.tradeEarlyTermination.expectClosedAsTerminated(tradeId));
  });
});
