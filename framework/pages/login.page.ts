import type { Target, Val } from '../ui';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  /** Path relative to baseUrl. Change it here if the real system's login page is not at the root */
  static readonly path = '/';

  protected readonly dialog: Target = { testId: 'login-dialog' };
  protected readonly email: Target = { testId: 'login-email-input', inner: 'input' };
  protected readonly password: Target = { testId: 'login-password-input', inner: 'input' };
  protected readonly signInBtn: Target = { testId: 'login-sign-in-to-portal-btn' };

  async open() {
    await this.ui.goto(LoginPage.path);
  }

  async expectDialogVisible() {
    await this.ui.expectVisible(this.dialog);
  }

  async fillEmail(email: Val) {
    await this.ui.fill(this.email, email);
  }

  async fillPassword(password: Val) {
    await this.ui.fill(this.password, password, { secret: true });
  }

  async clickSignIn() {
    await this.ui.click(this.signInBtn);
  }
}
