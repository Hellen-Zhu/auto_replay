import type { UI, Target, Capture } from '../ui';
import { BaseComponent } from './base.component';

/**
 * A confirmation dialog (sc-modal). The host itself is 0 x 0 (its panel is rendered by the shadow root), so it never
 * counts as visible; the slotted header is what the user actually sees (a plain h2 matches more than one element).
 */
export class ConfirmDialog extends BaseComponent {
  protected readonly header: Target;

  /** dialog is the host of the modal */
  constructor(ui: UI, dialog: Target, protected readonly confirmBtn: Target) {
    super(ui);
    this.header = { ...dialog, inner: '[slot="header"]' };
  }

  async expectVisible() {
    await this.ui.expectVisible(this.header);
  }

  /** The dialog is closed */
  async expectHidden() {
    await this.ui.expectHidden(this.header);
  }

  async confirm() {
    await this.ui.click(this.confirmBtn);
  }

  /** Confirm and read a value from the response it triggers (recorded as ${var:<saveAs>}) */
  async confirmAndCapture(capture: Capture): Promise<string> {
    return this.ui.clickAndCapture(this.confirmBtn, capture);
  }
}
