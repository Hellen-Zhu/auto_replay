import type { AwaitedRequest, TargetIn, Val } from '../ui';
import { element, INNER_INPUT } from '../elements';
import { Combobox } from '../components/combobox';
import { ConfirmDialog } from '../components/confirm-dialog';
import { TradeChangeConfirmation } from '../components/trade-change-confirmation';
import { RiskCalculation } from '../risk-engine';
import { BasePage } from './base.page';

export type TradeDetailSection = keyof typeof TradeDetailPage.sections;
export type TradeDetailButton = keyof typeof TradeDetailPage.buttons;
export type TradeDetailValue = keyof typeof TradeDetailPage.values;
export type TradeDetailCombobox = keyof typeof TradeDetailPage.comboboxes;
export type ScheduleFixing = keyof typeof TradeDetailPage.scheduleFixings;
export type CheckerDecision = keyof typeof TradeDetailPage.checkerDecisions;

/**
 * Trade detail page (the E2E project's trade_detail_page.snippet). Apart from the header card, an element is
 * looked up when an operation uses it, not when the page is created.
 */
export class TradeDetailPage extends BasePage {
  /** The page of a trade is this path followed by its ID (TradeDetailSteps of the E2E project) */
  static readonly path = '/trade';

  /** Status badges shown on the header card (confirmed on the real system) */
  static readonly status = { pendingApproval: 'PARV' };

  /**
   * The request the checker's confirmation sends. The E2E project waits for any POST under /checker/tasks/; a
   * request is matched here by the end of its path, which is the decision (the task ID in between is not known to
   * the page object).
   */
  static readonly checkerDecisions = {
    approve: { url: '/approve', method: 'POST' },
    reject: { url: '/reject', method: 'POST' },
  } as const satisfies Record<string, AwaitedRequest>;

  /** The regions of the page: expectSectionVisible(name), expectSectionContains(name, text) */
  static readonly sections = {
    container: { element: 'trade_detail.container' },
    headerCard: { element: 'trade_detail.header_card' },
    basicInfoCard: { element: 'trade_detail.basic_info_card' },
    riskMetricsSection: { element: 'trade_detail.risk_metrics_section' },
    scheduleSection: { element: 'trade_detail.schedule_section' },
    historyEventsCard: { element: 'trade_detail.history_events_card' },
    auditTrailCard: { element: 'trade_detail.audit_trail_card' },
    instrumentSection: { element: 'trade_detail.instrument_section' },
    instrumentDetailsPanel: { element: 'trade_detail.instrument_details_panel' },
  } as const;

  /** The buttons of the page: clickButton(name) */
  static readonly buttons = {
    approve: { element: 'trade_detail.approve_btn' },
    reject: { element: 'trade_detail.reject_btn' },
    moreActions: { element: 'trade_detail.more_actions_btn' },
    cancel: { element: 'trade_detail.cancel_btn' },
    partialNovationRemaining: { element: 'trade_detail.partialnovationremaining_btn' },
  } as const;

  /** The fields whose value a case checks: expectValue(name, value) reads the real input inside the control */
  static readonly values = {
    notionalAmount: { element: 'trade_detail.basic_notional_amount' },
    dealDate: { element: 'trade_detail.deal_date_input' },
    portfolio: { element: 'trade_detail.portfolio_combobox' },
    counterparty: { element: 'trade_detail.counterparty_combobox' },
    tdBf: { element: 'trade_detail.trf_td_bf' },
  } as const;

  /** The comboboxes a case changes: select(name, value) */
  static readonly comboboxes = {
    counterparty: { element: 'trade_detail.counterparty_combobox' },
    portfolio: { element: 'trade_detail.portfolio_combobox' },
  } as const;

  /**
   * The first fixing of the schedule, which is laid out differently per product: expectScheduleFixing(name, text).
   * FX_PSCRIPT (FX_CO in the E2E project) has two fixing columns, FX_PSCRIPT_FSKO (FX_FSB there) and FX_TRF one.
   */
  static readonly scheduleFixings = {
    FX_TRF: { element: 'trade_detail.schedule_single_fixing_row_event_0_fixing' },
    FX_PSCRIPT_FSKO: { element: 'trade_detail.schedule_single_fixing_row_schedule_0_fixing' },
    FX_PSCRIPT_1: { element: 'trade_detail.schedule_multi_fixings_row_schedule_0_fixing_1' },
    FX_PSCRIPT_2: { element: 'trade_detail.schedule_multi_fixings_row_schedule_0_fixing_2' },
  } as const;

