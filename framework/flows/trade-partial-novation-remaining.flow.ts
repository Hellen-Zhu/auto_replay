import type { Val } from '../ui';
import { TradesPage } from '../pages';
import { TradeChangeConfirmation } from '../components/trade-change-confirmation';
import { BaseFlow, type Keyword } from './base.flow';
import { LifecycleEventFlow } from './lifecycle-event.flow';

/** The data of a partial novation of the remaining trade (testdata/trade-partial-novation-remaining.json) */
export interface TradePartialNovationRemainingData {
  /** The counterparty the trade was created with, which the original trade keeps */
  counterpartyName: string;
  /** The notional that stays on the original trade */
  remainingNotional: string;
  newCounterpartyName: string;
}

/**
 * Novating a part of a live trade to another counterparty, mirroring the E2E project's
 * trade_partial_novation_remaining snippet: the original trade keeps the remaining notional, a new trade with the
 * rest is created for the new counterparty. No checker is involved. The outcome is asserted by the case with the
 * expect... flow.
 */
export class TradePartialNovationRemainingFlow extends BaseFlow {
  private readonly lifecycleEvent = new LifecycleEventFlow(this.app);

  /**
   * Maker novates a part of the trade, up to the confirmed trade change.
   * Returns the ID of the new trade (recorded as ${var:newTradeId}).
   */
  async novatePartially(tradeId: string, data: TradePartialNovationRemainingData): Promise<string> {
    const p = this.params(data);
    const { dynamicAction, trades } = this.app;

    // Always from the action menu of the trade's row, for every product (user decision; the E2E project starts it
    // from the trade details' More actions for FX_FSB = FX_PSCRIPT_FSKO)
    await this.lifecycleEvent.openAction(tradeId, 'partialNovationRemaining', 'Partial Novation Remaining');
    // The equation line the dialog shows (original notional - remaining = novated) is not checked (user decision: the
    // case performs the event; the original notional depends on the product's dat file)
    await this.ui.And('I type the remaining notional', () => dynamicAction.typeField('remainingNotional', p.remainingNotional));
    await this.ui.And('I select the new counterparty', () => dynamicAction.selectCounterparty(p.newCounterpartyName));
    await this.ui.And('I confirm the event', async () => {
      await dynamicAction.confirmAndAwaitPartialNovationRisk(tradeId);
      await trades.confirmDialog.expectVisible();
    });
    return this.ui.And('I confirm the trade change', () =>
      trades.confirmDialog.confirmAndCapture(TradeChangeConfirmation.newTradeOfPartialNovation),
    );
  }

  /**
   * The original trade is live with the remaining notional and its own counterparty; the new trade is live with
   * the new counterparty. Both are read in their trade details. The new trade's notional (the rest of the original
   * one) is not checked: it depends on the product's dat file.
   */
  async expectPartiallyNovated(tradeId: string, newTradeId: string, data: TradePartialNovationRemainingData, keyword: Keyword = 'Then') {
    const p = this.params(data);
    await this.expectTradeDetails('the original trade', tradeId, p.remainingNotional, p.counterpartyName, keyword);
    await this.expectTradeDetails('the new trade', newTradeId, undefined, p.newCounterpartyName, 'And');
  }

  /** The E2E project's "trade details show '<status>' status with correct notional ... and counterparty ..." */
  private async expectTradeDetails(which: string, tradeId: string, notional: Val | undefined, counterparty: Val, keyword: Keyword) {
    const { tradeDetail } = this.app;
    await this.ui[keyword](`I open the trade details of ${which}`, async () => {
      await tradeDetail.open(tradeId);
      await tradeDetail.expectTradeId(tradeId);
    });
    await this.ui.And(`its status badge shows ${TradesPage.status.live}`, () => tradeDetail.expectStatusBadge(TradesPage.status.live));
    await this.ui.And(notional === undefined ? 'its counterparty is as expected' : 'its notional and counterparty are as expected', async () => {
      if (notional !== undefined) await tradeDetail.expectValue('notionalAmount', notional);
      await tradeDetail.expectValue('counterparty', counterparty);
    });
  }
}
