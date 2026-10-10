import { TradesPage } from '../pages';
import { BaseFlow, type Keyword } from './base.flow';

/**
 * The trade detail page of one trade; mirrors the E2E project's trade_detail.snippet. The checker's decision made
 * there is the same decision as flows.tradeApproval makes from the trade portal, and its success toast is asserted
 * with flows.tradeApproval.expectApproved / expectRejected. The status checks read the page that is open: they
 * follow an approve / reject / open of this flow.
 */
export class TradeDetailFlow extends BaseFlow {
  /**
   * Opens the trade details of the trade. The E2E project searches for the trade in the trade portal and
   * double-clicks its row; the case format has no double-click, so the page is opened by its address.
   */
  async open(tradeId: string, keyword: Keyword = 'When') {
    const { tradeDetail } = this.app;
    await this.ui[keyword]('I open the trade details of the trade', async () => {
      await tradeDetail.open(tradeId);
      await tradeDetail.expectSectionVisible('container');
    });
  }

  /** Checker approves the pending trade from its trade detail page */
  async approve(tradeId: string) {
    const { tradeDetail } = this.app;
    await this.open(tradeId);
    await this.ui.And('I click Approve', () => tradeDetail.clickButton('approve'));
    await this.ui.And('I confirm the approval', () => tradeDetail.checkerDialog.confirm());
  }

  /** Checker rejects the pending trade from its trade detail page */
  async reject(tradeId: string) {
    const { tradeDetail } = this.app;
    await this.open(tradeId);
    await this.ui.And('I click Reject', () => tradeDetail.clickButton('reject'));
    await this.ui.And('I confirm the rejection', () => tradeDetail.checkerDialog.confirm());
  }

  /** Every part of the trade details is shown */
  async expectCorrectInfo(keyword: Keyword = 'Then') {
    const { tradeDetail } = this.app;
    await this.ui[keyword]('I see every section of the trade details', async () => {
      await tradeDetail.expectSectionVisible('basicInfoCard');
      await tradeDetail.expectSectionVisible('riskMetricsSection');
      await tradeDetail.expectSectionVisible('instrumentSection');
      await tradeDetail.expectSectionVisible('scheduleSection');
      await tradeDetail.expectSectionVisible('historyEventsCard');
      await tradeDetail.expectSectionVisible('auditTrailCard');
    });
  }

  /** The trade is waiting for the checker's decision */
  async expectPendingApproval(keyword: Keyword = 'Then') {
    await this.expectStatusBadge(TradesPage.status.pendingApproval, keyword);
  }

  /** The trade is live */
  async expectLive(keyword: Keyword = 'Then') {
    await this.expectStatusBadge(TradesPage.status.live, keyword);
  }

  /** The trade is a draft again */
  async expectDraft(keyword: Keyword = 'Then') {
    await this.expectStatusBadge(TradesPage.status.draft, keyword);
  }

  private async expectStatusBadge(status: string, keyword: Keyword) {
    await this.ui[keyword](`its status badge shows ${status}`, () => this.app.tradeDetail.expectStatusBadge(status));
  }
}
