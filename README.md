# OREO UAT Replay Tool (MVP)

QA runs a case locally with Playwright → once it passes, a **case file** (JSON) is exported automatically → the PO double-clicks the **portable runner** to replay it, really driving Edge on their own computer and producing an execution report with screenshots.

```
QA: npx playwright test  ──export──►  cases/login_maker_trades.json
                                          │ put on the shared drive
PO: double-click run-case.bat → pick a number → Edge opens and runs → evidence/xxx/report.html
```

A case file contains **no server address and no password**, only relative paths and config references (`${cfg:accounts.maker.password}`). Those values live in each computer's own `config.local.json`.

## Layout

| Path | Purpose |
|---|---|
| `core/actions.js` | Execution core. QA runs and PO replays go through the same code |
| `core/config.js` | Reads `config.local.json` |
| `framework/targets.ts` | Page element locators, `data-testid` throughout |
| `framework/ui.ts` | Action wrapper: execute + record, handles dynamic values and passwords automatically |
| `framework/fixtures.ts` | Exports to `cases/` automatically after a test passes |
| `framework/flows.ts` | Reusable flows (login) |
| `tests/` | Test cases |
| `runner/runner.js` | PO-side runner |
| `portable/run-case.bat` | The launcher the PO double-clicks |
| `scripts/build-portable.js` | Builds the portable runner |
| `mock-oreo/` | Mock OREO pages, for local demos only |

## QA: first-time setup

```bash
npm install                            # uses the local Edge, no browser download
copy config.local.example.json config.local.json
```

Edit `config.local.json`: fill in `baseUrl` (the real server address) and the account and password for each role. The file is in `.gitignore` and is never committed.

```bash
npx playwright test                    # run every case; passing ones are exported to cases/
npx playwright test --headed           # watch the browser while it runs
npm run replay                         # replay with the runner, exactly what the PO sees
```

> To try it without the real system: `npm run mock` starts the mock pages; set `baseUrl` to `http://localhost:4173` and the maker password to `maker1`.

## QA: writing a new case

```ts
test('Book a TARF @case:tarf_book', async ({ ui }) => {
  let tradeId = '';
  await login(ui, 'maker');
  await ui.step('Book the TARF', async () => {
    await ui.click(T.layout.newTradeBtn);
    await ui.fill({ testId: 'trade-ccy-pair-input', inner: 'input' }, 'USDCNH');
    await ui.click({ testId: 'trade-submit-btn' });
    tradeId = await ui.read({ testId: 'trade-id' }, 'tradeId');   // read the trade ID
  });
  await ui.step('Checker approves', async () => {
    await login(ui, 'checker');
    await ui.fill({ testId: 'trades-search-input', inner: 'input' }, tradeId); // becomes ${var:tradeId} automatically
  });
});
```

Key points:

- Every page action goes through `ui.xxx`. Do not call `page` directly, or the action will not be recorded.
- `@case:xxx` sets the exported file name; the title in `ui.step('title', ...)` appears in the PO's run log and report.
- A value read with `ui.read()` is **turned into a variable automatically** when it is used later, so the PO's replay uses the freshly generated value.
- Use `cfg('accounts.maker.password')` for accounts and passwords; even a password typed in plain text by mistake is replaced with a config reference on export.
- OREO inputs are web components and the real `<input>` sits in the shadow DOM, so input targets need `inner: 'input'`; buttons can be clicked on the host element directly.
- Only **passing** cases are exported.

## Packaging for the PO

```bash
npm run build:portable                    # copies your local node.exe, no internet needed
npm run build:portable -- --with-config   # include your baseUrl and accounts (passwords are stripped)
npm run build:portable -- --no-zip        # produce the folder only, no zip
```

This produces `dist/UAT-Runner.zip`; put it on the shared drive. After that, only newly exported `cases/*.json` files need to be sent to the PO, who drops them into their `cases` folder.

## PO: how to use it

1. Unzip `UAT-Runner.zip` (nothing needs to be installed).
2. Double-click **run-case.bat**, type a number and press Enter; or drag a case `.json` onto the bat file.
3. The first run asks for the system address and password (the password is used for that run only and is not saved).
4. Edge opens and runs the steps; when it finishes, the report opens automatically with a screenshot and result for every step.
5. If something goes wrong, send the matching folder under `evidence/` to QA; its `trace.zip` can be replayed step by step.

## Known limitations

- No video by default (recording depends on Playwright's ffmpeg, which usually cannot be downloaded on the intranet); per-step screenshots and the trace are enough to reproduce. If needed, set `"evidence": { "video": true }` in `config.local.json` and install ffmpeg manually.
- The PO's computer needs Edge (default) or Chrome (set `browser.channel` to `"chrome"`).
- The company must allow running `node.exe` and `.bat` from a shared drive or an unzipped folder; test on one PO machine first.
- `LOGIN_PATH` defaults to `/`; if the real login page is elsewhere, change `framework/flows.ts`.
- A replay really operates in UAT (real bookings, real approvals); make sure the environment can take repeated runs.
