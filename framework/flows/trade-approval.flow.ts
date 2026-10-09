import { Toast } from '../components/toast';
import { BaseFlow, type Keyword } from './base.flow';
import { TradesFlow } from './trades.flow';

/**
 * The checker's decision on a trade that is pending approval (a new trade, a cancellation, ...), made from the
 * trade's row in the trade portal; mirrors the E2E project's trade portal snippets. The checker must be logged in.
 * What the decision does to the trade is asserted by the case with the expect... flow of its event.
 */
export class TradeApprovalFlow extends BaseFlow {
  private readonly tradesFlow = new TradesFlow(this.app);

  /** Checker approves the pending trade from its row in the blotter */
  async approveFromTradePortal(tradeId: string) {
    const { checkerAction } = this.app.trades;
    await this.tradesFlow.openActionMenu(tradeId);
    await this.ui.And('I choose Approve from the action menu', async () => {
      await checkerAction.expectApproveVisible();
      await checkerAction.clickApprove();
    });
    await this.ui.And('I confirm the approval', () => checkerAction.confirm());
  }

  /** Checker rejects the pending trade from its row in the blotter */
  async rejectFromTradePortal(tradeId: string) {
    const { checkerAction } = this.app.trades;
    await this.tradesFlow.openActionMenu(tradeId);
    await this.ui.And('I choose Reject from the action menu', async () => {
      await checkerAction.expectRejectVisible();
      await checkerAction.clickReject();
    });
    await this.ui.And('I confirm the rejection', () => checkerAction.confirm());
  }

  /** The success toast of the approval is shown */
  async expectApproved(keyword: Keyword = 'Then') {
    await this.ui[keyword]('I see the message that the trade is approved', () =>
      this.app.toast.expectTitle(Toast.title.tradeApproved),
    );
  }

  /** The success toast of the rejection is shown */
  async expectRejected(keyword: Keyword = 'Then') {
    await this.ui[keyword]('I see the message that the trade is rejected', () =>
      this.app.toast.expectTitle(Toast.title.tradeRejected),
    );
  }
}
