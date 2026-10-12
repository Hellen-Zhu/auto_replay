import type { TradeUdf } from '../api';
import { datFile } from '../products';
import { BaseFlow, type Keyword } from './base.flow';

/** The value of the udf "stepInType" */
export type StepInType = 'StepInFull' | 'StepInPartial';

/** The kind of trade that is created: a normal one, or a StepIn full / partial one (which carries the "udf" list) */
export type TradeType = 'Normal' | StepInType;
const TRADE_TYPES: TradeType[] = ['Normal', 'StepInFull', 'StepInPartial'];

/** What a StepIn trade created through the API needs on top: the values of the request's "udf" list */
export interface StepInProvisioningData {
  oldCounterpartyName: string;
  oldCounterpartyFmId: string;
  novationDate: string;
}

/**
 * The data of a trade that is created through the API: the "basic" block of the request, without the product.
 * Text values are case data the PO can change for a run; premiumAmount is a number in the request and is recorded as it is.
 * datFile is not part of the request's "basic" block: it names the dat file that is sent, one of the product's
 * folder in testdata/dat/, and is case data too; without it the product's default file is sent.
 * tradeType decides the kind of trade a lifecycle event starts from (without it: Normal). It decides which request
 * is recorded (a StepIn trade has the "udf" list), so it is chosen in testdata before the case is exported and is
 * not case data the PO can change in the runner. A StepIn type needs the StepIn values too.
 */
export interface TradeProvisioningData extends Partial<StepInProvisioningData> {
  counterpartyFmId: string;
  counterpartyName: string;
  portfolioId: string;
  direction: string;
  premiumAmount: number;
  premiumCurrency: string;
  datFile?: string;
  tradeType?: TradeType;
}

/**
 * Trades that a case needs to exist before it starts, created through the API instead of the pages
 * (TradeProvisioningSteps of the E2E project). The calls are recorded like any other step, so a replay creates
 * its own trade; they need apiBaseUrl in the local config.
 */
export class TradeProvisioningFlow extends BaseFlow {
  /**
   * A live trade of that product, of the trade type the data names (Normal, StepInFull, StepInPartial): the maker
   * submits it, the checker approves it. Returns the trade ID (recorded as ${var:createdTradeId}).
   */
  async provisionLiveTrade(product: string, data: TradeProvisioningData, keyword: Keyword = 'Given'): Promise<string> {
    const { tradeId, taskId } = await this.submit(product, tradeTypeOf(data), data, keyword);
    await this.ui.And('I approve the trade through the API as checker', () => this.app.tradesApi.approveTask('checker', taskId));
    return tradeId;
  }

  /** A normal trade of that product that is pending approval: the maker submits it, nobody decides. Returns the trade ID */
  async provisionPendingTrade(product: string, data: TradeProvisioningData, keyword: Keyword = 'Given'): Promise<string> {
    return (await this.submit(product, 'Normal', data, keyword)).tradeId;
  }

  /** A StepIn full or partial trade of that product that is pending approval. Returns the trade ID */
  async provisionPendingStepInTrade(product: string, type: StepInType, data: TradeProvisioningData, keyword: Keyword = 'Given'): Promise<string> {
    return (await this.submit(product, type, data, keyword)).tradeId;
  }

  private submit(product: string, type: TradeType, data: TradeProvisioningData, keyword: Keyword) {
    const p = this.params(data);
    const file = data.datFile ? this.caseData('datFile', data.datFile) : undefined;
    const udf = type === 'Normal' ? undefined : this.stepInUdf(type, data);
    return this.ui[keyword](`I submit a new ${product} ${KIND[type]} through the API as maker`, () =>
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
        datFile(product, file),
      ),
    );
  }

  /** The "udf" list that makes a submitted trade a StepIn one */
  private stepInUdf(type: StepInType, data: TradeProvisioningData): TradeUdf[] {
    const missing = (['oldCounterpartyName', 'oldCounterpartyFmId', 'novationDate'] as const).filter((name) => !data[name]);
    if (missing.length) throw new Error(`A ${type} trade needs ${missing.join(', ')} in the test data (testdata/shared/given-trade.json)`);
    const p = this.params(data as TradeProvisioningData & StepInProvisioningData);
    return [
      { key: 'stepInType', value: type, type: 'Text' },
      { key: 'oldCptyName', value: p.oldCounterpartyName, type: 'Text' },
      { key: 'oldCptyFmId', value: p.oldCounterpartyFmId, type: 'Text' },
      { key: 'novationDate', value: p.novationDate, type: 'Date' },
    ];
  }
}

const KIND: Record<TradeType, string> = { Normal: 'trade', StepInFull: 'StepIn full trade', StepInPartial: 'StepIn partial trade' };

/** The trade type of the test data; a value that is not one of the three fails the case */
function tradeTypeOf(data: TradeProvisioningData): TradeType {
  const type = data.tradeType ?? 'Normal';
  if (!TRADE_TYPES.includes(type)) throw new Error(`Unknown tradeType "${type}" in the test data: use ${TRADE_TYPES.join(', ')}`);
  return type;
}
