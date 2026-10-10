import type { TargetIn, Val } from '../ui';
import { element, INNER_INPUT } from '../elements';
import { RiskCalculation } from '../risk-engine';
import { CheckerAction } from '../components/checker-action';
import { TradeChangeConfirmation } from '../components/trade-change-confirmation';
import { BasePage } from './base.page';

export type TradesButton = keyof typeof TradesPage.buttons;
export type TradesFilter = keyof typeof TradesPage.filters;
export type BlotterView = keyof typeof TradesPage.views;
export type RowAction = keyof typeof TradesPage.rowActions;

/** Trades page (the trade portal): the landing page after login, with the search box and the blotters */
export class TradesPage extends BasePage {
  static readonly path = '/trades';
  /**
   * What the blotter shows in a trade's row. PARV, LIVE and DEAD are the E2E project's; DRFT (a draft, what a
   * rejected new trade goes back to) was stated by the user.
   */
  static readonly status = { pendingApproval: 'PARV', live: 'LIVE', dead: 'DEAD', draft: 'DRFT' };
  static readonly eventStatus = { cancelled: 'Cancelled', new: 'New' };

  // The tables below follow the E2E project's trade_portal_page.snippet. Their elements are looked up when an
  // operation uses them, not when the page is created: a case needs only the elements it really works on.

  /** The buttons of the page, clicked with clickButton(name) */
  static readonly buttons = {
    tradesTab: { element: 'trade_portal.nav_trades_tab' },
    newTrade: { element: 'trade_portal.new_trade_btn' },
    refresh: { element: 'trade_portal.refresh_btn' },
    createBlotter: { element: 'trade_portal.create_blotter_btn' },
    newTodayBlotter: { element: 'trade_portal.filter_all_btn' },
    validationBlotter: { element: 'trade_portal.filter_live_btn' },
    pendingApprovalBlotter: { element: 'trade_portal.filter_pending_btn' },
    closeNewTodayBlotter: { element: 'trade_portal.blotter_view_all_close_btn' },
    notifications: { element: 'trade_portal.notification_btn' },
    bulkApprove: { element: 'trade_portal.row_bulk_action_approve' },
  } as const;

  /** The dropdowns that filter the blotter: openFilter(name), then chooseOption(value) */
  static readonly filters = {
    productType: { element: 'trade_portal.type_filter_select' },
    tradeStatus: { element: 'trade_portal.status_filter_select' },
    eventStatus: { element: 'trade_portal.event_status_filter_select' },
  } as const;

  /** The blotter views: expectViewVisible(name) / expectViewHidden(name) */
  static readonly views = {
    newToday: { element: 'trade_portal.blotter_view_all' },
    validation: { element: 'trade_portal.blotter_view_live' },
    pendingApproval: { element: 'trade_portal.blotter_view_pending_approval' },
  } as const;

  /**
   * The entries of a row's action menu (the checker's Approve / Reject are in checkerAction). lifecycle marks the
   * events the E2E project checks together as "lifecycle event actions"; see lifecycleActions.
   */
  static readonly rowActions = {
    viewDetails: { element: 'trade_portal.row_action_view_details' },
    cancel: { element: 'trade_portal.row_action_cancel' },
    allocation: { element: 'trade_portal.row_action_allocation', lifecycle: true },
    novationRemaining: { element: 'trade_portal.row_action_novationremaining', lifecycle: true },
    partialNovationRemaining: { element: 'trade_portal.row_action_partialnovationremaining', lifecycle: true },
    portfolioReassignment: { element: 'trade_portal.row_action_portfolioreassignment', lifecycle: true },
    earlyTermination: { element: 'trade_portal.row_action_earlytermination', lifecycle: true },
    partialTermination: { element: 'trade_portal.row_action_partialtermination', lifecycle: true },
    stepOutFull: { element: 'trade_portal.row_action_stepoutfull', lifecycle: true },
    stepOutPartial: { element: 'trade_portal.row_action_stepoutpartial', lifecycle: true },
  } as const;

  /** The eight lifecycle events of the action menu, for a flow that checks each of them */
  static readonly lifecycleActions = (Object.keys(TradesPage.rowActions) as RowAction[])
    .filter((name) => 'lifecycle' in TradesPage.rowActions[name]);

  // The search box is a web component: the real control is in its shadow root
  protected readonly searchInput = element('trade_portal.search_input', { inner: INNER_INPUT });
  protected readonly allTradesBlotter = element('trade_portal.all_trade_blotter');
  // An entry of a row's action menu
  protected readonly cancelAction = element('trade_portal.row_action_cancel');

  /** The dialog that an action on a trade (cancel, ...) opens */
  readonly confirmDialog = new TradeChangeConfirmation(this.ui);
  /** The checker's Approve / Reject entries of a row's action menu and the dialog that confirms the decision */
  readonly checkerAction = new CheckerAction(this.ui);

  /** The first row of the blotter that shows this trade ID: the rows are only told apart by their text */
  protected row(tradeId: Val): TargetIn {
    return { ...this.allTradesBlotter, inner: 'role=row', hasText: tradeId, nth: 0 };
  }

  async open() {
    await this.ui.goto(TradesPage.path);
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

  /** The action menu must be open */
  async expectCancelActionVisible() {
    await this.ui.expectVisible(this.cancelAction);
  }

  /** The cancel entry starts the risk calculation of the trade; the click is over once it is answered */
  async clickCancelAction(tradeId: string) {
    await this.ui.clickAndAwait(this.cancelAction, RiskCalculation.forTrade(tradeId));
  }

  /** The page itself is shown (after a login or a refresh) */
  async expectDisplayed() {
    await this.ui.expectVisible(element('trade_portal.container'));
  }

  async clickButton(name: TradesButton) {
    await this.ui.click(element(TradesPage.buttons[name].element));
  }

  async expectButtonVisible(name: TradesButton) {
    await this.ui.expectVisible(element(TradesPage.buttons[name].element));
  }

  /** Opens one of the filter dropdowns; the value is then picked with chooseOption */
  async openFilter(name: TradesFilter) {
    await this.ui.click(element(TradesPage.filters[name].element));
  }

  /** An entry of the dropdown that is open */
  async chooseOption(value: Val) {
    await this.ui.click({ role: 'menuitem', name: value, exact: true });
  }

  async expectViewVisible(name: BlotterView) {
    await this.ui.expectVisible(element(TradesPage.views[name].element));
  }

  async expectViewHidden(name: BlotterView) {
    await this.ui.expectHidden(element(TradesPage.views[name].element));
  }

  /** The action menu must be open */
  async expectRowActionVisible(name: RowAction) {
    await this.ui.expectVisible(element(TradesPage.rowActions[name].element));
  }

  /** The entry is not offered for this trade (or the menu is closed) */
  async expectRowActionHidden(name: RowAction) {
    await this.ui.expectHidden(element(TradesPage.rowActions[name].element));
  }

  /**
   * A plain click on an entry of the action menu, as in the E2E project's page snippets. The cancellation is
   * started with clickCancelAction, which also waits for the risk calculation the entry triggers.
   */
  async clickRowAction(name: RowAction) {
    await this.ui.click(element(TradesPage.rowActions[name].element));
  }

  async expectNotificationCenterVisible() {
    await this.ui.expectVisible(element('trade_portal.notification_center_container'));
  }

  async expectNotificationCenterContains(text: Val) {
    await this.ui.expectText(element('trade_portal.notification_center_container'), text);
  }

  /** The trade's row shows this text (e.g. a status) in one of its columns */
  async expectRowShows(tradeId: Val, text: Val) {
    await this.ui.expectText(this.row(tradeId), text);
  }
}
