// OREO 页面元素定位（统一维护，优先 data-testid）
// OREO 的输入框是 web component（sc-text-input），真正的 <input> 在 shadow DOM 里，
// 所以用 inner: 'input' 在宿主元素内再定位一层。

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
