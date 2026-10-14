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

  /**
   * The trade a case works on when it may also create one (case data "tradeId", which may stay empty): the PO enters
   * the ID of a trade before the run, or leaves it empty. Returns the ID, '' when there is none: orCreate then
   * creates the trade.
   */
  givenTrade(tradeId: string): string {
    return this.optionalInput('tradeId', tradeId);
  }

  /**
   * The given trade, or a new one: the steps of create run only while the case data "tradeId" is empty, and the
   * trade they create becomes its value. The case file holds them either way, so a replay with an entered ID works on
   * that trade and one without creates its own. Returns the ID of the trade the case works on.
   */
  async orCreate(create: () => Promise<string>): Promise<string> {
    return this.ui.onlyWhenEmpty('tradeId', async () => {
      const created = await create();
      return this.ui.And('I take the new trade as the given trade', () => this.ui.setParam('tradeId', created));
    });
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
