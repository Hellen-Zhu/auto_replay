import { test } from '../framework/fixtures';

test.describe('Login', () => {
  test('Maker logs in, lands on the Trades page and sees the current user @case:login_maker_trades', async ({ flows }) => {
    test.info().annotations.push({
      type: 'description',
      description: 'Log in to OREO with the maker account, verify the redirect to the Trades page and that the top-right user menu shows maker',
    });

    await flows.auth.login('maker');
    await flows.trades.expectOnTradesPage();
    await flows.auth.expectCurrentUser('maker');
  });
});
