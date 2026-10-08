import type { Target } from '../ui';
import { BasePage } from './base.page';
import { Combobox } from '../components/combobox';
import { ConfirmDialog } from '../components/confirm-dialog';

/** New Trade form (testids taken from the E2E project's element JSON) */
export class NewTradePage extends BasePage {
  static readonly path = '/trade/new';

  /**
   * The request that creates the trade; the new trade ID is read from its response.
   * Confirmed in the browser's Network tab: POST .../api/v1/trades/create?tradeAction=SUBMIT, answered with
   * { data: { trade: { id } } }. url is matched against the end of the request path plus the listed query parameters.
   */
  static readonly createApi = { url: '/trades/create?tradeAction=SUBMIT', method: 'POST', field: 'data.trade.id' };

  readonly counterparty = new Combobox(this.ui, { testId: 'create-trade-counterparty-combobox', inner: 'input' });
  readonly portfolio = new Combobox(this.ui, { testId: 'create-trade-portfolio-combobox', inner: 'input' });
  readonly productId = new Combobox(this.ui, { testId: 'create-trade-product-id-input', inner: 'input' });
  readonly direction = new Combobox(this.ui, { testId: 'create-trade-direction-select', inner: 'input' });
  readonly oldCounterparty = new Combobox(this.ui, { testId: 'create-trade-old-counterparty-combobox', inner: 'input' });
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
