import type { TargetIn, UI, Val } from '../ui';
import { element, INNER_INPUT } from '../elements';
import { ConfirmDialog } from './confirm-dialog';

/**
 * The confirmation dialog of a change to an existing trade (cancellation, ...): besides the confirm button it asks
 * for a reason and comments.
 */
export class TradeChangeConfirmation extends ConfirmDialog {
  protected readonly reasonSelect = element('trade_change_confirmation.reason_select');
  // The comments field is a web component (sc-text-input), not a plain textarea: the real control is in its shadow root
  protected readonly commentsTextarea = element('trade_change_confirmation.comments_textarea', { inner: INNER_INPUT });

  constructor(ui: UI) {
    super(ui, element('trade_change_confirmation.dialog'), element('trade_change_confirmation.confirm_btn'));
  }

  /** An entry of the open reason dropdown */
  protected option(name: Val): TargetIn {
    return { role: 'menuitem', name, exact: true };
  }

  /** Open the reason dropdown, then pick the entry */
  async selectReason(reason: Val) {
    await this.ui.click(this.reasonSelect);
    await this.ui.click(this.option(reason));
  }

  async typeComments(text: Val) {
    await this.ui.fill(this.commentsTextarea, text);
  }
}
