// Flow layer: business steps composed from the atomic operations of pages and components.
// Each flow method is one or more BDD steps (Given / When / Then) as they appear in the report. A flow holds no
// locators and never calls ui.click / ui.fill itself. Cases get this as the `flows` fixture.

import { cfg, type UI } from './ui';
import type { App } from './app';
import { NewTradePage, TradeDetailPage } from './pages';

/** The BDD keyword a step is reported with; each flow has a default that a case can override */
export type Keyword = 'Given' | 'When' | 'Then' | 'And' | 'But';

export type TradeKind = 'normal' | 'stepinFull' | 'stepinPartial';

/** The product's .dat file, shipped with the cases in data/ (same names as the E2E project's ProductDatFiles) */
export const datFile = (product: string) => `data/${product}.dat`;

export class Flows {
  private readonly ui: UI;

  constructor(private readonly app: App) {
    this.ui = app.ui;
  }

  // ---------- Login ----------

  /** Log in as a role; the account and password come from accounts.<role> in the local config.local.json */
  async login(role: string, keyword: Keyword = 'Given') {
    const { login } = this.app;
    await this.ui[keyword](`I log in as ${role}`, async () => {
      await login.open();
      await login.expectDialogVisible();
      await login.fillEmail(cfg(`accounts.${role}.email`));
      await login.fillPassword(cfg(`accounts.${role}.password`));
      await login.clickSignIn();
    });
  }

  async expectOnTradesPage(keyword: Keyword = 'Then') {
    await this.ui[keyword]('I am on the Trades page', async () => {
      await this.app.trades.expectOpen();
      await this.app.topBar.expectVisible();
    });
  }

  /** The top bar shows accounts.<role>.displayName */
  async expectCurrentUser(role: string, keyword: Keyword = 'And') {
    await this.ui[keyword]('the top-right corner shows the current user', async () => {
      await this.app.topBar.expectCurrentUser(cfg(`accounts.${role}.displayName`));
    });
  }

  // ---------- Trade creation ----------

  /**
   * Maker creates a trade for a product, mirroring the E2E project's trade_creation snippets:
   * a normal trade, or a StepIn full / StepIn partial trade. Test data comes from tradeData.* in config.local.json.
   * Returns the new trade ID (recorded as ${var:createdTradeId}).
   */
  async createTrade(product: string, kind: TradeKind = 'normal'): Promise<string> {
    const { ui } = this;
    const { topBar, newTrade, tradeDetail } = this.app;
    const selectBasicInfo = () =>
      ui.And('I select the basic mandatory info', async () => {
        await newTrade.counterparty.select(cfg('tradeData.counterpartyName'));
        await newTrade.portfolio.select(cfg('tradeData.portfolioId'));
        await newTrade.productId.select(product); // the product type is what is typed as the Product ID
        await newTrade.direction.select(cfg('tradeData.direction'));
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
        await newTrade.oldCounterparty.select(cfg('tradeData.oldCounterpartyName'));
      });
    }

    let tradeId = '';
    await ui.And('I book the trade and confirm', async () => {
      await newTrade.clickBook();
      await newTrade.confirmDialog.expectVisible();
      tradeId = await newTrade.confirmDialog.confirmAndCapture({ ...NewTradePage.createApi, saveAs: 'createdTradeId' });
    });

    await ui.Then('the trade is created with pending approval status', async () => {
      await tradeDetail.expectTradeId(tradeId); // recorded as ${var:createdTradeId}
      await tradeDetail.expectStatus(TradeDetailPage.status.pendingApproval);
    });
    return tradeId;
  }
}
