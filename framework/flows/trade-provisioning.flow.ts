import type { TradeUdf } from '../api';
import { datFile } from '../products';
import { BaseFlow, type Keyword } from './base.flow';

/**
 * The data of a trade that is created through the API: the "basic" block of the request, without the product.
 * Text values are case data the PO can change for a run; premiumAmount is a number in the request and is recorded as it is.
 */
export interface TradeProvisioningData {
  counterpartyFmId: string;
  counterpartyName: string;
  portfolioId: string;
  direction: string;
  premiumAmount: number;
  premiumCurrency: string;
}

/** What a StepIn trade created through the API needs on top: the values of the request's "udf" list */
export interface StepInProvisioningData {
  oldCounterpartyName: string;
  oldCounterpartyFmId: string;
  novationDate: string;
}

/** The value of the udf "stepInType" */
export type StepInType = 'StepInFull' | 'StepInPartial';

/**
 * Trades that a case needs to exist before it starts, created through the API instead of the pages
 * (TradeProvisioningSteps of the E2E project). The calls are recorded like any other step, so a replay creates
 * its own trade; they need apiBaseUrl in the local config.
 */
export class TradeProvisioningFlow extends BaseFlow {
  /**
   * A live trade of that product: the maker submits it, the checker approves it.
   * Returns the trade ID (recorded as ${var:createdTradeId}).
   */
  async provisionLiveTrade(product: string, data: TradeProvisioningData, keyword: Keyword = 'Given'): Promise<string> {
    const { tradeId, taskId } = await this.submit(`I submit a new ${product} trade through the API as maker`, product, data, keyword);
    await this.ui.And('I approve the trade through the API as checker', () => this.app.tradesApi.approveTask('checker', taskId));
    return tradeId;
  }

  /** A trade of that product that is pending approval: the maker submits it, nobody decides. Returns the trade ID */
  async provisionPendingTrade(product: string, data: TradeProvisioningData, keyword: Keyword = 'Given'): Promise<string> {
    return (await this.submit(`I submit a new ${product} trade through the API as maker`, product, data, keyword)).tradeId;
  }

  /** A StepIn full or partial trade of that product that is pending approval. Returns the trade ID */
  async provisionPendingStepInTrade(product: string, type: StepInType, data: TradeProvisioningData & StepInProvisioningData, keyword: Keyword = 'Given'): Promise<string> {
    const p = this.params(data);
    const udf: TradeUdf[] = [
      { key: 'stepInType', value: type, type: 'Text' },
      { key: 'oldCptyName', value: p.oldCounterpartyName, type: 'Text' },
      { key: 'oldCptyFmId', value: p.oldCounterpartyFmId, type: 'Text' },
      { key: 'novationDate', value: p.novationDate, type: 'Date' },
    ];
    const kind = type === 'StepInFull' ? 'StepIn full' : 'StepIn partial';
    return (await this.submit(`I submit a new ${product} ${kind} trade through the API as maker`, product, data, keyword, udf)).tradeId;
  }

  private submit(text: string, product: string, data: TradeProvisioningData, keyword: Keyword, udf?: TradeUdf[]) {
    const p = this.params(data);
    return this.ui[keyword](text, () =>
      this.app.tradesApi.submitTrade(
        'maker',
        {
          counterpartyFmId: p.counterpartyFmId,
          counterpartyName: p.counterpartyName,
          portfolioId: p.portfolioId,
          productId: product,
          direction: p.direction,
          premiumAmount: data.premiumAmount,
          premiumCurrency: p.premiumCurrency,
          ...(udf ? { udf } : {}),
        },
        datFile(product),
      ),
    );
  }
}
