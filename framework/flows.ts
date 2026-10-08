// Reusable business flows

import { UI, cfg } from './ui';
import { T } from './targets';

/** Login page path (relative to baseUrl). Change it here if the real system's login page is not at the root */
export const LOGIN_PATH = '/';

/** Log in as a role; the account and password come from accounts.<role> in the local config.local.json */
export async function login(ui: UI, role: string) {
  await ui.step(`Log in as ${role}`, async () => {
    await ui.goto(LOGIN_PATH);
    await ui.expectVisible(T.login.dialog);
    await ui.fill(T.login.email, cfg(`accounts.${role}.email`));
    await ui.fill(T.login.password, cfg(`accounts.${role}.password`), { secret: true });
    await ui.click(T.login.signInBtn);
  });
}
