import { NewTradePage, TradeDetailPage } from '../pages';
import { BaseFlow, type Keyword } from './base.flow';

export type TradeKind = 'normal' | 'stepinFull' | 'stepinPartial';

/** The data of one trade creation case: its row of testdata/trade-creation.json */
export interface TradeCreationData {
  counterpartyName: string;
  portfolioId: string;
  direction: string;
  /** StepIn trades only */
  oldCounterpartyName?: string;
}

/** The product's .dat file, shipped with the cases in data/ (same names as the E2E project's ProductDatFiles) */
export const datFile = (product: string) => `data/${product}.dat`;

/** Booking a new trade through the New Trade form */
export class TradeCreationFlow extends BaseFlow {
  /**
   * Maker creates a trade for a product, mirroring the E2E project's trade_creation snippets:
   * a normal trade, or a StepIn full / StepIn partial trade. The product (typed as the Product ID, and the name
   * of the dat file) and the kind decide the scenario; the data is recorded as case data (${param:name}), which the PO can change for a run.
   * Ends when the booking is confirmed and returns the new trade ID (recorded as ${var:createdTradeId});
   * the outcome is asserted by the case, e.g. with expectPendingApproval(tradeId).
   */
  async createTrade(product: string, kind: TradeKind, data: TradeCreationData): Promise<string> {
    const { ui } = this;
    const { topBar, newTrade } = this.app;
    const p = this.params(data);
    const selectBasicInfo = () =>
      ui.And('I select the basic mandatory info', async () => {
        await newTrade.counterparty.select(p.counterpartyName);
        await newTrade.portfolio.select(p.portfolioId);
        await newTrade.productId.select(product); // the product type is what is typed as the Product ID
        await newTrade.direction.select(p.direction);
      });
    const uploadDat = () => ui.And(`I upload the ${product} dat file`, () => newTrade.uploadDat(datFile(product)));

    await ui.When('I open the New Trade form', async () => {
      await topBar.clickNewTrade();
      await newTrade.expectOpen();
    });

    if (kind === 'normal') {
      await selectBasicInfo();
      await uploadDat();
    } else {
      await uploadDat();
      await selectBasicInfo();
      const full = kind === 'stepinFull';
      await ui.And(`I enable StepIn ${full ? 'full' : 'partial'} and select the old counterparty`, async () => {
        await newTrade.toggleStepIn();
        await (full ? newTrade.chooseStepInFull() : newTrade.chooseStepInPartial());
        await newTrade.oldCounterparty.select(p.oldCounterpartyName);
      });
    }

    let tradeId = '';
    await ui.And('I book the trade and confirm', async () => {
      await newTrade.clickBook();
      await newTrade.confirmDialog.expectVisible();
      tradeId = await newTrade.confirmDialog.confirmAndCapture({ ...NewTradePage.createApi, saveAs: 'createdTradeId' });
    });
    return tradeId;
  }

  /** The trade detail page shows the trade that was just booked, with pending approval status */
  async expectPendingApproval(tradeId: string, keyword: Keyword = 'Then') {
    const { tradeDetail } = this.app;
    await this.ui[keyword]('the trade is created with pending approval status', async () => {
      await tradeDetail.expectTradeId(tradeId); // recorded as ${var:createdTradeId}
      await tradeDetail.expectStatus(TradeDetailPage.status.pendingApproval);
    });
  }
}
