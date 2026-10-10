import type { AwaitedRequest, Capture, TargetIn, UI, Val } from '../ui';
import { element, INNER_INPUT } from '../elements';
import { ConfirmDialog } from './confirm-dialog';

/**
 * The confirmation dialog of a change to an existing trade (cancellation, ...): besides the confirm button it asks
 * for a reason and comments.
 */
export class TradeChangeConfirmation extends ConfirmDialog {
  /** The request that confirming an event on a trade sends; it always reaches the system, nothing is mocked */
  static readonly triggerEvent: AwaitedRequest = { url: '/trades/trigger-event', method: 'POST' };

  /** The request that confirming an amendment made on the trade detail page sends (TradeLifecycleEventSteps) */
  static readonly update = (tradeId: string): AwaitedRequest => ({ url: `/trades/${tradeId}/update`, method: 'POST' });

  /**
   * Where the answer of a partial novation names the trade it created. The E2E project reads
   * data.results[0].childTradeIds[0]; a field path here is separated by dots only.
   */
  static readonly newTradeOfPartialNovation: Capture = {
    url: '/trades/trigger-event',
    method: 'POST',
    field: 'data.results.0.childTradeIds.0',
    saveAs: 'newTradeId',
  };

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

  /** Confirm and wait until the system has answered the event (an answer other than 2xx fails the step) */
  async confirmAndAwait() {
    await this.ui.clickAndAwait(this.confirmBtn, TradeChangeConfirmation.triggerEvent);
  }

  /** Confirm an amendment and wait until the system has answered the update of that trade */
  async confirmAndAwaitUpdate(tradeId: string) {
    await this.ui.clickAndAwait(this.confirmBtn, TradeChangeConfirmation.update(tradeId));
  }
}
