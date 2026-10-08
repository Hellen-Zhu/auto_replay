import { cfg } from '../ui';
import { BaseFlow, type Keyword } from './base.flow';

/** Logging in and the identity of the current user */
export class AuthFlow extends BaseFlow {
  /** Log in as a role; the account and password come from accounts.<role> in the local config.local.json */
  async login(role: string, keyword: Keyword = 'Given') {
    const { login } = this.app;
    await this.ui[keyword](`I log in as ${role}`, async () => {
      await login.open();
      await login.expectDialogVisible();
      await login.fillEmail(cfg(`accounts.${role}.email`));
      await login.fillPassword(cfg(`accounts.${role}.password`));
      await login.clickSignIn();
    });
  }

  /** The top bar shows accounts.<role>.displayName */
  async expectCurrentUser(role: string, keyword: Keyword = 'And') {
    await this.ui[keyword]('the top-right corner shows the current user', async () => {
      await this.app.topBar.expectCurrentUser(cfg(`accounts.${role}.displayName`));
    });
  }
}
