import type { TargetIn, UI, Val } from '../ui';
import { element, INNER_INPUT } from '../elements';
import { Combobox } from './combobox';
import { ConfirmDialog } from './confirm-dialog';
import { RiskCalculation } from '../risk-engine';

/**
 * The dialog of a lifecycle event on a trade (the E2E project's dynamic_action_component.snippet): early and
 * partial termination, novation remaining, step out, portfolio reassignment ... Which fields it shows depends on
 * the event. expectVisible / expectHidden / confirm are those of every confirmation dialog.
 */
export class DynamicAction extends ConfirmDialog {
  /**
   * The text fields of the dialog: name -> element. One operation types into any of them (typeField). The names
   * follow the E2E project's snippets; the unwind fee amount is typed into the same control as the amount there.
   */
  static readonly fields = {
    amount: { element: 'dynamic_action.amount_input' },
    currency: { element: 'dynamic_action.et_ccy_input' },
    settleDate: { element: 'dynamic_action.et_settle_date_input' },
    effectiveDate: { element: 'dynamic_action.effective_date_input' },
    novationRemainingTargetAmount: { element: 'dynamic_action.nr_new_target_amount_input' },
    novationRemainingDelta: { element: 'dynamic_action.delta_input' },
    newNotional: { element: 'dynamic_action.pt_new_notional_input' },
    unwindFeeAmount: { element: 'dynamic_action.amount_input' },
    remainingNotional: { element: 'dynamic_action.remaining_notional_input' },
    novationDate: { element: 'dynamic_action.novation_date_input' },
  } as const;

  constructor(ui: UI) {
    super(ui, element('dynamic_action.dialog'), element('dynamic_action.confirm_btn'));
  }

  /** An entry of an open dropdown */
  protected option(name: Val): TargetIn {
    return { role: 'menuitem', name, exact: true };
  }

  /** Types into one text field of the dialog. A date field is typed into like any other, as the E2E project does */
  async typeField(name: DynamicActionField, value: Val) {
    await this.ui.fill(element(DynamicAction.fields[name].element, { inner: INNER_INPUT }), value);
  }

  async selectPortfolio(value: Val) {
    await new Combobox(this.ui, element('dynamic_action.portfolio_select', { inner: 'input' })).select(value);
  }

  async selectCounterparty(value: Val) {
    await new Combobox(this.ui, element('dynamic_action.counterparty_select', { inner: 'input' })).select(value);
  }

  /** The direction is a plain dropdown: nothing is typed, it is opened with a click */
  async openDirection() {
    await this.ui.click(element('dynamic_action.et_direction_select'));
  }

  async chooseOption(value: Val) {
    await this.ui.click(this.option(value));
  }

  /**
   * Confirm the event's form and wait for the risk calculation it triggers (the E2E project's "confirm dynamic
   * action form using configured risk engine mode"); the trade change confirmation opens with its result
   */
  async confirmAndAwaitRisk(tradeId: string) {
    await this.ui.clickAndAwait(this.confirmBtn, RiskCalculation.forTrade(tradeId));
  }

  /** The line that shows how the result of the event is calculated */
  async expectEquationContains(text: Val) {
    await this.ui.expectText(element('dynamic_action.equation_line'), text);
  }
}

export type DynamicActionField = keyof typeof DynamicAction.fields;
