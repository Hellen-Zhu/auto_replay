import { NewTradePage, TradeDetailPage, type NewTradeField, type NewTradeFieldDef } from '../pages';
import type { Val } from '../ui';
import { BaseFlow, type Keyword } from './base.flow';

type Fields = typeof NewTradePage.fields;
/** The fields that take their value from case data */
type DataField = { [K in NewTradeField]: Fields[K] extends { scenario: true } ? never : K }[NewTradeField];
type RequiredField = { [K in DataField]: Fields[K] extends { required: true } ? K : never }[DataField];

/**
 * The data of one trade creation case (common values, defaults and its row of testdata/trade-creation.json):
 * one optional value per data field of NewTradePage.fields; the required ones must be there.
 */
export type TradeCreationData = { [K in RequiredField]: string } & { [K in Exclude<DataField, RequiredField>]?: string };

const FIELD_NAMES = Object.keys(NewTradePage.fields) as NewTradeField[];
const fieldDef = (name: NewTradeField): NewTradeFieldDef => NewTradePage.fields[name];
const DATA_FIELDS = FIELD_NAMES.filter((name) => !fieldDef(name).scenario);
/** Filled in the first step, in the order of the form */
const BASIC_FIELDS = FIELD_NAMES.filter((name) => fieldDef(name).required || fieldDef(name).scenario);
/** Filled in one step after the basic ones, each only when the case has a value for it */
const OPTIONAL_FIELDS = DATA_FIELDS.filter((name) => !fieldDef(name).required && !fieldDef(name).when);

/** The product's .dat file, shipped with the cases in data/ (same names as the E2E project's ProductDatFiles) */
export const datFile = (product: string) => `data/${product}.dat`;

/**
 * Booking a new trade through the New Trade form, mirroring the E2E project's trade_creation snippets.
 * The product type is what is typed as the Product ID and it names the dat file; the data is recorded as case
 * data (${param:name}), which the PO can change for a run. Each create flow ends when the booking is confirmed
 * and returns the new trade ID (recorded as ${var:createdTradeId}); the outcome is asserted by the case, e.g.
 * with expectPendingApproval(tradeId).
 */
export class TradeCreationFlow extends BaseFlow {
  /** Maker creates a normal trade for a product */
  async createTrade(product: string, data: TradeCreationData): Promise<string> {
    await this.openNewTradeForm();
    await this.selectBasicInfo(product, data);
    await this.fillOptionalFields(data);
    await this.uploadDat(product);
    return this.bookAndConfirm();
  }

  /** Maker creates a StepIn full trade for a product */
  async createStepInFullTrade(product: string, data: TradeCreationData): Promise<string> {
    return this.createStepInTrade(product, data, true);
  }

  /** Maker creates a StepIn partial trade for a product */
  async createStepInPartialTrade(product: string, data: TradeCreationData): Promise<string> {
    return this.createStepInTrade(product, data, false);
  }

  private async createStepInTrade(product: string, data: TradeCreationData, full: boolean): Promise<string> {
    const { newTrade } = this.app;
    const p = this.params(data);
    await this.openNewTradeForm();
    await this.uploadDat(product);
    await this.selectBasicInfo(product, data);
    await this.fillOptionalFields(data);
    await this.ui.And(`I enable StepIn ${full ? 'full' : 'partial'} and select the old counterparty`, async () => {
      await newTrade.toggleStepIn();
      await (full ? newTrade.chooseStepInFull() : newTrade.chooseStepInPartial());
      await newTrade.setField('oldCounterpartyName', p.oldCounterpartyName);
    });
    return this.bookAndConfirm();
  }

  private async openNewTradeForm() {
    const { topBar, newTrade } = this.app;
    await this.ui.When('I open the New Trade form', async () => {
      await topBar.clickNewTrade();
      await newTrade.expectOpen();
    });
  }

  private async selectBasicInfo(product: string, data: TradeCreationData) {
    const { newTrade } = this.app;
    const p = this.params(data) as Record<NewTradeField, Val>;
    checkFieldNames(data);
    await this.ui.And('I select the basic mandatory info', async () => {
      // The product type is what is typed as the Product ID
      for (const name of BASIC_FIELDS) await newTrade.setField(name, name === 'productId' ? product : p[name]);
    });
  }

  /** Every other field of NewTradePage.fields the case has a value for, in the order of the form; no step when there is none */
  private async fillOptionalFields(data: TradeCreationData) {
    const { newTrade } = this.app;
    const p = this.params(data) as Record<NewTradeField, Val>;
    const values = data as Partial<Record<NewTradeField, string>>;
    const names = OPTIONAL_FIELDS.filter((name) => values[name] !== undefined && values[name] !== '');
    if (!names.length) return;
    await this.ui.And('I fill the optional fields', async () => {
      for (const name of names) await newTrade.setField(name, p[name]);
    });
  }

  private async uploadDat(product: string) {
    await this.ui.And(`I upload the ${product} dat file`, () => this.app.newTrade.uploadDat(datFile(product)));
  }

  private async bookAndConfirm(): Promise<string> {
    const { newTrade } = this.app;
    let tradeId = '';
    await this.ui.And('I book the trade and confirm', async () => {
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

/** A name in the data that is not a field of the form would otherwise be ignored without a word */
function checkFieldNames(data: object) {
  const unknown = Object.keys(data).filter((name) => name !== 'id' && !DATA_FIELDS.includes(name as NewTradeField));
  if (unknown.length) {
    throw new Error(`Unknown trade creation data: ${unknown.join(', ')}. The fields are listed in NewTradePage.fields (framework/pages/new-trade.page.ts): ${DATA_FIELDS.join(', ')}`);
  }
}
