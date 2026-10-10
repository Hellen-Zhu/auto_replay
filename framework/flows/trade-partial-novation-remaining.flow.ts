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
  /** What the dialog shows as the calculation of the novated notional; it depends on the notional of the product's dat file */
  equationLine: string;
  /** The notional of the new trade: the rest of the original notional */
  newNotional: string;
}

/** Where the maker starts the event: the action menu of the trade's row, or the More Actions of its trade details */
export type PartialNovationStart = 'portal' | 'detail';

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
  async novatePartially(tradeId: string, from: PartialNovationStart, data: TradePartialNovationRemainingData): Promise<string> {
    const p = this.params(data);
    const { tradeDetail, dynamicAction, trades } = this.app;

    if (from === 'portal') {
      await this.lifecycleEvent.openAction(tradeId, 'partialNovationRemaining', 'Partial Novation Remaining');
    } else {
      await this.ui.When('I open the trade details of the trade', () => tradeDetail.open(tradeId));
      await this.ui.And('I choose Partial Novation Remaining from More Actions', async () => {
        await tradeDetail.clickButton('moreActions');
        await tradeDetail.clickButton('partialNovationRemaining');
      });
    }
    await this.ui.And('I type the remaining notional', async () => {
      await dynamicAction.typeField('remainingNotional', p.remainingNotional);
      await dynamicAction.expectEquationContains(p.equationLine);
    });
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
   * the rest of the notional and the new counterparty. Both are read in their trade details.
   */
  async expectPartiallyNovated(tradeId: string, newTradeId: string, data: TradePartialNovationRemainingData, keyword: Keyword = 'Then') {
    const p = this.params(data);
    await this.expectTradeDetails('the original trade', tradeId, p.remainingNotional, p.counterpartyName, keyword);
    await this.expectTradeDetails('the new trade', newTradeId, p.newNotional, p.newCounterpartyName, 'And');
  }

  /** The E2E project's "trade details show '<status>' status with correct notional ... and counterparty ..." */
  private async expectTradeDetails(which: string, tradeId: string, notional: Val, counterparty: Val, keyword: Keyword) {
    const { tradeDetail } = this.app;
    await this.ui[keyword](`I open the trade details of ${which}`, async () => {
      await tradeDetail.open(tradeId);
      await tradeDetail.expectTradeId(tradeId);
    });
    await this.ui.And(`its status badge shows ${TradesPage.status.live}`, () => tradeDetail.expectStatusBadge(TradesPage.status.live));
    await this.ui.And('its notional and counterparty are as expected', async () => {
      await tradeDetail.expectValue('notionalAmount', notional);
      await tradeDetail.expectValue('counterparty', counterparty);
    });
  }
}
