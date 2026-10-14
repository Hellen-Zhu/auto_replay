import { BaseApi } from './base.api';
import type { ApiRequest } from './trades.api';

/**
 * The preferences a user keeps in the system: theme, number and date format and the blotters the trade portal shows.
 * They belong to the account, not to the browser, so whoever logged in with a shared account before a case may have
 * changed them; a case that looks for a trade in the New Today blotter then finds no such blotter.
 */
export class UserPreferencesApi extends BaseApi {
  /**
   * The preferences every case starts from: the request of the E2E project's test data
   * SETUP-USER-PREFERENCE-CONFIG-DEFAULTS, which its hook resetUserPreferenceDefaults sends before every scenario
   */
  static readonly defaults = {
    theme: 'light',
    numberFormat: 'en-US',
    dateFormat: 'MM/DD/YYYY',
    activeBlotters: ['BLT-DEFAULT-NEW-TODAY'],
  };

  /**
   * PUT /uc/api/user-preferences, as that hook sends it. The path is not under the prefix apiBaseUrl ends with
   * (/api/v1), so it is joined to the server of apiBaseUrl; that this server also serves /uc/api is inferred (the
   * hook sends it with the same helper as the trade requests), not seen on the real system.
   */
  static readonly reset: ApiRequest = { method: 'PUT', path: '/uc/api/user-preferences', base: 'origin', body: UserPreferencesApi.defaults };

  /** Set that user's preferences back to the defaults */
  async resetToDefaults(role: string) {
    await this.ui.api({ ...UserPreferencesApi.reset, headers: this.as(role) });
  }
}
