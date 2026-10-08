// OREO page element locators (maintained in one place, data-testid preferred)
// OREO inputs are web components (sc-text-input) and the real <input> sits in the shadow DOM,
// so inner: 'input' locates one level further inside the host element.

export type Target = {
  testId?: string;
  role?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  text?: string;
  css?: string;
  inner?: string;
  nth?: number;
  exact?: boolean;
};

export const T = {
  login: {
    dialog: { testId: 'login-dialog' },
    email: { testId: 'login-email-input', inner: 'input' },
    password: { testId: 'login-password-input', inner: 'input' },
    signInBtn: { testId: 'login-sign-in-to-portal-btn' },
  },
  // New Trade form (testids taken from the E2E project's element JSON)
  newTrade: {
    container: { testId: 'create-trade-stepin-container' },
    counterparty: { testId: 'create-trade-counterparty-combobox', inner: 'input' },
    portfolio: { testId: 'create-trade-portfolio-combobox', inner: 'input' },
    productId: { testId: 'create-trade-product-id-input', inner: 'input' },
    direction: { testId: 'create-trade-direction-select', inner: 'input' },
    fileInput: { testId: 'trade-file-upload' },
    bookBtn: { testId: 'create-trade-book-btn' },
    saveBtn: { testId: 'create-trade-save-btn' },
    stepinToggle: { testId: 'create-trade-stepin-toggle' },
    stepinFullRadio: { testId: 'create-trade-stepin-full-radio' },
    stepinPartialRadio: { testId: 'create-trade-stepin-partial-radio' },
    oldCounterparty: { testId: 'create-trade-old-counterparty-combobox', inner: 'input' },
    // The sc-modal host itself is 0 x 0 (its panel is rendered by the shadow root), so it never counts as visible;
    // the slotted header is what the user actually sees (a plain h2 matches more than one element in the dialog)
    confirmDialog: { testId: 'trade-change-confirmation-dialog', inner: '[slot="header"]' },
    confirmBtn: { testId: 'trade-change-confirm-btn' },
  },
  tradeDetail: {
    headerCard: { testId: 'trade-detail-header-card' },
  },
  layout: {
    newTradeBtn: { testId: 'layout-new-trade-btn' },
    aiReaderBtn: { testId: 'layout-ai-reader-btn' },
    themeToggleBtn: { testId: 'layout-theme-toggle-btn' },
    userMenuBtn: { testId: 'layout-user-menu-btn' },
  },
} satisfies Record<string, Record<string, Target>>;
