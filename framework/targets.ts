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
  layout: {
    newTradeBtn: { testId: 'layout-new-trade-btn' },
    aiReaderBtn: { testId: 'layout-ai-reader-btn' },
    themeToggleBtn: { testId: 'layout-theme-toggle-btn' },
    userMenuBtn: { testId: 'layout-user-menu-btn' },
  },
} satisfies Record<string, Record<string, Target>>;
