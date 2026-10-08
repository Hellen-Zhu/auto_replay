import type { Target, Val } from '../ui';
import { BaseComponent } from './base.component';

/** The top bar shown on every page after login */
export class TopBar extends BaseComponent {
  protected readonly newTradeBtn: Target = { testId: 'layout-new-trade-btn' };
  protected readonly aiReaderBtn: Target = { testId: 'layout-ai-reader-btn' };
  protected readonly themeToggleBtn: Target = { testId: 'layout-theme-toggle-btn' };
  protected readonly userMenuBtn: Target = { testId: 'layout-user-menu-btn' };

  async expectVisible() {
    await this.ui.expectVisible(this.newTradeBtn);
  }

  async clickNewTrade() {
    await this.ui.click(this.newTradeBtn);
  }

  /** The user menu in the top-right corner shows the display name of the logged-in user */
  async expectCurrentUser(displayName: Val) {
    await this.ui.expectText(this.userMenuBtn, displayName);
  }
}
