import { Toast } from '../components/toast';
import { TradesPage } from '../pages';
import { BaseFlow, type Keyword } from './base.flow';
import { LifecycleEventFlow } from './lifecycle-event.flow';

/** The data of a partial termination (testdata/trade-partial-termination.json) */
export interface TradePartialTerminationData {
  partialTerminationNewNotional: string;
  partialTerminationUnwindFeeAmount: string;
  /** The notional as the trade details show it afterwards */
  expectedNotional: string;
}

/**
 * Terminating a part of a live trade from the trade portal, mirroring the E2E project's trade_partial_termination
 * and lifecycle_event snippets. No checker is involved. The outcome is asserted by the case with the expect... flows.
 */
export class TradePartialTerminationFlow extends BaseFlow {
  private readonly lifecycleEvent = new LifecycleEventFlow(this.app);

  /** Maker reduces the notional of the trade, up to the confirmed trade change */
  async terminatePartially(tradeId: string, data: TradePartialTerminationData) {
    const p = this.params(data);
    const { dynamicAction } = this.app;

    await this.lifecycleEvent.openAction(tradeId, 'partialTermination', 'Partial Termination');
    await this.ui.And('I type the new notional and the unwind fee amount', async () => {
      await dynamicAction.typeField('newNotional', p.partialTerminationNewNotional);
      await dynamicAction.typeField('unwindFeeAmount', p.partialTerminationUnwindFeeAmount);
    });
    await this.lifecycleEvent.submit(tradeId);
  }

  /** The success toast of the partial termination is shown */
  async expectCompleted(keyword: Keyword = 'Then') {
    await this.ui[keyword]('I see the message that the trade is updated with the new notional', () =>
      this.app.toast.expectMessage(Toast.message.partialTerminationCompleted),
    );
  }

  /**
   * The trade details show the reduced notional and the trade is still live. The E2E project gets to the trade
   * details with a double-click on the trade's row; here the page is opened by its address.
   */
  async expectNotionalReduced(tradeId: string, data: TradePartialTerminationData, keyword: Keyword = 'Then') {
    const p = this.params(data);
    const { tradeDetail } = this.app;
    await this.ui[keyword]('I open the trade details of the trade', () => tradeDetail.open(tradeId));
    await this.ui.And('its notional amount is the new notional', () => tradeDetail.expectValue('notionalAmount', p.expectedNotional));
    await this.ui.And(`its status badge shows ${TradesPage.status.live}`, () => tradeDetail.expectStatusBadge(TradesPage.status.live));
  }
}
