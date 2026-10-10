import { Toast } from '../components/toast';
import { TradesPage } from '../pages';
import { BaseFlow, type Keyword } from './base.flow';
import { LifecycleEventFlow } from './lifecycle-event.flow';
import { TradesFlow } from './trades.flow';

/** The data of an early termination (testdata/trade-early-termination.json): the unwind fee of the event */
export interface TradeEarlyTerminationData {
  earlyTerminationDirection: string;
  earlyTerminationAmount: string;
  earlyTerminationCurrency: string;
}

/**
 * Terminating a live trade early from the trade portal, mirroring the E2E project's trade_early_termination and
 * lifecycle_event snippets. No checker is involved. The outcome is asserted by the case with the expect... flows.
 */
export class TradeEarlyTerminationFlow extends BaseFlow {
  private readonly tradesFlow = new TradesFlow(this.app);
  private readonly lifecycleEvent = new LifecycleEventFlow(this.app);

  /** Maker terminates the trade early, up to the confirmed trade change */
  async terminateEarly(tradeId: string, data: TradeEarlyTerminationData) {
    const p = this.params(data);
    const { dynamicAction } = this.app;

    await this.lifecycleEvent.openAction(tradeId, 'earlyTermination', 'Early Termination');
    await this.ui.And('I select the direction and type the amount and the currency', async () => {
      await dynamicAction.openDirection();
      await dynamicAction.chooseOption(p.earlyTerminationDirection);
      await dynamicAction.typeField('amount', p.earlyTerminationAmount);
      await dynamicAction.typeField('currency', p.earlyTerminationCurrency);
    });
    await this.lifecycleEvent.submit(tradeId);
  }

  /** The success toast of the early termination is shown */
  async expectCompleted(keyword: Keyword = 'Then') {
    await this.ui[keyword]('I see the message that the early termination is completed', () =>
      this.app.toast.expectMessage(Toast.message.earlyTerminationCompleted),
    );
  }

  /** In the blotter the trade is dead with the event status Terminated */
  async expectClosedAsTerminated(tradeId: string, keyword: Keyword = 'Then') {
    await this.tradesFlow.expectStatusInBlotter(tradeId, TradesPage.status.dead, TradesPage.eventStatus.terminated, keyword);
  }
}
