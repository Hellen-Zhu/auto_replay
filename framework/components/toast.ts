import type { TargetIn, Val } from '../ui';
import { BaseComponent } from './base.component';

/**
 * The toast notification that pops up after an action and disappears by itself after a few seconds.
 * It has no testid: the E2E project (ToastSteps) reads its message from the element with the attribute
 * data-description, so the same attribute is used here.
 */
export class Toast extends BaseComponent {
  /** The messages the cases check */
  static readonly message = {
    cancellationCompleted: 'Cancellation completed successfully',
  };

  /** The toast that shows this message; several toasts can be on screen at once */
  protected withMessage(message: Val): TargetIn {
    return { css: '[data-description]', hasText: message, nth: 0 };
  }

  async expectMessage(message: Val) {
    await this.ui.expectVisible(this.withMessage(message));
  }
}
