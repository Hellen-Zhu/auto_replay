import { AllocationDialog } from '../components/allocation-dialog';
import { Toast } from '../components/toast';
import { TradesPage } from '../pages';
import { BaseFlow, type Keyword } from './base.flow';
import { TradesFlow } from './trades.flow';

/** One subtrade of an allocation; what is left out keeps the value the dialog proposes */
export interface SubTradeData {
  counterpartyName?: string;
  percentage?: string;
}

/** The data of one trade allocation case (testdata/trade-allocation.json) */
export interface TradeAllocationData {
  /** In the order of the rows of the dialog; at least as many as the trade is split into */
  subTrades: SubTradeData[];
  allocationComments: string;
}

/**
 * Allocating a live trade to subtrades from the trade portal, mirroring the E2E project's trade_allocation and
 * lifecycle_event snippets. The outcome is asserted by the case with the expect... flows.
 */
export class TradeAllocationFlow extends BaseFlow {
  private readonly tradesFlow = new TradesFlow(this.app);

  /**
   * Maker splits the trade into that many subtrades, up to the confirmed allocation. The feature's "equal" and
   * "unequal" allocations are both this flow: they differ only in the data of the subtrades.
   */
  async allocate(tradeId: string, ways: number, data: TradeAllocationData) {
    const subTrades = (data.subTrades ?? []).slice(0, ways);
    if (subTrades.length < ways) {
      throw new Error(`A ${ways} way allocation needs ${ways} entries in the test data "subTrades"; the case has ${subTrades.length}`);
    }
    // A list cannot be a parameter: each value of a subtrade becomes one, named after its row (subTrade1Percentage)
    const values: Record<string, string | undefined> = {};
    subTrades.forEach((subTrade, i) => {
      values[`subTrade${i + 1}CounterpartyName`] = subTrade.counterpartyName;
      values[`subTrade${i + 1}Percentage`] = subTrade.percentage;
    });
    const p = this.params(data);
    const row = this.params(values);
    const { trades, allocationDialog, dynamicAction } = this.app;

    await this.tradesFlow.openActionMenu(tradeId);
    await this.ui.And('I choose Allocation from the action menu', async () => {
      await trades.expectRowActionVisible('allocation');
      await trades.clickRowAction('allocation');
      await dynamicAction.expectVisible();
    });
    await this.ui.And(`I split the trade into ${ways} subtrades`, () => allocationDialog.typeSplitNumber(String(ways)));
    for (const [i, subTrade] of subTrades.entries()) {
      if (!subTrade.counterpartyName && !subTrade.percentage) continue;
      await this.ui.And(`I fill in subtrade ${i + 1}`, async () => {
        if (subTrade.counterpartyName) {
          await allocationDialog.openSubTradeCounterparty(i);
          await allocationDialog.chooseOption(row[`subTrade${i + 1}CounterpartyName`]);
        }
        if (subTrade.percentage) await allocationDialog.typeSubTradePercentage(i, row[`subTrade${i + 1}Percentage`]);
      });
    }
    // Not the outcome of the case: the dialog must show a complete allocation before it can be confirmed
    await this.ui.And('I see that the whole trade is allocated', async () => {
      await allocationDialog.expectTotalPct(AllocationDialog.text.fullyAllocated);
      await allocationDialog.expectRemaining(AllocationDialog.text.nothingRemaining);
    });
    await this.ui.And('I confirm the allocation', async () => {
      await dynamicAction.confirm();
      await trades.confirmDialog.expectVisible();
    });
    await this.ui.And('I type the comments and confirm the change', async () => {
      await trades.confirmDialog.typeComments(p.allocationComments);
      await trades.confirmDialog.confirmAndAwait();
    });
  }

  /** The success toast of the allocation is shown */
  async expectCompleted(keyword: Keyword = 'Then') {
    await this.ui[keyword]('I see the message that the allocation is completed', () =>
      this.app.toast.expectMessage(Toast.message.allocationCompleted),
    );
  }

  /** The allocated trade is replaced by its subtrades: its trade details show the status DEAD */
  async expectAllocatedToDead(tradeId: string, keyword: Keyword = 'Then') {
    await this.tradesFlow.openTradeDetails(tradeId, keyword);
    await this.ui.And(`its status badge shows ${TradesPage.status.dead}`, () =>
      this.app.tradeDetail.expectStatusBadge(TradesPage.status.dead),
    );
  }
}
