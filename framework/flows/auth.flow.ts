import { cfg } from '../ui';
import { BaseFlow, type Keyword } from './base.flow';

/** Logging in and the identity of the current user */
export class AuthFlow extends BaseFlow {
  /**
   * Log in as a role; the account and password come from accounts.<role> in the local config.local.json.
   * Before the login the account's preferences are set back to the defaults through the API, as the E2E project's
   * hook does before every scenario: the account is shared, and someone who changed which blotters the trade portal
   * shows would make the case fail to find its trade. Only the role that logs in is reset (a case logs in once).
   */
  async login(role: string, keyword: Keyword = 'Given') {
    const { login, userPreferencesApi } = this.app;
    await this.ui[keyword](`my preferences as ${role} are reset to the defaults`, () => userPreferencesApi.resetToDefaults(role));
    await this.ui.And(`I log in as ${role}`, async () => {
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
