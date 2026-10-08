import { test } from '../framework/fixtures';
import { cfg } from '../framework/ui';
import { T } from '../framework/targets';
import { login } from '../framework/flows';

test.describe('Login', () => {
  test('Maker logs in, lands on the Trades page and sees the current user @case:login_maker_trades', async ({ ui }) => {
    test.info().annotations.push({
      type: 'description',
      description: 'Log in to OREO with the maker account, verify the redirect to the Trades page and that the top-right user menu shows maker',
    });

    await login(ui, 'maker');

    await ui.step('Verify the Trades page is shown', async () => {
      await ui.expectUrl('/trades');
      await ui.expectVisible(T.layout.newTradeBtn);
    });

    await ui.step('Verify the top-right corner shows the current user', async () => {
      await ui.expectText(T.layout.userMenuBtn, cfg('accounts.maker.displayName'));
    });
  });
});
