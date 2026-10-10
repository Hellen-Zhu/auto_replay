import { element } from '../elements';
import { BaseComponent } from './base.component';

/**
 * What the checker decides on a trade that is pending approval: the Approve and Reject entries of the action menu
 * of the trade's row, and the confirm button of the dialog that either of them opens.
 */
export class CheckerAction extends BaseComponent {
  protected readonly approveBtn = element('checker_action.approve_btn');
  protected readonly rejectBtn = element('checker_action.reject_btn');
  protected readonly confirmBtn = element('checker_action.confirm_btn');

  /** The action menu must be open */
  async expectApproveVisible() {
    await this.ui.expectVisible(this.approveBtn);
  }

  async clickApprove() {
    await this.ui.click(this.approveBtn);
  }

  /** The action menu must be open */
  async expectRejectVisible() {
    await this.ui.expectVisible(this.rejectBtn);
  }

  async clickReject() {
    await this.ui.click(this.rejectBtn);
  }

  /** The entry is not offered: the menu is closed, or the user may not decide on this trade */
  async expectApproveHidden() {
    await this.ui.expectHidden(this.approveBtn);
  }

  async expectRejectHidden() {
    await this.ui.expectHidden(this.rejectBtn);
  }

  /** Confirms the approval or the rejection, whichever was chosen */
  async confirm() {
    await this.ui.click(this.confirmBtn);
  }

  /**
   * The confirmation dialog is closed again, as the E2E project waits for after confirming. Checked on the element
   * itself, as that project does; the approval flows do not call it, they go on with the toast of the decision.
   */
  async expectDialogHidden() {
    await this.ui.expectHidden(element('checker_action.dialog'));
  }
}
