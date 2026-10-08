import type { TargetIn, Val } from '../ui';
import { element } from '../elements';
import { BasePage } from './base.page';

/** Trades page (the trade portal): the landing page after login, with the search box and the blotters */
export class TradesPage extends BasePage {
  static readonly path = '/trades';

  // The search box is a web component: the real control in its shadow root is an input or a textarea
  protected readonly searchInput = element('trade_portal.search_input', { inner: "input[part='input'], textarea[part='input']" });
  protected readonly allTradesBlotter = element('trade_portal.all_trade_blotter');

  /** The first row of the blotter that shows this trade ID: the rows are only told apart by their text */
  protected row(tradeId: Val): TargetIn {
    return { ...this.allTradesBlotter, inner: 'role=row', hasText: tradeId, nth: 0 };
  }

  async expectOpen() {
    await this.ui.expectUrl(TradesPage.path);
  }

  /** Pass the ID a booking returned; it is recorded as a variable, so a replay searches for its own trade */
  async searchTrade(tradeId: Val) {
    await this.ui.fill(this.searchInput, tradeId);
  }

  /** Opens the action menu of the trade's row; in the blotter that is a right-click on the row */
  async openActionMenu(tradeId: Val) {
    await this.ui.rightClick(this.row(tradeId));
  }
}
