import type { Target, Val } from '../ui';
import { BasePage } from './base.page';
import { Combobox } from '../components/combobox';
import { ConfirmDialog } from '../components/confirm-dialog';

/** How a field is operated: one implementation per kind in NewTradePage.setField, however many fields there are */
export type NewTradeFieldKind = 'combobox' | 'text';

export interface NewTradeFieldDef {
  testId: string;
  kind: NewTradeFieldKind;
  /** Every case must have a value for it */
  required?: boolean;
  /** Not case data: the value decides the scenario, so the case passes it and it is recorded as it is */
  scenario?: boolean;
  /** Filled by the step that makes the field appear instead of with the other fields */
  when?: 'stepIn';
}

export type NewTradeField = keyof typeof NewTradePage.fields;

/** New Trade form (testids taken from the E2E project's element JSON) */
export class NewTradePage extends BasePage {
  static readonly path = '/trade/new';

  /**
   * The request that creates the trade; the new trade ID is read from its response.
   * Confirmed in the browser's Network tab: POST .../api/v1/trades/create?tradeAction=SUBMIT, answered with
   * { data: { trade: { id } } }. url is matched against the end of the request path plus the listed query parameters.
   */
  static readonly createApi = { url: '/trades/create?tradeAction=SUBMIT', method: 'POST', field: 'data.trade.id' };

  /**
   * The fields of the form: name (for case data, the name used in testdata) -> testid and kind of control.
   * To support another field, add a line here (in the order the form is filled, top to bottom) and write its value
   * in testdata; nothing else changes. A field with when: 'stepIn' only exists after StepIn is switched on.
   */
  static readonly fields = {
    counterpartyName: { testId: 'create-trade-counterparty-combobox', kind: 'combobox', required: true },
    portfolioId: { testId: 'create-trade-portfolio-combobox', kind: 'combobox', required: true },
    productId: { testId: 'create-trade-product-id-input', kind: 'combobox', scenario: true },
    direction: { testId: 'create-trade-direction-select', kind: 'combobox', required: true },
    oldCounterpartyName: { testId: 'create-trade-old-counterparty-combobox', kind: 'combobox', when: 'stepIn' },
  } as const satisfies Record<string, NewTradeFieldDef>;
  /** Shown after Book */
  readonly confirmDialog = new ConfirmDialog(this.ui, 'trade-change-confirmation-dialog', { testId: 'trade-change-confirm-btn' });

  protected readonly container: Target = { testId: 'create-trade-stepin-container' };
  protected readonly fileInput: Target = { testId: 'trade-file-upload' };
  protected readonly bookBtn: Target = { testId: 'create-trade-book-btn' };
  protected readonly saveBtn: Target = { testId: 'create-trade-save-btn' };
  protected readonly stepinToggle: Target = { testId: 'create-trade-stepin-toggle' };
  protected readonly stepinFullRadio: Target = { testId: 'create-trade-stepin-full-radio' };
  protected readonly stepinPartialRadio: Target = { testId: 'create-trade-stepin-partial-radio' };

  async expectOpen() {
    await this.ui.expectVisible(this.container);
  }

  /** Set one field of the form, operated according to its kind */
  async setField(name: NewTradeField, value: Val) {
    const def: NewTradeFieldDef = NewTradePage.fields[name];
    const input: Target = { testId: def.testId, inner: 'input' };
    switch (def.kind) {
      case 'combobox':
        return new Combobox(this.ui, input).select(value);
      case 'text':
        return this.ui.fill(input, value);
    }
  }

  /** file is relative to the project root and must be inside data/, e.g. 'data/FX_TRF.dat' */
  async uploadDat(file: string) {
    await this.ui.upload(this.fileInput, file);
  }

  async toggleStepIn() {
    await this.ui.click(this.stepinToggle);
  }

  async chooseStepInFull() {
    await this.ui.click(this.stepinFullRadio);
  }

  async chooseStepInPartial() {
    await this.ui.click(this.stepinPartialRadio);
  }

  async clickBook() {
    await this.ui.click(this.bookBtn);
  }

  async clickSave() {
    await this.ui.click(this.saveBtn);
  }
}
