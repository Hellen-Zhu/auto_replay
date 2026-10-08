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
| `framework/flows.ts` | Reusable flows (`login`, `createTrade`) |
| `tests/` | Test cases: `login.spec.ts`, `trade-creation.spec.ts` (products x normal / StepIn full / StepIn partial) |
| `data/` | Files the cases upload (one `.dat` per product); shipped to the PO with the package |
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

> To try it without the real system: `npm run mock` starts the mock pages; set `baseUrl` to `http://localhost:4173` and the maker password to `maker1`. For the trade creation cases also set `tradeData` to `counterpartyName: "MOCK BANK A"`, `portfolioId: "ABS_CR_UK_ETFBB"`, `direction: "Buy"`, `oldCounterpartyName: "MOCK BANK B"`.

### Trade creation cases

`tests/trade-creation.spec.ts` generates three cases per product (normal trade, StepIn full, StepIn partial), mirroring `trade_creation.feature` of the E2E project. Before running them:

1. Copy the product `.dat` files into `data/` (`FX_CO.dat`, `FX_TRF.dat`, `FX_FSB.dat`); a product without its file is skipped.
2. Fill in `tradeData` in `config.local.json` (counterparty, portfolio, direction, old counterparty for StepIn). These values are not stored in the case files, so the PO can use their own.
3. Against the real system, first replace the entries marked `UNCONFIRMED` in `framework/targets.ts` and `framework/flows.ts` (testids, the create-trade request path, the status text) with the real values.

To add a product, add it to `PRODUCTS` in the spec and put its `.dat` file in `data/`.

## QA: writing a new case

```ts
test('Book a TARF @case:tarf_book', async ({ ui }) => {
  let tradeId = '';
  await login(ui, 'maker');                                   // Given I log in as maker
  await ui.When('I book a TARF', async () => {
    await ui.click(T.layout.newTradeBtn);
    await ui.fill({ testId: 'trade-ccy-pair-input', inner: 'input' }, 'USDCNH');
    await ui.click({ testId: 'trade-submit-btn' });
    tradeId = await ui.read({ testId: 'trade-id' }, 'tradeId');   // read the trade ID
  });
  await login(ui, 'checker', 'And');                          // And I log in as checker
  await ui.Then('the trade can be found by its ID', async () => {
    await ui.fill({ testId: 'trades-search-input', inner: 'input' }, tradeId); // becomes ${var:tradeId} automatically
  });
});
```

Key points:

- Every page action goes through `ui.xxx`. Do not call `page` directly, or the action will not be recorded.
- `@case:xxx` sets the exported file name. The test title is shown as the **Scenario**, and each `ui.Given / When / Then / And / But('...', ...)` group becomes one line of it in the PO's run log and report, so write them as business-readable sentences.
- A value read with `ui.read()` is **turned into a variable automatically** when it is used later, so the PO's replay uses the freshly generated value.
- Use `cfg('accounts.maker.password')` for accounts and passwords; even a password typed in plain text by mistake is replaced with a config reference on export.
- OREO inputs are web components and the real `<input>` sits in the shadow DOM, so input targets need `inner: 'input'`; buttons can be clicked on the host element directly.
- `ui.upload(target, 'data/FX_TRF.dat')` uploads a file from `data/`; `ui.clickAndCapture(target, { url, method, field, saveAs })` clicks and reads a value out of the response the click triggers (for example the new trade ID), which then behaves like a value from `ui.read()`.
- Text fields of a target can reference config too: `{ role: 'option', name: cfg('tradeData.direction') }`.
- Only **passing** cases are exported.

## Packaging for the PO

```bash
npm run build:portable                    # copies your local node.exe, no internet needed
npm run build:portable -- --with-config   # include your baseUrl and accounts (passwords are stripped)
npm run build:portable -- --no-zip        # produce the folder only, no zip
```

This produces `dist/UAT-Runner.zip`; put it on the shared drive. After that, only newly exported `cases/*.json` files need to be sent to the PO, who drops them into their `cases` folder (plus any new file under `data/` that a case uploads).

## PO: how to use it

1. Unzip `UAT-Runner.zip` (nothing needs to be installed).
2. Double-click **run-case.bat**, type a number and press Enter; or drag a case `.json` onto the bat file.
3. The runner shows the system address and account it is about to use. Press Enter to continue, or type `C` to switch to another environment or account for this run (the password is then asked for again). Anything missing, such as the password, is prompted for. After typing in an address or account, the runner offers to save it to `config.local.json` for next time; passwords are never saved.
4. Press Enter to run, or type `S` to run **step by step**: the run then stops after each Given / When / Then block until you press Enter.
5. Edge opens and runs the steps. To pause at any moment, click the black console window and press `P`: the run stops once the current step has finished, and Enter resumes it. The browser stays open while paused; clicking around in it by hand may make the remaining steps fail.
6. When it finishes, the report opens automatically. It reads as the scenario: one row per Given / When / Then step with its result and a screenshot (pauses and their length are shown too); click "N actions" under a step to see the individual actions behind it.
7. If something goes wrong, send the matching folder under `evidence/` to QA; its `trace.zip` can be replayed step by step.

## Known limitations

- No video by default (recording depends on Playwright's ffmpeg, which usually cannot be downloaded on the intranet); per-step screenshots and the trace are enough to reproduce. If needed, set `"evidence": { "video": true }` in `config.local.json` and install ffmpeg manually.
- The PO's computer needs Edge (default) or Chrome (set `browser.channel` to `"chrome"`).
- The company must allow running `node.exe` and `.bat` from a shared drive or an unzipped folder; test on one PO machine first.
- `LOGIN_PATH` defaults to `/`; if the real login page is elsewhere, change `framework/flows.ts`.
- A replay really operates in UAT (real bookings, real approvals); make sure the environment can take repeated runs.
