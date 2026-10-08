import type { Target, Val } from '../ui';
import { BasePage } from './base.page';

export class TradeDetailPage extends BasePage {
  /** Status badges shown on the header card (confirmed on the real system) */
  static readonly status = { pendingApproval: 'PARV' };

  protected readonly headerCard: Target = { testId: 'trade-detail-header-card' };

  /** Pass the ID returned by the booking; it is recorded as a variable, so a replay checks its own new trade */
  async expectTradeId(tradeId: Val) {
    await this.ui.expectText(this.headerCard, tradeId);
  }

  async expectStatus(status: Val) {
    await this.ui.expectText(this.headerCard, status);
  }
}
