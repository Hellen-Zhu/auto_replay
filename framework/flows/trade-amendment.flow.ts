import { TradesPage } from '../pages';
import { BaseFlow, type Keyword } from './base.flow';
import { TradeDetailFlow } from './trade-detail.flow';
import { TradesFlow } from './trades.flow';

/** The data of an amendment (testdata/trade-amendment.json) */
export interface TradeAmendmentData {
  /** The reason chosen in the trade change confirmation */
  amendmentReason: string;
  /** Amendment of the counterparty */
  newCounterpartyName: string;
  /** Amendment of the risk portfolio */
  newPortfolio: string;
  /** The portfolio the trade was created with, which it shows again after a rejected amendment */
  originalPortfolio: string;
}

/**
 * Amending a live trade on its trade detail page, mirroring the E2E project's trade_amendment snippet. The maker
 * changes a field and submits; the amendment then waits for the checker (flows.tradeApproval from the trade
 * portal, flows.tradeDetail from the trade detail page). The outcome is asserted by the case with the expect...
 * flows.
 */
export class TradeAmendmentFlow extends BaseFlow {
  private readonly tradesFlow = new TradesFlow(this.app);
  private readonly tradeDetail = new TradeDetailFlow(this.app);

  /** Maker changes the counterparty of the trade and submits the amendment */
  async amendCounterparty(tradeId: string, data: TradeAmendmentData) {
    const p = this.params(data);
    await this.tradeDetail.open(tradeId);
    await this.ui.And('I select the new counterparty', () => this.app.tradeDetail.select('counterparty', p.newCounterpartyName));
    await this.submit(tradeId, data);
  }

  /** Maker changes the risk portfolio of the trade and submits the amendment */
  async amendRiskPortfolio(tradeId: string, data: TradeAmendmentData) {
    const p = this.params(data);
    await this.tradeDetail.open(tradeId);
    await this.ui.And('I select the new risk portfolio', () => this.app.tradeDetail.select('portfolio', p.newPortfolio));
    await this.submit(tradeId, data);
  }

  /**
   * The E2E project's "submits amendment change and waits for trade update": Amend starts the risk calculation
   * (mocked or real by the setting riskEngine), the trade change confirmation asks for a reason, and confirming it
   * waits for the update of the trade, after which the dialog closes.
   */
  private async submit(tradeId: string, data: TradeAmendmentData) {
    const p = this.params(data);
    const { tradeDetail } = this.app;
    await this.ui.And('I click Amend', async () => {
      await tradeDetail.clickAmend(tradeId);
      await tradeDetail.changeConfirmation.expectVisible();
    });
    await this.ui.And('I select the reason of the change', () => tradeDetail.changeConfirmation.selectReason(p.amendmentReason));
    await this.ui.And('I confirm the trade change', async () => {
      await tradeDetail.changeConfirmation.confirmAndAwaitUpdate(tradeId);
      await tradeDetail.changeConfirmation.expectHidden();
    });
  }

  /** In the blotter the trade is still live, with the event status Amended */
  async expectLiveAndAmended(tradeId: string, keyword: Keyword = 'Then') {
    await this.tradesFlow.expectStatusInBlotter(tradeId, TradesPage.status.live, TradesPage.eventStatus.amended, keyword);
  }

  /**
   * The trade details show the new counterparty. The E2E project gets to the trade details with a double-click on
   * the trade's row; here the page is opened by its address.
   */
  async expectAmendedCounterparty(tradeId: string, data: TradeAmendmentData, keyword: Keyword = 'Then') {
    const p = this.params(data);
    await this.tradeDetail.open(tradeId, keyword);
    await this.ui.And('its counterparty is the new counterparty', () => this.app.tradeDetail.expectValue('counterparty', p.newCounterpartyName));
  }

  /** The trade detail page that is open shows the portfolio the trade had before the amendment */
  async expectOriginalRiskPortfolio(data: TradeAmendmentData, keyword: Keyword = 'Then') {
    const p = this.params(data);
    await this.ui[keyword]('its risk portfolio is the original portfolio', () => this.app.tradeDetail.expectValue('portfolio', p.originalPortfolio));
  }
}