  protected readonly headerCard = element('trade_detail.header_card');

  /** The dialog that Approve or Reject opens for the checker; it closes once the decision is confirmed */
  get checkerDialog(): ConfirmDialog {
    return new ConfirmDialog(this.ui, element('trade_detail.confirm_checker_dialog'), element('trade_detail.checker_confirm_btn'));
  }

  /** The dialog that Amend opens, with the result of the risk calculation, a reason and comments */
  get changeConfirmation(): TradeChangeConfirmation {
    return new TradeChangeConfirmation(this.ui);
  }

  /** The dialog that Cancel opens. Its confirm button is not in the E2E project's snippets, so it has none here */
  protected get cancelDialogHeader(): TargetIn {
    return element('trade_detail.cancel_dialog', { inner: '[slot="header"]' });
  }

  /** Opens the page of that trade by its address. Pass the ID a booking returned: it is recorded as a variable */
  async open(tradeId: string) {
    await this.ui.goto(`${TradeDetailPage.path}/${tradeId}`);
  }

  /** Pass the ID returned by the booking; it is recorded as a variable, so a replay checks its own new trade */
  async expectTradeId(tradeId: Val) {
    await this.ui.expectText(this.headerCard, tradeId);
  }

  async expectStatus(status: Val) {
    await this.ui.expectText(this.headerCard, status);
  }

  /** The status in the badge itself, not anywhere on the header card */
  async expectStatusBadge(status: Val) {
    await this.ui.expectText(element('trade_detail.status_badge', { inner: 'sl-badge' }), status);
  }

  async expectSectionVisible(name: TradeDetailSection) {
    await this.ui.expectVisible(element(TradeDetailPage.sections[name].element));
  }

  async expectSectionContains(name: TradeDetailSection, text: Val) {
    await this.ui.expectText(element(TradeDetailPage.sections[name].element), text);
  }

  async clickButton(name: TradeDetailButton) {
    await this.ui.click(element(TradeDetailPage.buttons[name].element));
  }

  /**
   * Amend sends the changes made on the page to the risk calculation of the trade (mocked or real by the setting
   * riskEngine); the click is over once it is answered and the trade change confirmation opens
   */
  async clickAmend(tradeId: string) {
    await this.ui.clickAndAwait(element('trade_detail.amend_btn'), RiskCalculation.forTrade(tradeId));
  }

  /** Confirm the checker's dialog and wait until the system has answered the decision */
  async confirmCheckerDecision(decision: CheckerDecision) {
    await this.ui.clickAndAwait(element('trade_detail.checker_confirm_btn'), TradeDetailPage.checkerDecisions[decision]);
  }

  /** What a field holds; the E2E project reads the inner input of the control in the same way */
  async expectValue(name: TradeDetailValue, value: Val) {
    await this.ui.expectValue(element(TradeDetailPage.values[name].element, { inner: 'input' }), value);
  }

  async select(name: TradeDetailCombobox, value: Val) {
    await new Combobox(this.ui, element(TradeDetailPage.comboboxes[name].element, { inner: 'input' })).select(value);
  }

  async expectScheduleFixing(name: ScheduleFixing, text: Val) {
    await this.ui.expectText(element(TradeDetailPage.scheduleFixings[name].element), text);
  }

  /** Whether a button can be pressed is a property of the real button inside the web component */
  async expectSaveDisabled() {
    await this.ui.expectDisabled(element('trade_detail.save_btn', { inner: 'button' }));
  }

  async expectCancelDialogVisible() {
    await this.ui.expectVisible(this.cancelDialogHeader);
  }

  async expectCancelDialogHidden() {
    await this.ui.expectHidden(this.cancelDialogHeader);
  }

  /** Opens the reason dropdown of the cancel dialog; the reason is then picked with chooseOption */
  async openCancelReason() {
    await this.ui.click(element('trade_detail.cancel_reason_select'));
  }

  /** An entry of the dropdown that is open */
  async chooseOption(value: Val) {
    await this.ui.click({ role: 'menuitem', name: value, exact: true });
  }

  async typeCancelComments(text: Val) {
    await this.ui.fill(element('trade_detail.cancel_comments_textarea', { inner: INNER_INPUT }), text);
  }
}
