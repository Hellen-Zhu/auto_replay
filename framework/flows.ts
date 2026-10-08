// 可复用的业务流程

import { UI, cfg } from './ui';
import { T } from './targets';

/** 登录页路径（相对 baseUrl）。如果真实系统的登录页不是根路径，改这里即可 */
export const LOGIN_PATH = '/';

/** 以某个角色登录，账号密码来自本地 config.local.json 的 accounts.<role> */
export async function login(ui: UI, role: string) {
  await ui.step(`以 ${role} 身份登录`, async () => {
    await ui.goto(LOGIN_PATH);
    await ui.expectVisible(T.login.dialog);
    await ui.fill(T.login.email, cfg(`accounts.${role}.email`));
    await ui.fill(T.login.password, cfg(`accounts.${role}.password`), { secret: true });
    await ui.click(T.login.signInBtn);
  });
}
