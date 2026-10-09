import { test } from '../framework/fixtures';
import type { TradeCancellationData, TradeProvisioningData } from '../framework/flows';
import { productsWith } from '../framework/products';
import { prepare } from './support';

// Mirrors trade_cancellation.feature of the E2E project, steps included. The live trade of the Given is created
// through the API (flows.tradeProvisioning), so the case needs apiBaseUrl in the local config. To cover another
// product, give it the 'cancel' capability in framework/products.ts and put its data/<PRODUCT>.dat in place.

test.describe('Trade cancellation', () => {
  for (const product of productsWith('cancel')) {
    test(`[TC-TRADE-CANCELLATION-${product}-UI-001] ${product} trade moves to Pending Approval after maker submits a cancellation`, async ({ Given, When, Then, And, flows, testData }) => {
      prepare(product, `A live ${product} trade is created through the API; maker cancels it from the trade portal and verifies the cancellation is pending checker approval`);
      const data = testData<TradeProvisioningData & TradeCancellationData>();

      const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
      await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
      await When('perform cancellation for the trade from trade portal', () => flows.tradeCancellation.cancelFromTradePortal(tradeId, data));
      await Then('the cancellation is submitted successfully', () => flows.tradeCancellation.expectSubmitted());
      await And('the cancellation request is pending checker approval', () => flows.tradeCancellation.expectPendingCheckerApproval(tradeId));
    });
  }
});
