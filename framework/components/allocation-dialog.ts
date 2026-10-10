import type { Target, TargetIn, Val } from '../ui';
import { element, INNER_INPUT } from '../elements';
import { BaseComponent } from './base.component';

/**
 * The allocation dialog of a trade (the E2E project's allocation_dialog_component.snippet): the trade is split into
 * subtrades, by a number of splits or by a percentage per subtrade.
 * The table of the subtrades has one row per subtrade; its controls have no element in the E2E project, whose
 * AllocationSteps finds them by row inside the dialog and by these testids.
 */
export class AllocationDialog extends BaseComponent {
  /** What the dialog shows once the whole trade is allocated (the texts of the E2E project's allocation snippets) */
  static readonly text = { nothingRemaining: '0.00 USD', fullyAllocated: 'Total: 100.00% \u2713' };

  protected static readonly subTradeCounterparty = "[data-testid='allocation-sub-trade-counterparty-select']";
  protected static readonly subTradePercentage = "[data-testid='allocation-sub-trade-percentage-input']";

  // Text fields are web components: the real control is in their shadow root
  protected readonly numberSplitInput = element('allocation_dialog.number_split_input', { inner: INNER_INPUT });
  protected readonly percentageInput = element('allocation_dialog.percentage_input', { inner: INNER_INPUT });
  protected readonly allocateBtn = element('allocation_dialog.allocate_btn');
  protected readonly addSubtradeBtn = element('allocation_dialog.add_subtrade_btn');
  // Whether a button can be pressed is a property of the real button inside the web component
  protected readonly addSubtradeInnerBtn = element('allocation_dialog.add_subtrade_btn', { inner: 'button' });
  protected readonly remainingValue = element('allocation_dialog.allocation_remaining_value');
  protected readonly totalPctValue = element('allocation_dialog.allocation_total_pct_value');

  /** A control in the row of one subtrade; index 0 is the first row. The table is inside the dynamic action dialog */
  protected inSubTrade(index: number, control: string): Target {
    return element('dynamic_action.dialog', { inner: `tbody tr >> nth=${index} >> ${control}` });
  }

  /** An entry of an open dropdown */
  protected option(name: Val): TargetIn {
    return { role: 'menuitem', name, exact: true };
  }

  /** Opens the counterparty dropdown of a subtrade; the counterparty is then picked with chooseOption */
  async openSubTradeCounterparty(index: number) {
    await this.ui.click(this.inSubTrade(index, AllocationDialog.subTradeCounterparty));
  }

  async chooseOption(value: Val) {
    await this.ui.click(this.option(value));
  }

  async typeSubTradePercentage(index: number, value: Val) {
    await this.ui.fill(this.inSubTrade(index, `${AllocationDialog.subTradePercentage} >> ${INNER_INPUT}`), value);
  }

  async typeSplitNumber(value: Val) {
    await this.ui.fill(this.numberSplitInput, value);
  }

  async typePercentage(value: Val) {
    await this.ui.fill(this.percentageInput, value);
  }

  async clickAllocate() {
    await this.ui.click(this.allocateBtn);
  }

  async clickAddSubtrade() {
    await this.ui.click(this.addSubtradeBtn);
  }

  /** What is left to allocate: the whole text, not a part of it */
  async expectRemaining(value: Val) {
    await this.ui.expectText(this.remainingValue, value, { exact: true });
  }

  /** The total of the allocated percentages: the whole text, not a part of it */
  async expectTotalPct(value: Val) {
    await this.ui.expectText(this.totalPctValue, value, { exact: true });
  }

  async expectAddSubtradeEnabled() {
    await this.ui.expectEnabled(this.addSubtradeInnerBtn);
  }

  async expectAddSubtradeDisabled() {
    await this.ui.expectDisabled(this.addSubtradeInnerBtn);
  }
}
