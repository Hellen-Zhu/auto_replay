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

/** The numbers of subtrades an allocation case can be run with: case data the PO chooses in the runner */
export const ALLOCATION_WAYS = ['2', '3', '4'] as const;

/** The data of a trade allocation case (the block allocation of testdata/common.json) */
export interface TradeAllocationData {
  /** How many subtrades the trade is split into: one of ALLOCATION_WAYS */
  allocationWays: string;
  /**
   * In the order of the rows of the dialog, one per subtrade of the largest allocation, so that the PO can choose
   * any number of ALLOCATION_WAYS; a run fills only the rows it splits into. A percentage left out keeps the equal
   * split the dialog proposes; one that is given must add up to 100 with the others for every number the PO may choose
   */
  subTrades: SubTradeData[];
  allocationComments: string;
}

/** The case data allocationWays in a text: recorded as it is, filled in with the value of the run */
const WAYS = '${param:allocationWays}';

const MAX_WAYS = Number(ALLOCATION_WAYS[ALLOCATION_WAYS.length - 1]);

/**
 * Allocating a live trade to subtrades from the trade portal, mirroring the E2E project's trade_allocation and
 * lifecycle_event snippets. The outcome is asserted by the case with the expect... flows.
 */
export class TradeAllocationFlow extends BaseFlow {
  private readonly tradesFlow = new TradesFlow(this.app);

  /**
   * Maker splits the trade into allocationWays subtrades, up to the confirmed allocation. The feature's "equal" and
   * "unequal" allocations are both this flow: they differ only in the data of the subtrades. The rows beyond the
   * second are recorded for every number of ALLOCATION_WAYS and run only when the case data needs them
   */
  async allocate(tradeId: string, data: TradeAllocationData) {
    const subTrades = data.subTrades ?? [];
    if (subTrades.length < MAX_WAYS) {
      throw new Error(`An allocation case needs ${MAX_WAYS} entries in the test data "subTrades" (the largest of ${ALLOCATION_WAYS.join(', ')} ways); the case has ${subTrades.length}`);
    }
    // A list cannot be a parameter: each value of a subtrade becomes one, named after its row (subTrade1Percentage)
    const values: Record<string, string | undefined> = {};
    subTrades.slice(0, MAX_WAYS).forEach((subTrade, i) => {
      values[`subTrade${i + 1}CounterpartyName`] = subTrade.counterpartyName;
      values[`subTrade${i + 1}Percentage`] = subTrade.percentage;
    });
    const p = this.params(data);
    const row = this.params(values);
    const ways = p.allocationWays;
    // A trade is never allocated twice to the same counterparty: checked for the data of this run, and by the runner
    // for the counterparties of the subtrades the PO's run splits into
    this.ui.distinct(...subTrades.slice(0, MAX_WAYS).flatMap((s, i) => (s.counterpartyName ? [row[`subTrade${i + 1}CounterpartyName`]] : [])));
    const { trades, allocationDialog, dynamicAction } = this.app;

    await this.tradesFlow.openActionMenu(tradeId);
    await this.ui.And('I choose Allocation from the action menu', async () => {
      await trades.expectRowActionVisible('allocation');
      await trades.clickRowAction('allocation');
      await dynamicAction.expectVisible();
    });
    await this.ui.And(`I split the trade into ${WAYS} subtrades`, () => allocationDialog.typeSplitNumber(ways));
    for (const [i, subTrade] of subTrades.slice(0, MAX_WAYS).entries()) {
      if (!subTrade.counterpartyName && !subTrade.percentage) continue;
      const fill = () => this.ui.And(`I fill in subtrade ${i + 1}`, async () => {
        if (subTrade.counterpartyName) {
          await allocationDialog.openSubTradeCounterparty(i);
          // the dropdown lists only a part of its entries: the one to pick is searched for first
          await allocationDialog.searchOption(row[`subTrade${i + 1}CounterpartyName`]);
          await allocationDialog.chooseOption(row[`subTrade${i + 1}CounterpartyName`]);
        }
        if (subTrade.percentage) await allocationDialog.typeSubTradePercentage(i, row[`subTrade${i + 1}Percentage`]);
      });
      // every allocation has two subtrades at least; a further row is filled only when the trade is split into it
      if (i < 2) await fill();
      else await this.ui.onlyWhen(ways, ALLOCATION_WAYS, ALLOCATION_WAYS.filter((n) => Number(n) > i), fill);
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

  /** The success toast of the allocation is shown: it names the number of subtrades the trade was split into */
  async expectCompleted(data: TradeAllocationData, keyword: Keyword = 'Then') {
    this.params(data).allocationWays; // the case data the texts below name
    await this.ui[keyword](`I see the message that the trade has been allocated into ${WAYS} subtrades`, () =>
      this.app.toast.expectMessage(Toast.message.allocatedInto(WAYS)),
    );
  }

  /** The allocated trade is replaced by its subtrades: its trade details show the status DEAD */
  async expectAllocatedToDead(tradeId: string, keyword: Keyword = 'Then') {
    const { tradeDetail } = this.app;
    await this.ui[keyword]('I open the trade details of the trade', () => tradeDetail.open(tradeId));
    await this.ui.And(`its status badge shows ${TradesPage.status.dead}`, () => tradeDetail.expectStatusBadge(TradesPage.status.dead));
  }
}
