import { BaseFlow, type Keyword } from './base.flow';

/** The Trades page and its blotters */
export class TradesFlow extends BaseFlow {
  async expectOnTradesPage(keyword: Keyword = 'Then') {
    await this.ui[keyword]('I am on the Trades page', async () => {
      await this.app.trades.expectOpen();
      await this.app.topBar.expectVisible();
    });
  }
}
