import { BasePage } from './base.page';

/** Trades page: the landing page after login, with the blotters (Validation Blotter, Pending Approval, ...) */
export class TradesPage extends BasePage {
  static readonly path = '/trades';

  async expectOpen() {
    await this.ui.expectUrl(TradesPage.path);
  }
}
