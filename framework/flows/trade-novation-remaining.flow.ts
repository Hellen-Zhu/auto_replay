import { Toast } from '../components/toast';
import { TradesPage } from '../pages';
import { BaseFlow, type Keyword } from './base.flow';
import { LifecycleEventFlow } from './lifecycle-event.flow';
import { TradesFlow } from './trades.flow';

/** The data of a novation of the remaining trade (testdata/trade-novation-remaining.json) */
export interface TradeNovationRemainingData {
  /** Typed only with the input profile WITH_TARGET_AMOUNT */
  novationTargetAmount: string;
  newCounterpartyName: string;
}

/** What the maker enters: the E2E project's input profiles of the event */
export type NovationInputProfile = 'WITH_TARGET_AMOUNT' | 'WITHOUT_TARGET_AMOUNT';

/**
 * Novating what remains of a live trade to another counterparty from the trade portal, mirroring the E2E project's
 * trade_novation_remaining and lifecycle_event snippets. No checker is involved. The outcome is asserted by the
 * case with the expect... flows.
 */
export class TradeNovationRemainingFlow extends BaseFlow {
  private readonly tradesFlow = new TradesFlow(this.app);
  private readonly lifecycleEvent = new LifecycleEventFlow(this.app);

  /** Maker novates the remaining trade, up to the confirmed trade change */
  async novateRemaining(tradeId: string, profile: NovationInputProfile, data: TradeNovationRemainingData) {
    const p = this.params(data);
    const { dynamicAction } = this.app;

    await this.lifecycleEvent.openAction(tradeId, 'novationRemaining', 'Novation Remaining');
    if (profile === 'WITH_TARGET_AMOUNT') {
      await this.ui.And('I type the target amount', () => dynamicAction.typeField('novationRemainingTargetAmount', p.novationTargetAmount));
    }
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
