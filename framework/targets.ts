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
  // New Trade form. Entries marked UNCONFIRMED are testids guessed from the naming convention:
  // replace them with the values from the E2E project's element JSON before running against the real system.
  newTrade: {
    container: { testId: 'create-trade-stepin-container' },
    counterparty: { testId: 'create-trade-counterparty-combobox', inner: 'input' },
    portfolio: { testId: 'create-trade-portfolio-combobox', inner: 'input' },
    productId: { testId: 'create-trade-product-id-input', inner: 'input' }, // UNCONFIRMED
    direction: { testId: 'create-trade-direction-combobox', inner: 'input' }, // UNCONFIRMED
    fileInput: { testId: 'create-trade-file-input' }, // UNCONFIRMED
    bookBtn: { testId: 'create-trade-book-btn' }, // UNCONFIRMED
    saveBtn: { testId: 'create-trade-save-btn' }, // UNCONFIRMED
    stepinToggle: { testId: 'create-trade-stepin-toggle' }, // UNCONFIRMED
    stepinFullRadio: { testId: 'create-trade-stepin-full-radio' },
    stepinPartialRadio: { testId: 'create-trade-stepin-partial-radio' }, // UNCONFIRMED
    oldCounterparty: { testId: 'create-trade-stepin-old-counterparty-combobox', inner: 'input' }, // UNCONFIRMED
    confirmDialog: { testId: 'trade-change-confirmation-dialog' }, // UNCONFIRMED
    confirmBtn: { testId: 'trade-change-confirmation-confirm-btn' }, // UNCONFIRMED
  },
  tradeDetail: {
    headerCard: { testId: 'trade-detail-header-card' }, // UNCONFIRMED
  },
  layout: {
    newTradeBtn: { testId: 'layout-new-trade-btn' },
    aiReaderBtn: { testId: 'layout-ai-reader-btn' },
    themeToggleBtn: { testId: 'layout-theme-toggle-btn' },
    userMenuBtn: { testId: 'layout-user-menu-btn' },
  },
} satisfies Record<string, Record<string, Target>>;
