import type { Val } from '../ui';
import { element, INNER_INPUT } from '../elements';
import { BaseComponent } from './base.component';

/**
 * The allocation dialog of a trade (the E2E project's allocation_dialog_component.snippet): the trade is split into
 * subtrades, by a number of splits or by a percentage per subtrade.
 */
export class AllocationDialog extends BaseComponent {
  // Text fields are web components: the real control is in their shadow root
  protected readonly numberSplitInput = element('allocation_dialog.number_split_input', { inner: INNER_INPUT });
  protected readonly percentageInput = element('allocation_dialog.percentage_input', { inner: INNER_INPUT });
  protected readonly allocateBtn = element('allocation_dialog.allocate_btn');
  protected readonly addSubtradeBtn = element('allocation_dialog.add_subtrade_btn');
  // Whether a button can be pressed is a property of the real button inside the web component
  protected readonly addSubtradeInnerBtn = element('allocation_dialog.add_subtrade_btn', { inner: 'button' });
  protected readonly remainingValue = element('allocation_dialog.allocation_remaining_value');
  protected readonly totalPctValue = element('allocation_dialog.allocation_total_pct_value');

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
