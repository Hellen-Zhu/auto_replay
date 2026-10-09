import type { Val } from '../ui';
import { element } from '../elements';
import { RiskCalculation } from '../risk-engine';
import { BasePage } from './base.page';
import { Combobox } from '../components/combobox';
import { ConfirmDialog } from '../components/confirm-dialog';

/** How a field is operated: one implementation per kind in NewTradePage.setField, however many fields there are */
export type NewTradeFieldKind = 'combobox' | 'text';

export interface NewTradeFieldDef {
  /** The control's name in the element files (elements/pages/new_trade_page.json) */
  element: string;
  kind: NewTradeFieldKind;
  /** Every case must have a value for it */
  required?: boolean;
  /** Not case data: the value decides the scenario, so the case passes it and it is recorded as it is */
  scenario?: boolean;
  /** Filled by the step that makes the field appear instead of with the other fields */
  when?: 'stepIn';
}

export type NewTradeField = keyof typeof NewTradePage.fields;

/** New Trade form (elements/pages/new_trade_page.json) */
export class NewTradePage extends BasePage {
  static readonly path = '/trade/new';

  /**
   * The request that creates the trade; the new trade ID is read from its response.
   * Confirmed in the browser's Network tab: POST .../api/v1/trades/create?tradeAction=SUBMIT, answered with
   * { data: { trade: { id } } }. url is matched against the end of the request path plus the listed query parameters.
   */
  static readonly createApi = { url: '/trades/create?tradeAction=SUBMIT', method: 'POST', field: 'data.trade.id' };

  /**
   * The fields of the form: name (for case data, the name used in testdata) -> element and kind of control.
   * To support another field, add a line here (in the order the form is filled, top to bottom) and write its value
   * in testdata; nothing else changes. A field with when: 'stepIn' only exists after StepIn is switched on.
   */
  static readonly fields = {
    counterpartyName: { element: 'new_trade.counterparty_select', kind: 'combobox', required: true },
    portfolioId: { element: 'new_trade.portfolio_select', kind: 'combobox', required: true },
    productId: { element: 'new_trade.product_id_input', kind: 'combobox', scenario: true },
    direction: { element: 'new_trade.direction_select', kind: 'combobox', required: true },
    oldCounterpartyName: { element: 'new_trade.stepin_old_counterparty_select', kind: 'combobox', when: 'stepIn' },
  } as const satisfies Record<string, NewTradeFieldDef>;
  /** Shown after Book */
  readonly confirmDialog = new ConfirmDialog(this.ui, element('trade_change_confirmation.dialog'), element('trade_change_confirmation.confirm_btn'));

  protected readonly container = element('new_trade.container');
  protected readonly fileInput = element('new_trade.file_input');
  protected readonly bookBtn = element('new_trade.book_btn');
  protected readonly saveBtn = element('new_trade.save_btn');
  protected readonly stepinToggle = element('new_trade.stepin_toggle');
  protected readonly stepinFullRadio = element('new_trade.stepin_full_radio');
  protected readonly stepinPartialRadio = element('new_trade.stepin_partial_radio');

  async expectOpen() {
    await this.ui.expectVisible(this.container);
  }

  /** Set one field of the form, operated according to its kind */
  async setField(name: NewTradeField, value: Val) {
    const def: NewTradeFieldDef = NewTradePage.fields[name];
    // The element is the host of the control; the real <input> is inside its shadow root
    const input = element(def.element, { inner: 'input' });
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

  // Save and Book start the risk calculation of the new trade; the click is over once it is answered
  async clickBook() {
    await this.ui.clickAndAwait(this.bookBtn, RiskCalculation.forNewTrade());
  }

  async clickSave() {
    await this.ui.clickAndAwait(this.saveBtn, RiskCalculation.forNewTrade());
  }
}
