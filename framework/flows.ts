// Reusable business flows

import { UI, cfg, type TargetIn, type Val } from './ui';
import { T } from './targets';

/** Login page path (relative to baseUrl). Change it here if the real system's login page is not at the root */
export const LOGIN_PATH = '/';

/**
 * Log in as a role; the account and password come from accounts.<role> in the local config.local.json.
 * keyword is the BDD keyword shown in the report: 'Given' for a precondition, 'When' / 'And' mid-scenario.
 */
export async function login(ui: UI, role: string, keyword: 'Given' | 'When' | 'And' = 'Given') {
  await ui[keyword](`I log in as ${role}`, async () => {
    await ui.goto(LOGIN_PATH);
    await ui.expectVisible(T.login.dialog);
    await ui.fill(T.login.email, cfg(`accounts.${role}.email`));
    await ui.fill(T.login.password, cfg(`accounts.${role}.password`), { secret: true });
    await ui.click(T.login.signInBtn);
  });
}

// ---------- Trade creation ----------

export type TradeKind = 'normal' | 'stepinFull' | 'stepinPartial';

/**
 * The request that creates the trade; the new trade ID is read from its response.
 * Confirmed in the browser's Network tab: POST .../api/v1/trades/create?tradeAction=SUBMIT, answered with
 * { data: { trade: { id } } }. url is matched against the end of the request path plus the listed query parameters.
 */
export const CREATE_TRADE_API = { url: '/trades/create?tradeAction=SUBMIT', method: 'POST', field: 'data.trade.id' };

/** Status badge shown on the trade detail header right after booking (confirmed on the real system) */
export const PENDING_APPROVAL_TEXT = 'PARV';

/** The product's .dat file, shipped with the cases in data/ (same names as the E2E project's ProductDatFiles) */
export const datFile = (product: string) => `data/${product}.dat`;

/**
 * An entry of an open OREO dropdown. The entries are not native options: each one is an
 * <sl-menu-item role="menuitem"> whose label is slotted in, with the typed text highlighted in <b>.
 */
const dropdownItem = (name: Val): TargetIn => ({ role: 'menuitem', name, exact: true });

/** Type into a combobox, then pick the matching entry from its dropdown */
async function pick(ui: UI, box: TargetIn, value: Val) {
  await ui.fill(box, value);
  await ui.click(dropdownItem(value));
}

/**
 * Maker creates a trade for a product, mirroring the E2E project's trade_creation snippets:
 * a normal trade, or a StepIn full / StepIn partial trade. Test data comes from tradeData.* in config.local.json.
 * Returns the new trade ID (recorded as ${var:createdTradeId}).
 */
export async function createTrade(ui: UI, product: string, kind: TradeKind = 'normal'): Promise<string> {
  const N = T.newTrade;
  const selectBasicInfo = () =>
    ui.And('I select the basic mandatory info', async () => {
      await pick(ui, N.counterparty, cfg('tradeData.counterpartyName'));
      await pick(ui, N.portfolio, cfg('tradeData.portfolioId'));
      await pick(ui, N.productId, product);
      await pick(ui, N.direction, cfg('tradeData.direction'));
    });
  const uploadDat = () =>
    ui.And(`I upload the ${product} dat file`, async () => {
      await ui.upload(N.fileInput, datFile(product));
    });

  await ui.When('I open the New Trade form', async () => {
    await ui.click(T.layout.newTradeBtn);
    await ui.expectVisible(N.container);
  });

  if (kind === 'normal') {
    await selectBasicInfo();
    await uploadDat();
  } else {
    await uploadDat();
    await selectBasicInfo();
    const full = kind === 'stepinFull';
    await ui.And(`I enable StepIn ${full ? 'full' : 'partial'} and select the old counterparty`, async () => {
      await ui.click(N.stepinToggle);
      await ui.click(full ? N.stepinFullRadio : N.stepinPartialRadio);
      await pick(ui, N.oldCounterparty, cfg('tradeData.oldCounterpartyName'));
    });
  }

  let tradeId = '';
  await ui.And('I book the trade and confirm', async () => {
    await ui.click(N.bookBtn);
    await ui.expectVisible(N.confirmDialog);
    tradeId = await ui.clickAndCapture(N.confirmBtn, { ...CREATE_TRADE_API, saveAs: 'createdTradeId' });
  });

  await ui.Then('the trade is created with pending approval status', async () => {
    await ui.expectText(T.tradeDetail.headerCard, tradeId); // recorded as ${var:createdTradeId}
    await ui.expectText(T.tradeDetail.headerCard, PENDING_APPROVAL_TEXT);
  });
  return tradeId;
}
