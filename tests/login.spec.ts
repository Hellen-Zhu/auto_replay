import { test } from '../framework/fixtures';
import { cfg } from '../framework/ui';
import { login } from '../framework/flows';

test.describe('Login', () => {
  test('Maker logs in, lands on the Trades page and sees the current user @case:login_maker_trades', async ({ ui, app }) => {
    test.info().annotations.push({
      type: 'description',
      description: 'Log in to OREO with the maker account, verify the redirect to the Trades page and that the top-right user menu shows maker',
    });

    await login(app, 'maker');

    await ui.Then('I am on the Trades page', async () => {
      await app.trades.expectOpen();
      await app.topBar.expectVisible();
    });

    await ui.And('the top-right corner shows the current user', async () => {
      await app.topBar.expectCurrentUser(cfg('accounts.maker.displayName'));
    });
  });
});
