import type { TargetIn, Val } from '../ui';
import { BaseComponent } from './base.component';

/**
 * The toast notification that pops up after an action and disappears by itself after a few seconds.
 * It has no testid: the E2E project (ToastSteps) reads its title from the element with the attribute data-title
 * and its message from the one with data-description, so the same attributes are used here.
 */
export class Toast extends BaseComponent {
  /** The messages the cases check */
  static readonly message = {
    cancellationCompleted: 'Cancellation completed successfully',
    earlyTerminationCompleted: 'EarlyTermination completed successfully',
    /**
     * The fixed part of "Trade <ID> has been allocated into <n> sub-trade(s).", the E2E project's toastMessage of
     * its allocation test data, where the trade ID is a wildcard
     */
    allocatedInto: (subTrades: number) => `has been allocated into ${subTrades} sub-trade(s).`,
  };
  /** The titles the cases check */
  static readonly title = {
    tradeApproved: 'Trade approved successfully',
    tradeRejected: 'Trade rejected successfully',
  };

  /** The toast that shows this message; several toasts can be on screen at once */
  protected withMessage(message: Val): TargetIn {
    return { css: '[data-description]', hasText: message, nth: 0 };
  }

  /** The toast that shows this title */
  protected withTitle(title: Val): TargetIn {
    return { css: '[data-title]', hasText: title, nth: 0 };
  }

  async expectMessage(message: Val) {
    await this.ui.expectVisible(this.withMessage(message));
  }

  async expectTitle(title: Val) {
    await this.ui.expectVisible(this.withTitle(title));
  }
}
