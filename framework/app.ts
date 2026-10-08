// The application under test: every page object and shared component, all acting through one UI
// (one browser page, one recording). Injected as the `app` fixture; register a new page object here.

import type { UI } from './ui';
import { TopBar } from './components/top-bar';
import { LoginPage, TradesPage, NewTradePage, TradeDetailPage } from './pages';

export class App {
  readonly topBar: TopBar;
  readonly login: LoginPage;
  readonly trades: TradesPage;
  readonly newTrade: NewTradePage;
  readonly tradeDetail: TradeDetailPage;

  constructor(readonly ui: UI) {
    this.topBar = new TopBar(ui);
    this.login = new LoginPage(ui);
    this.trades = new TradesPage(ui);
    this.newTrade = new NewTradePage(ui);
    this.tradeDetail = new TradeDetailPage(ui);
  }
}
