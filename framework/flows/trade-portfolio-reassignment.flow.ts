import { Toast } from '../components/toast';
import { TradesPage } from '../pages';
import { BaseFlow, type Keyword } from './base.flow';
import { LifecycleEventFlow } from './lifecycle-event.flow';
import { TradesFlow } from './trades.flow';

/** The data of a portfolio reassignment (testdata/trade-portfolio-reassignment.json) */
export interface TradePortfolioReassignmentData {
  newPortfolio: string;
  /** The portfolio as the trade details show it afterwards */
  expectedPortfolio: string;
}

/**
 * Moving a live trade to another portfolio from the trade portal, mirroring the E2E project's
 * trade_portfolio_reassignment and lifecycle_event snippets. No checker is involved. The outcome is asserted by
 * the case with the expect... flows.
 */
export class TradePortfolioReassignmentFlow extends BaseFlow {
  private readonly tradesFlow = new TradesFlow(this.app);
  private readonly lifecycleEvent = new LifecycleEventFlow(this.app);

  /** Maker reassigns the trade to the new portfolio, up to the confirmed trade change */
  async reassignPortfolio(tradeId: string, data: TradePortfolioReassignmentData) {
    const p = this.params(data);

    await this.lifecycleEvent.openAction(tradeId, 'portfolioReassignment', 'Portfolio Reassignment');
    await this.ui.And('I select the new portfolio', () => this.app.dynamicAction.selectPortfolio(p.newPortfolio));
    await this.lifecycleEvent.submit(tradeId);
  }

  /** The success toast of the portfolio reassignment is shown */
  async expectCompleted(keyword: Keyword = 'Then') {
    await this.ui[keyword]('I see the message that the portfolio reassignment is completed', () =>
      this.app.toast.expectMessage(Toast.message.portfolioReassignmentCompleted),
    );
  }

  /** In the blotter the trade is still live, with the event status Amended */
  async expectLiveAndAmended(tradeId: string, keyword: Keyword = 'Then') {
    await this.tradesFlow.expectStatusInBlotter(tradeId, TradesPage.status.live, TradesPage.eventStatus.amended, keyword);
  }

  /**
   * The trade details show the trade as live in the new portfolio. The E2E project gets to the trade details with
   * a double-click on the trade's row; here the page is opened by its address.
   */
  async expectUpdatedPortfolio(tradeId: string, data: TradePortfolioReassignmentData, keyword: Keyword = 'Then') {
    const p = this.params(data);
    const { tradeDetail } = this.app;
    await this.ui[keyword]('I open the trade details of the trade', async () => {
      await tradeDetail.open(tradeId);
      await tradeDetail.expectSectionVisible('container');
    });
    await this.ui.And(`its status badge shows ${TradesPage.status.live}`, () => tradeDetail.expectStatusBadge(TradesPage.status.live));
    await this.ui.And('its portfolio is the new portfolio', () => tradeDetail.expectValue('portfolio', p.expectedPortfolio));
  }
}
