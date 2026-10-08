import { BaseFlow, type Keyword } from './base.flow';

/** The Trades page and its blotters */
export class TradesFlow extends BaseFlow {
  async expectOnTradesPage(keyword: Keyword = 'Then') {
    await this.ui[keyword]('I am on the Trades page', async () => {
      await this.app.trades.expectOpen();
      await this.app.topBar.expectVisible();
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
}
