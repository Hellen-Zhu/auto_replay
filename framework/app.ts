// The application under test: every page object, shared component and API object, all acting through one UI
// (one browser page, one recording). Injected as the `app` fixture; register a new page or API object here.

import type { UI } from './ui';
import { TradesApi } from './api';
import { AllocationDialog } from './components/allocation-dialog';
import { DynamicAction } from './components/dynamic-action';
import { Toast } from './components/toast';
import { TopBar } from './components/top-bar';
import { LoginPage, TradesPage, NewTradePage, TradeDetailPage } from './pages';

export class App {
  // A page looks its elements up when it is created, so each one is created on first use: a case then needs
  // only the elements of the pages it really works on
  private readonly created: {
    topBar?: TopBar;
    toast?: Toast;
    allocationDialog?: AllocationDialog;
    dynamicAction?: DynamicAction;
    login?: LoginPage;
    trades?: TradesPage;
    newTrade?: NewTradePage;
    tradeDetail?: TradeDetailPage;
    tradesApi?: TradesApi;
  } = {};

  constructor(readonly ui: UI) {}

  get topBar() { return (this.created.topBar ??= new TopBar(this.ui)); }
  get toast() { return (this.created.toast ??= new Toast(this.ui)); }
  /** The dialogs a lifecycle event on a trade opens, from the trade portal or the trade detail page */
  get allocationDialog() { return (this.created.allocationDialog ??= new AllocationDialog(this.ui)); }
  get dynamicAction() { return (this.created.dynamicAction ??= new DynamicAction(this.ui)); }
  get login() { return (this.created.login ??= new LoginPage(this.ui)); }
  get trades() { return (this.created.trades ??= new TradesPage(this.ui)); }
  get newTrade() { return (this.created.newTrade ??= new NewTradePage(this.ui)); }
  get tradeDetail() { return (this.created.tradeDetail ??= new TradeDetailPage(this.ui)); }
  get tradesApi() { return (this.created.tradesApi ??= new TradesApi(this.ui)); }
}
