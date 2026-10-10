import { Toast } from '../components/toast';
import { TradesPage } from '../pages';
import { BaseFlow, type Keyword } from './base.flow';
import { LifecycleEventFlow } from './lifecycle-event.flow';
import { TradesFlow } from './trades.flow';

/** The data of a full step out (testdata/trade-step-out-full.json): the fee and the counterparty that steps in */
export interface TradeStepOutData {
  stepOutDirection: string;
  stepOutAmount: string;
  stepOutCurrency: string;
  stepOutCounterpartyName: string;
}

/** The data of a partial step out (testdata/trade-step-out-partial.json): also what stays with the trade */
export interface TradeStepOutPartialData extends TradeStepOutData {
  stepOutNewNotional: string;
}

/**
 * Stepping out of a live trade, fully or partly, from the trade portal, mirroring the E2E project's
 * trade_step_out_full, trade_step_out_partial and lifecycle_event snippets. No checker is involved. The outcome is
 * asserted by the case with the expect... flows.
 */
export class TradeStepOutFlow extends BaseFlow {
  private readonly tradesFlow = new TradesFlow(this.app);
  private readonly lifecycleEvent = new LifecycleEventFlow(this.app);

  /** Maker steps out of the whole trade, up to the confirmed trade change */
  async stepOutFull(tradeId: string, data: TradeStepOutData) {
    const p = this.params(data);
    const { dynamicAction } = this.app;

    await this.lifecycleEvent.openAction(tradeId, 'stepOutFull', 'Step Out Full');
    await this.ui.And('I select the direction and type the amount and the currency', async () => {
      await dynamicAction.openDirection();
      await dynamicAction.chooseOption(p.stepOutDirection);
      await dynamicAction.typeField('amount', p.stepOutAmount);
      await dynamicAction.typeField('currency', p.stepOutCurrency);
    });
    await this.ui.And('I select the counterparty', () => dynamicAction.selectCounterparty(p.stepOutCounterpartyName));
    await this.lifecycleEvent.submit(tradeId);
  }

  /** Maker steps out of a part of the trade, up to the confirmed trade change */
  async stepOutPartial(tradeId: string, data: TradeStepOutPartialData) {
    const p = this.params(data);
    const { dynamicAction } = this.app;

    await this.lifecycleEvent.openAction(tradeId, 'stepOutPartial', 'Step Out Partial');
    await this.ui.And('I select the direction and type the amount, the currency and the new notional', async () => {
      await dynamicAction.openDirection();
      await dynamicAction.chooseOption(p.stepOutDirection);
      await dynamicAction.typeField('amount', p.stepOutAmount);
      await dynamicAction.typeField('currency', p.stepOutCurrency);
      await dynamicAction.typeField('newNotional', p.stepOutNewNotional);
    });
    await this.ui.And('I select the counterparty', () => dynamicAction.selectCounterparty(p.stepOutCounterpartyName));
    await this.lifecycleEvent.submit(tradeId);
  }

  /** The success toast of the full step out is shown */
  async expectFullCompleted(keyword: Keyword = 'Then') {
    await this.ui[keyword]('I see the message that the step out full is completed', () =>
      this.app.toast.expectMessage(Toast.message.stepOutFullCompleted),
    );
  }

  /** The success toast of the partial step out is shown */
  async expectPartialCompleted(keyword: Keyword = 'Then') {
    await this.ui[keyword]('I see the message that the step out partial is completed', () =>
      this.app.toast.expectMessage(Toast.message.stepOutPartialCompleted),
    );
  }

  /** In the blotter the trade is dead with the event status Novated */
  async expectClosedAsNovated(tradeId: string, keyword: Keyword = 'Then') {
    await this.tradesFlow.expectStatusInBlotter(tradeId, TradesPage.status.dead, TradesPage.eventStatus.novated, keyword);
  }

  /** In the blotter the trade is still live, with the event status Novated */
  async expectLiveAndNovated(tradeId: string, keyword: Keyword = 'Then') {
    await this.tradesFlow.expectStatusInBlotter(tradeId, TradesPage.status.live, TradesPage.eventStatus.novated, keyword);
  }
}
