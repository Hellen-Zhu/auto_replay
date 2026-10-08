import { cfg, type Target, type Val } from '../ui';
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
    await this.ui.expectVisible(this.dialog);
  }

  async signIn(email: Val, password: Val) {
    await this.ui.fill(this.email, email);
    await this.ui.fill(this.password, password, { secret: true });
    await this.ui.click(this.signInBtn);
  }

  /** Open the page and sign in with accounts.<role> of the local config.local.json */
  async loginAs(role: string) {
    await this.open();
    await this.signIn(cfg(`accounts.${role}.email`), cfg(`accounts.${role}.password`));
  }
}
