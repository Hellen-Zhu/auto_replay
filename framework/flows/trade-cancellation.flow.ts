import { Toast } from '../components/toast';
import { TradesPage } from '../pages';
import { BaseFlow, type Keyword } from './base.flow';
import { TradesFlow } from './trades.flow';

/** The data of one trade cancellation case (testdata/trade-cancellation.json) */
export interface TradeCancellationData {
  cancelReason: string;
  cancelComments: string;
}

/**
 * Cancelling an existing trade from the trade portal, mirroring the E2E project's trade_cancellation snippets.
 * The trade ID is the one a booking or a provisioning returned; the outcome is asserted by the case with the
 * expect... flows.
 */
export class TradeCancellationFlow extends BaseFlow {
  private readonly tradesFlow = new TradesFlow(this.app);

  /** Maker cancels the trade from its row in the blotter, up to the confirmed cancellation */
  async cancelFromTradePortal(tradeId: string, data: TradeCancellationData) {
    const p = this.params(data);
    const { trades } = this.app;

    await this.tradesFlow.openActionMenu(tradeId);
    await this.ui.And('I choose Cancel from the action menu', async () => {
      await trades.expectCancelActionVisible();
      await trades.clickCancelAction(tradeId);
      await trades.confirmDialog.expectVisible();
    });
    await this.ui.And('I select the cancellation reason and type the comments', async () => {
      await trades.confirmDialog.selectReason(p.cancelReason);
      await trades.confirmDialog.typeComments(p.cancelComments);
    });
    await this.ui.And('I confirm the cancellation', () => trades.confirmDialog.confirm());
  }

  /** The success toast of the cancellation is shown */
  async expectSubmitted(keyword: Keyword = 'Then') {
    await this.ui[keyword]('I see the message that the cancellation is completed', () =>
      this.app.toast.expectMessage(Toast.message.cancellationCompleted),
    );
  }

  /** In the blotter the trade is pending approval with the event status Cancelled */
  async expectPendingCheckerApproval(tradeId: string, keyword: Keyword = 'Then') {
    const { trades } = this.app;
    await this.ui[keyword]('I open the trade portal and search for the trade', async () => {
      await trades.open();
      await trades.searchTrade(tradeId);
    });
    await this.ui.And('its row shows it is pending approval for a cancellation', async () => {
      await trades.expectRowShows(tradeId, TradesPage.status.pendingApproval);
      await trades.expectRowShows(tradeId, TradesPage.eventStatus.cancelled);
    });
  }
}
