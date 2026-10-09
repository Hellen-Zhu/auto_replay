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
    const p = this.params(data);
    const { tradesApi } = this.app;

    const { tradeId, taskId } = await this.ui[keyword](`I submit a new ${product} trade through the API as maker`, () =>
      tradesApi.submitTrade(
        'maker',
        {
          counterpartyFmId: p.counterpartyFmId,
          counterpartyName: p.counterpartyName,
          portfolioId: p.portfolioId,
          productId: product,
          direction: p.direction,
          premiumAmount: data.premiumAmount,
          premiumCurrency: p.premiumCurrency,
        },
        datFile(product),
      ),
    );
    await this.ui.And('I approve the trade through the API as checker', () => tradesApi.approveTask('checker', taskId));
    return tradeId;
  }
}
