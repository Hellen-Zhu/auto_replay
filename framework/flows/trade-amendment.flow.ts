import { TradesPage } from '../pages';
import { BaseFlow, type Keyword } from './base.flow';
import { TradeDetailFlow } from './trade-detail.flow';
import { TradesFlow } from './trades.flow';

/** The fields an amendment case can change: case data the PO chooses in the runner (amendmentField) */
export const AMENDMENT_FIELDS = ['Counterparty', 'Risk Portfolio'] as const;
export type AmendmentField = (typeof AMENDMENT_FIELDS)[number];

/** The data of an amendment (shared.amendment of testdata/common.json) */
export interface TradeAmendmentData {
  /** The field the maker changes: one of AMENDMENT_FIELDS */
  amendmentField: string;
  /** The reason chosen in the trade change confirmation */
  amendmentReason: string;
  /** The new value when amendmentField is Counterparty */
  newCounterpartyName: string;
  /** The new value when amendmentField is Risk Portfolio */
  newPortfolio: string;
}

/**
 * Amending a live trade on its trade detail page, mirroring the E2E project's trade_amendment snippet. The maker
 * changes a field and submits; the amendment then waits for the checker (flows.tradeApproval from the trade
 * portal). The outcome is asserted by the case with the expect... flows.
 */
export class TradeAmendmentFlow extends BaseFlow {
  private readonly tradesFlow = new TradesFlow(this.app);
  private readonly tradeDetail = new TradeDetailFlow(this.app);

  /**
   * Maker changes the field named by the case data amendmentField and submits the amendment (explicit user
   * requirement: one case, the field is case data). The selection of every field is recorded, each run only when
   * amendmentField names it, so the PO can choose another field in the runner; its new value is case data too
   */
  async amend(tradeId: string, data: TradeAmendmentData) {
    const p = this.params(data);
    const field = p.amendmentField;
    const { tradeDetail } = this.app;
    await this.tradeDetail.open(tradeId);
    await this.ui.onlyWhen(field, AMENDMENT_FIELDS, ['Counterparty'], () =>
      this.ui.And('I select the new counterparty', () => tradeDetail.select('counterparty', p.newCounterpartyName)));
    await this.ui.onlyWhen(field, AMENDMENT_FIELDS, ['Risk Portfolio'], () =>
      this.ui.And('I select the new risk portfolio', () => tradeDetail.select('portfolio', p.newPortfolio)));
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

  /**
   * In the blotter the trade waits for the checker's decision on the amendment. Inferred: that a pending amendment
   * shows the status of a pending new trade or cancellation; its event status is not known and not checked.
   */
  async expectPendingCheckerApproval(tradeId: string, keyword: Keyword = 'Then') {
    await this.tradesFlow.expectPendingApproval(tradeId, keyword);
  }

  /** In the blotter the trade is still live, with the event status Amended */
  async expectLiveAndAmended(tradeId: string, keyword: Keyword = 'Then') {
    await this.tradesFlow.expectStatusInBlotter(tradeId, TradesPage.status.live, TradesPage.eventStatus.amended, keyword);
  }
}
