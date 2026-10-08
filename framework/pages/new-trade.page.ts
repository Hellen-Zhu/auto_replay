import type { Target, Val } from '../ui';
import { BasePage } from './base.page';

export type BasicInfo = { counterparty: Val; portfolio: Val; productId: Val; direction: Val };

/** New Trade form (testids taken from the E2E project's element JSON) */
export class NewTradePage extends BasePage {
  static readonly path = '/trade/new';

  /**
   * The request that creates the trade; the new trade ID is read from its response.
   * Confirmed in the browser's Network tab: POST .../api/v1/trades/create?tradeAction=SUBMIT, answered with
   * { data: { trade: { id } } }. url is matched against the end of the request path plus the listed query parameters.
   */
  static readonly createApi = { url: '/trades/create?tradeAction=SUBMIT', method: 'POST', field: 'data.trade.id' };

  protected readonly container: Target = { testId: 'create-trade-stepin-container' };
  protected readonly counterparty: Target = { testId: 'create-trade-counterparty-combobox', inner: 'input' };
  protected readonly portfolio: Target = { testId: 'create-trade-portfolio-combobox', inner: 'input' };
  protected readonly productId: Target = { testId: 'create-trade-product-id-input', inner: 'input' };
  protected readonly direction: Target = { testId: 'create-trade-direction-select', inner: 'input' };
  protected readonly fileInput: Target = { testId: 'trade-file-upload' };
  protected readonly bookBtn: Target = { testId: 'create-trade-book-btn' };
  protected readonly saveBtn: Target = { testId: 'create-trade-save-btn' };
  protected readonly stepinToggle: Target = { testId: 'create-trade-stepin-toggle' };
  protected readonly stepinFullRadio: Target = { testId: 'create-trade-stepin-full-radio' };
  protected readonly stepinPartialRadio: Target = { testId: 'create-trade-stepin-partial-radio' };
  protected readonly oldCounterparty: Target = { testId: 'create-trade-old-counterparty-combobox', inner: 'input' };
  // The sc-modal host itself is 0 x 0 (its panel is rendered by the shadow root), so it never counts as visible;
  // the slotted header is what the user actually sees (a plain h2 matches more than one element in the dialog)
  protected readonly confirmDialog: Target = { testId: 'trade-change-confirmation-dialog', inner: '[slot="header"]' };
  protected readonly confirmBtn: Target = { testId: 'trade-change-confirm-btn' };

  async expectOpen() {
    await this.ui.expectVisible(this.container);
  }

  /** Counterparty, portfolio, product ID and direction: each is typed, then picked from its dropdown */
  async selectBasicInfo(info: BasicInfo) {
    await this.pick(this.counterparty, info.counterparty);
    await this.pick(this.portfolio, info.portfolio);
    await this.pick(this.productId, info.productId);
    await this.pick(this.direction, info.direction);
  }

  /** file is relative to the project root and must be inside data/, e.g. 'data/FX_TRF.dat' */
  async uploadDat(file: string) {
    await this.ui.upload(this.fileInput, file);
  }

  async enableStepIn(mode: 'full' | 'partial', oldCounterparty: Val) {
    await this.ui.click(this.stepinToggle);
    await this.ui.click(mode === 'full' ? this.stepinFullRadio : this.stepinPartialRadio);
    await this.pick(this.oldCounterparty, oldCounterparty);
  }

  /** Book, confirm the dialog and return the new trade ID (recorded as ${var:<saveAs>}) */
  async bookAndConfirm(saveAs = 'createdTradeId'): Promise<string> {
    await this.ui.click(this.bookBtn);
    await this.ui.expectVisible(this.confirmDialog);
    return this.ui.clickAndCapture(this.confirmBtn, { ...NewTradePage.createApi, saveAs });
  }
}
