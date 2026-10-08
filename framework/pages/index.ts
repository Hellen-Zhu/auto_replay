// All page objects of the application, sharing one UI (one browser page, one recording).
// Tests and flows receive this as the `app` fixture. Register a new page object here.

import type { UI } from '../ui';
import { LoginPage } from './login.page';
import { TopBar } from './top-bar';
import { TradesPage } from './trades.page';
import { NewTradePage } from './new-trade.page';
import { TradeDetailPage } from './trade-detail.page';

export class App {
  readonly login: LoginPage;
  readonly topBar: TopBar;
  readonly trades: TradesPage;
  readonly newTrade: NewTradePage;
  readonly tradeDetail: TradeDetailPage;

  constructor(readonly ui: UI) {
    this.login = new LoginPage(ui);
    this.topBar = new TopBar(ui);
    this.trades = new TradesPage(ui);
    this.newTrade = new NewTradePage(ui);
    this.tradeDetail = new TradeDetailPage(ui);
  }
}

export { BasePage } from './base.page';
export { LoginPage, TopBar, TradesPage, NewTradePage, TradeDetailPage };
