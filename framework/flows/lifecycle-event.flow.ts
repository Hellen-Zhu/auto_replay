import type { RowAction } from '../pages/trades.page';
import { BaseFlow } from './base.flow';
import { TradesFlow } from './trades.flow';

/**
 * What the lifecycle events started from a row's action menu share (the E2E project's lifecycle_event.snippet):
 * opening the event's dialog and submitting it. The flow of an event fills the dialog in between.
 */
export class LifecycleEventFlow extends BaseFlow {
  private readonly tradesFlow = new TradesFlow(this.app);

  /** Search for the trade, open its action menu and choose the event: its dialog is open afterwards */
  async openAction(tradeId: string, action: RowAction, label: string) {
    const { trades, dynamicAction } = this.app;
    await this.tradesFlow.openActionMenu(tradeId);
    await this.ui.And(`I choose ${label} from the action menu`, async () => {
      await trades.expectRowActionVisible(action);
      await trades.clickRowAction(action);
      await dynamicAction.expectVisible();
    });
  }

  /**
   * Confirm the event's dialog, which starts the risk calculation (mocked or real by the setting riskEngine), then
   * confirm the trade change. The E2E project's last step, "confirm lifecycle event trade change and wait for page
   * ready", is a Java step whose code was not seen: here it is a click that waits for the trigger-event answer.
   */
  async submit(tradeId: string) {
    const { trades, dynamicAction } = this.app;
    await this.ui.And('I confirm the event', async () => {
      await dynamicAction.confirmAndAwaitRisk(tradeId);
      await trades.confirmDialog.expectVisible();
    });
    await this.ui.And('I confirm the trade change', () => trades.confirmDialog.confirmAndAwait());
  }
}

