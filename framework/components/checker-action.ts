import { element } from '../elements';
import { BaseComponent } from './base.component';

/**
 * What the checker decides on a trade that is pending approval: the Approve and Reject entries of the action menu
 * of the trade's row, and the confirm button of the dialog that either of them opens.
 * The E2E project then waits until that dialog is hidden; there is no such check here, the case goes on with the
 * toast of the decision, which only appears once the dialog is done.
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

  /** Confirms the approval or the rejection, whichever was chosen */
  async confirm() {
    await this.ui.click(this.confirmBtn);
  }
}
