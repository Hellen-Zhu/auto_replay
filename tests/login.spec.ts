import { test } from '../framework/fixtures';
import { cfg } from '../framework/ui';
import { T } from '../framework/targets';
import { login } from '../framework/flows';

test.describe('登录', () => {
  test('Maker 登录后进入 Trades 页面并显示当前用户 @case:login_maker_trades', async ({ ui }) => {
    test.info().annotations.push({
      type: 'description',
      description: '使用 maker 账号登录 OREO，校验跳转到 Trades 页面，右上角用户菜单显示 maker',
    });

    await login(ui, 'maker');

    await ui.step('校验进入 Trades 页面', async () => {
      await ui.expectUrl('/trades');
      await ui.expectVisible(T.layout.newTradeBtn);
    });

    await ui.step('校验右上角显示当前用户', async () => {
      await ui.expectText(T.layout.userMenuBtn, cfg('accounts.maker.displayName'));
    });
  });
});
