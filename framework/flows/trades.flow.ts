import { TradesPage } from '../pages';
import { BaseFlow, type Keyword } from './base.flow';

/** The Trades page and its blotters */
export class TradesFlow extends BaseFlow {
  async expectOnTradesPage(keyword: Keyword = 'Then') {
    await this.ui[keyword]('I am on the Trades page', async () => {
      await this.app.trades.expectOpen();
      await this.app.topBar.expectVisible();
    });
  }

  /**
   * A case that works on a trade which is already in the system, instead of creating its own: the PO enters the
   * trade's ID before the run (case data "tradeId"). Returns the ID for the flows that follow.
   */
  existingTrade(tradeId: string): string {
    return this.input('tradeId', tradeId);
  }

  /** Where every action on an existing trade starts: its row in the blotter, with the action menu open */
  async openActionMenu(tradeId: string, keyword: Keyword = 'When') {
    const { trades } = this.app;
    await this.ui[keyword]('I search for the trade and open its action menu', async () => {
      await trades.searchTrade(tradeId);
      await trades.openActionMenu(tradeId);
    });
  }

  /** In the blotter of the trade portal the trade's row shows this status and, when one is given, this event status */
  async expectStatusInBlotter(tradeId: string, status: string, eventStatus?: string, keyword: Keyword = 'Then') {
    const { trades } = this.app;
    await this.ui[keyword]('I open the trade portal and search for the trade', async () => {
      await trades.open();
      await trades.searchTrade(tradeId);
    });
    await this.ui.And(`its row shows the status ${status}${eventStatus ? ` and the event status ${eventStatus}` : ''}`, async () => {
      await trades.expectRowShows(tradeId, status);
      if (eventStatus) await trades.expectRowShows(tradeId, eventStatus);
    });
  }

  /** The trade is waiting for the checker's decision */
  async expectPendingApproval(tradeId: string, keyword: Keyword = 'Then') {
    await this.expectStatusInBlotter(tradeId, TradesPage.status.pendingApproval, undefined, keyword);
  }

  /** The trade is live */
  async expectLive(tradeId: string, keyword: Keyword = 'Then') {
    await this.expectStatusInBlotter(tradeId, TradesPage.status.live, undefined, keyword);
  }

  /** The trade is live and no event is under way on it */
  async expectLiveAndNew(tradeId: string, keyword: Keyword = 'Then') {
    await this.expectStatusInBlotter(tradeId, TradesPage.status.live, TradesPage.eventStatus.new, keyword);
  }
}
