import { Toast } from '../components/toast';
import { TradesPage } from '../pages';
import { BaseFlow, type Keyword } from './base.flow';
import { LifecycleEventFlow } from './lifecycle-event.flow';
import { TradesFlow } from './trades.flow';

/** The data of a novation of the remaining trade (testdata/trade-novation-remaining.json) */
export interface TradeNovationRemainingData {
  /**
   * Typed when it has a value; empty for a product whose dialog has no target amount (byProduct in the test data),
   * which replaces the E2E project's input profiles WITH_TARGET_AMOUNT / WITHOUT_TARGET_AMOUNT (user decision)
   */
  novationTargetAmount: string;
  newCounterpartyName: string;
}

/**
 * Novating what remains of a live trade to another counterparty from the trade portal, mirroring the E2E project's
 * trade_novation_remaining and lifecycle_event snippets. No checker is involved. The outcome is asserted by the
 * case with the expect... flows.
 */
export class TradeNovationRemainingFlow extends BaseFlow {
  private readonly tradesFlow = new TradesFlow(this.app);
  private readonly lifecycleEvent = new LifecycleEventFlow(this.app);

  /** Maker novates the remaining trade, up to the confirmed trade change */
  async novateRemaining(tradeId: string, data: TradeNovationRemainingData) {
    const p = this.params(data);
    const { dynamicAction } = this.app;

    await this.lifecycleEvent.openAction(tradeId, 'novationRemaining', 'Novation Remaining');
    // recorded for every run; it runs only while the case data has a value, which the PO may leave empty
    await this.ui.onlyWhenFilled(p.novationTargetAmount, () =>
      this.ui.And('I type the target amount', () => dynamicAction.typeField('novationRemainingTargetAmount', p.novationTargetAmount)));
    await this.ui.And('I select the new counterparty', () => dynamicAction.selectCounterparty(p.newCounterpartyName));
    await this.lifecycleEvent.submit(tradeId);
  }

  /** The success toast of the novation is shown; the E2E project checks its title, not its message */
  async expectCompleted(keyword: Keyword = 'Then') {
    await this.ui[keyword]('I see the message that the novation is completed', () =>
      this.app.toast.expectTitle(Toast.title.novationCompleted),
    );
  }

  /** In the blotter the original trade is dead with the event status Novated */
  async expectOriginalClosedAsNovated(tradeId: string, keyword: Keyword = 'Then') {
    await this.tradesFlow.expectStatusInBlotter(tradeId, TradesPage.status.dead, TradesPage.eventStatus.novated, keyword);
  }
}
