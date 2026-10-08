// Reusable business flows: BDD steps (Given / When / Then) composed from page objects.
// Locators and single-page actions belong to framework/pages; a flow only says which page does what, in which order.

import { cfg } from './ui';
import { type App, TradeDetailPage } from './pages';

/**
 * Log in as a role; the account and password come from accounts.<role> in the local config.local.json.
 * keyword is the BDD keyword shown in the report: 'Given' for a precondition, 'When' / 'And' mid-scenario.
 */
export async function login(app: App, role: string, keyword: 'Given' | 'When' | 'And' = 'Given') {
  await app.ui[keyword](`I log in as ${role}`, () => app.login.loginAs(role));
}

// ---------- Trade creation ----------

export type TradeKind = 'normal' | 'stepinFull' | 'stepinPartial';

/** The product's .dat file, shipped with the cases in data/ (same names as the E2E project's ProductDatFiles) */
export const datFile = (product: string) => `data/${product}.dat`;

/**
 * Maker creates a trade for a product, mirroring the E2E project's trade_creation snippets:
 * a normal trade, or a StepIn full / StepIn partial trade. Test data comes from tradeData.* in config.local.json.
 * Returns the new trade ID (recorded as ${var:createdTradeId}).
 */
export async function createTrade(app: App, product: string, kind: TradeKind = 'normal'): Promise<string> {
  const { ui, topBar, newTrade, tradeDetail } = app;
  const selectBasicInfo = () =>
    ui.And('I select the basic mandatory info', () =>
      newTrade.selectBasicInfo({
        counterparty: cfg('tradeData.counterpartyName'),
        portfolio: cfg('tradeData.portfolioId'),
        productId: product, // the product type is what is typed as the Product ID
        direction: cfg('tradeData.direction'),
      }));
  const uploadDat = () => ui.And(`I upload the ${product} dat file`, () => newTrade.uploadDat(datFile(product)));

  await ui.When('I open the New Trade form', async () => {
    await topBar.openNewTrade();
    await newTrade.expectOpen();
  });

  if (kind === 'normal') {
    await selectBasicInfo();
    await uploadDat();
  } else {
    await uploadDat();
    await selectBasicInfo();
    const mode = kind === 'stepinFull' ? 'full' : 'partial';
    await ui.And(`I enable StepIn ${mode} and select the old counterparty`, () =>
      newTrade.enableStepIn(mode, cfg('tradeData.oldCounterpartyName')));
  }

  let tradeId = '';
  await ui.And('I book the trade and confirm', async () => {
    tradeId = await newTrade.bookAndConfirm();
  });

  await ui.Then('the trade is created with pending approval status', async () => {
    await tradeDetail.expectTradeId(tradeId); // recorded as ${var:createdTradeId}
    await tradeDetail.expectStatus(TradeDetailPage.status.pendingApproval);
  });
  return tradeId;
}
