# OREO UAT Replay Tool (MVP)

QA runs a case locally with Playwright → once it passes, a **case file** (JSON) is exported automatically → the PO double-clicks the **portable runner** to replay it, really driving Edge on their own computer and producing an execution report with screenshots.

```
QA: npx playwright test  ──export──►  cases/login_maker_trades.json
                                          │ put on the shared drive
PO: double-click run-case.bat → pick a number → Edge opens and runs → evidence/xxx/report.html
```

A case file contains **no server address and no password**, only relative paths and config references (`${cfg:accounts.maker.password}`). Those values live in each computer's own `config.local.json`.

Two kinds of data are kept apart:

| | Environment | Case data |
|---|---|---|
| What | Server address, accounts, passwords | What a case types or selects: counterparty, portfolio, direction, notional... |
| Where | `config.local.json` on each computer, never committed | `testdata/*.json`, committed |
| In the case file | `${cfg:accounts.maker.email}` (the value is not in the file) | `${param:counterpartyName}` plus the value in the `params` block of the file |
| For the PO | Asked for when missing; `C` changes it for a run | Comes with the case; `D` changes it for a run |

## Layout

| Path | Purpose |
|---|---|
| `core/actions.js` | Execution core. QA runs and PO replays go through the same code |
| `core/config.js` | Reads `config.local.json` |
| `framework/components/` | Component objects: controls and regions shared by several pages (`TopBar`, `Combobox`, `ConfirmDialog`), atomic operations only |
| `framework/pages/` | Page objects: one class per page, holding its locators (`data-testid` throughout) and its atomic operations |
| `framework/app.ts` | `App`: one instance of every page and shared component |
| `framework/ui.ts` | Action wrapper: execute + record, handles dynamic values, case data and passwords automatically |
| `framework/data.ts` | `loadCases('<name>')`: the rows of `testdata/<name>.json`, one per case |
| `framework/fixtures.ts` | Provides `flows`, `app` and `ui` to every test; exports to `cases/` automatically after a test passes |
| `framework/flows/` | Flow layer: business steps reported as Given / When / Then, composed from atomic operations; one file per business domain (`auth`, `trades`, `tradeCreation`) |
| `tests/` | Test cases: `login.spec.ts`, `trade-creation.spec.ts` (one case per row of `testdata/trade-creation.json`) |
| `testdata/` | Case data: `common.json` (values shared by all cases) and one `<name>.json` per spec. QA side only; the values a case uses are copied into its case file |
| `data/` | Files the cases upload (one `.dat` per product); shipped to the PO with the package |
| `runner/runner.js` | PO-side runner |
| `portable/run-case.bat` | The launcher the PO double-clicks |
| `portable/record-session.bat` | Records a manual session (no case): the PO works by hand with the trace on, e.g. to report a bug |
| `portable/view-trace.bat` | Opens the list of earlier runs with their report and trace viewer links |
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

> To try it without the real system: `npm run mock` starts the mock pages; set `baseUrl` to `http://localhost:4173` and the maker password to `maker1`. The values in `testdata/` as committed match the mock.

### Trade creation cases

`tests/trade-creation.spec.ts` generates one case per row of `testdata/trade-creation.json`: three per product (normal trade, StepIn full, StepIn partial), mirroring `trade_creation.feature` of the E2E project. Before running them:

1. Copy the product `.dat` files into `data/` (`FX_CO.dat`, `FX_TRF.dat`, `FX_FSB.dat`); a case whose product has no file is skipped.
2. Put the values of the real system into `testdata/common.json` (counterparty, portfolio, direction) and `testdata/trade-creation.json` (old counterparty for StepIn).

To add a product, add its rows to `testdata/trade-creation.json` and put its `.dat` file in `data/`.

## QA: test data

Case data lives in `testdata/`, not in `config.local.json`:

```jsonc
// testdata/common.json: values shared by every case
{ "counterpartyName": "MOCK BANK A", "portfolioId": "ABS_CR_UK_ETFBB", "direction": "Buy" }

// testdata/trade-creation.json: one row per case
{
  "defaults": { "oldCounterpartyName": "MOCK BANK B" },
  "cases": [
    { "id": "TC-TRADE-CREATION-FX_TRF-UI-001", "product": "FX_TRF", "kind": "normal" },
    { "id": "TC-TRADE-CREATION-FX_TRF-UI-004", "product": "FX_TRF", "kind": "normal", "direction": "Sell" }
  ]
}
```

(The real files are plain JSON, without comments.)

- A row is completed with `defaults` of its file, then with `common.json`: **the row wins over `defaults`, `defaults` win over `common.json`**. So a value shared by everything is written once, and a case that needs something different just states it in its row.
- `id` is the case ID. The spec puts it in `[ ]` at the start of the test title (`[${data.id}] ...`) and never builds it from other fields; it is also the exported file name (`cases/<id>.json`) and must be unique in the file. The same scenario with other data is one more row.
- `loadCases<TradeCreationData>('trade-creation')` returns the completed rows; the spec loops over them and hands each row to the flow.
- In the flow, `const p = this.params(data)` turns the data into parameters. `p.counterpartyName` is recorded as `${param:counterpartyName}` and its value is written into the `params` block of the case file, so the PO sees it before the run and can change it for one run. Only the parameters a case really uses are written.
- Read a field directly (`data.product`, `data.kind`) when it decides **what the scenario does** (which steps, which file, which title). It is recorded as it is and the PO cannot change it.
- `testdata/` and the exported case files are committed, so they hold business values only. A value that must not be committed is written as a reference to local config, e.g. `"counterpartyName": "${cfg:tradeData.counterpartyName}"`; the PO is then asked for it like any other setting. Passwords never go here (the run fails if a test data value contains one).
- A missing value fails the case with the name of the field, e.g. `Test data "oldCounterpartyName" is not set`.

## QA: writing a new case

The framework follows the Page Object Model, in three layers. Each layer only calls the one below it:

| Layer | Where | Contains | Example |
|---|---|---|---|
| Case | `tests/*.spec.ts` | The scenario: which flows, in which order, with which data | `flows.tradeCreation.createTrade(data)` |
| Flow | `framework/flows/*.flow.ts` | Business steps: a Given / When / Then line of the report and the atomic operations behind it | `I book the trade and confirm` |
| Page / component | `framework/pages/`, `framework/components/` | Locators and **atomic operations**: one thing a user does (fill one field, click one button, pick one dropdown value) or one check | `newTrade.clickBook()` |

**1. Page / component: atomic operations.** Locators stay inside the class (`protected`); the outside only sees methods:

```ts
// framework/pages/trades.page.ts
export class TradesPage extends BasePage {
  static readonly path = '/trades';
  protected readonly searchBox: Target = { testId: 'trades-search-input', inner: 'input' };
  protected readonly firstRowId: Target = { testId: 'trades-row-trade-id', nth: 0 };

  async fillSearch(tradeId: Val) { await this.ui.fill(this.searchBox, tradeId); }
  async submitSearch() { await this.ui.press(this.searchBox, 'Enter'); }
  async expectFirstRow(tradeId: Val) { await this.ui.expectText(this.firstRowId, tradeId); }
}
```

A control used on several pages is a component (`framework/components/`) that a page exposes as a field, e.g. `readonly counterparty = new Combobox(this.ui, { testId: '...', inner: 'input' })`, used as `newTrade.counterparty.select(value)`. A new page is registered in `framework/app.ts` (`App`).

**2. Flow: business steps.** A flow method wraps atomic operations in the Given / When / Then line the PO reads in the report. Flows are grouped by business domain, one class per file (`auth.flow.ts`, `trades.flow.ts`, `trade-creation.flow.ts`); a new domain extends `BaseFlow` and is registered in `framework/flows/index.ts` (`Flows`), which makes it available as `flows.<domain>`:

```ts
// framework/flows/trades.flow.ts
export class TradesFlow extends BaseFlow {
  async searchTrade(tradeId: string, keyword: Keyword = 'When') {
    const { trades } = this.app;
    await this.ui[keyword]('I search for the trade', async () => {
      await trades.fillSearch(tradeId);        // becomes ${var:createdTradeId} automatically
      await trades.submitSearch();
    });
  }
}
```

A flow that needs case data takes it as one typed object and turns it into parameters (see "QA: test data"):

```ts
// framework/flows/trade-creation.flow.ts
async createTrade(data: TradeCreationData): Promise<string> {
  const { product, kind } = data;   // decide the scenario: recorded as they are
  const p = this.params(data);      // everything else: recorded as ${param:name}
  ...
  await newTrade.counterparty.select(p.counterpartyName);
  await newTrade.productId.select(product);
```

**3. Case: the scenario.** A case uses the `flows` fixture and nothing else; its data comes from `testdata/`, one case per row:

```ts
for (const data of loadCases<TradeCreationData>('trade-search')) {
  test(`[${data.id}] Checker finds a new ${data.product} trade`, async ({ flows }) => {
    await flows.auth.login('maker');                              // Given I log in as maker
    const tradeId = await flows.tradeCreation.createTrade(data); // When I open the New Trade form ... And I book the trade and confirm
    await flows.tradeCreation.expectPendingApproval(tradeId);    // Then the trade is created with pending approval status
    await flows.auth.login('checker', 'And');                     // And I log in as checker
    await flows.trades.searchTrade(tradeId);                      // When I search for the trade
    await flows.trades.expectListedFirst(tradeId);                // Then the trade is listed first
  });
}
```

Key points:

- Cases hold no locators, no `ui.xxx` and no page calls: only flows and data. Flows hold no locators and no `ui.click / ui.fill`: only page / component operations. Pages and components hold no Given / When / Then and no multi-step sequences.
- An action flow does not assert its own outcome: `createTrade` ends at the confirmed booking and returns the trade ID, and the case states the expected result with a separate `expect...` flow (the `Then`). This keeps the scenario readable in the case and lets another case expect something else after the same action.
- Each flow has a default keyword (`login` is `Given`); pass another one when the step sits elsewhere in the scenario (`flows.auth.login('checker', 'And')`).
- Inside a page or component every action goes through `this.ui.xxx`. Do not call `page` directly, or the action will not be recorded.
- The case ID in `[ ]` at the start of the title sets the exported file name (a title without one can use an `@case:xxx` tag instead). The test title is shown as the **Scenario**, and each `ui.Given / When / Then / And / But('...', ...)` group (written in the flow layer) becomes one line of it in the PO's run log and report, so write them as business-readable sentences.
- A value read with `ui.read()` is **turned into a variable automatically** when it is used later, so the PO's replay uses the freshly generated value.
- Use `cfg('accounts.maker.password')` for accounts and passwords; even a password typed in plain text by mistake is replaced with a config reference on export.
- Case data does not go into `config.local.json`: put it in `testdata/` and use it through `this.params(data)` in the flow.
- OREO inputs are web components and the real `<input>` sits in the shadow DOM, so input targets need `inner: 'input'`; buttons can be clicked on the host element directly.
- In a page or component, `ui.upload(target, 'data/FX_TRF.dat')` uploads a file from `data/`; `ui.clickAndCapture(target, { url, method, field, saveAs })` clicks and reads a value out of the response the click triggers (for example the new trade ID), which then behaves like a value from `ui.read()`.
- Text fields of a target can be a parameter or a config reference too: `{ role: 'menuitem', name: p.direction }`.
- Only **passing** cases are exported.

## Packaging for the PO

```bash
npm run build:portable                    # copies your local node.exe, no internet needed
npm run build:portable -- --with-config   # include your baseUrl and accounts (passwords are stripped)
npm run build:portable -- --no-zip        # produce the folder only, no zip
```

This produces `dist/UAT-Runner.zip`; put it on the shared drive. After that, only newly exported `cases/*.json` files need to be sent to the PO, who drops them into their `cases` folder (plus any new file under `data/` that a case uploads). `testdata/` is not part of the package: a case file carries the data it uses.

Case files with case data are format version 2 and need a runner built from this version or later; an older runner must be replaced with a new package. Version 1 files (cases without case data) run on both.

## PO: how to use it

1. Unzip `UAT-Runner.zip` (nothing needs to be installed).
2. Double-click **run-case.bat**, type a number and press Enter; or drag a case `.json` onto the bat file.
3. The runner shows the system address and account it is about to use. Press Enter to continue, or type `C` to switch to another environment or account for this run (the password is then asked for again). Anything missing, such as the password, is prompted for. After typing in an address or account, the runner offers to save it to `config.local.json` for next time; passwords are never saved.
   If the case comes with **case data** (counterparty, portfolio...), it is listed there too. Type `D` to change a value for this run, e.g. to book against another counterparty; `CD` changes both settings and data. The case file itself is not modified, and the report shows the data the run used and marks what was changed.
4. Press Enter to run, or type `S` to run **step by step**: the run then stops after each Given / When / Then block until you press Enter.
5. Edge opens and runs the steps. To pause at any moment, click the black console window and press `P`: the run stops once the current step has finished, and Enter resumes it. The browser stays open while paused; clicking around in it by hand may make the remaining steps fail.
6. When it finishes, the report opens automatically. It reads as the scenario: one row per Given / When / Then step with its result and a screenshot (pauses and their length are shown too); click "N actions" under a step to see the individual actions behind it.
7. The console and the bottom of the report give two links: **Report** (the report as a URL) and **Full replay** (Playwright's trace viewer for this run: every action with before / after snapshots, console and network). They are `http://127.0.0.1:9400/...` addresses served by the runner itself, so they work only on this computer and only while the runner window stays open (press Enter in it to close).
8. To open an earlier run later, double-click **view-trace.bat**: it opens a page listing every run with its Report and Full replay links.
9. If something goes wrong, send the matching folder under `evidence/` to QA; they can drop it into their own `evidence/` folder and open it the same way.

## PO: recording a bug by hand

When something goes wrong outside a case, the PO can record what they do instead of describing it:

1. Double-click **record-session.bat** and optionally type one line about the problem.
2. Edge opens on the system address. Log in and work as usual; the console lists each click and each value entered as it is recorded.
3. When done, press Enter in the console window (or close the browser window).
4. A report opens: the actions done by hand, each with the time, page and a screenshot, plus the **Full replay** link (trace viewer: page snapshots, console and network of the whole session).
5. Send the `evidence/recording_<time>/` folder to QA.

Notes:

- Password fields are shown as `******` in the report, but `trace.zip` records the page and network traffic as they are, **including the password that was typed**. Share the folder only inside the team, never on a public site.
- Clicks, values entered and the Enter key are listed; scrolling, hovering and drag and drop are not, although they are still visible in the trace's screen recording.
- A recording is evidence, not a case: it cannot be replayed by the runner. QA turns it into a case when it is worth repeating.
- QA can do the same locally with `npm run record`.

## Known limitations

- No video by default (recording depends on Playwright's ffmpeg, which usually cannot be downloaded on the intranet); per-step screenshots and the trace are enough to reproduce. If needed, set `"evidence": { "video": true }` in `config.local.json` and install ffmpeg manually.
- The report and trace viewer links are local (`127.0.0.1`), not shareable URLs; to show a run to someone else, send them the evidence folder. If port 9400 is taken, set `"evidence": { "viewPort": 9500 }` in `config.local.json`.
- To open Full replay in Playwright's official viewer instead of the bundled one, set `"evidence": { "traceViewer": "official" }` in `config.local.json`; the link then points to `https://trace.playwright.dev/?trace=...`. That site does not store traces: it runs in the browser and reads `trace.zip` from this computer, so the link still works only here and while the runner window is open, and it needs internet access to `trace.playwright.dev`.
- The PO's computer needs Edge (default) or Chrome (set `browser.channel` to `"chrome"`).
- The company must allow running `node.exe` and `.bat` from a shared drive or an unzipped folder; test on one PO machine first.
- The login page path defaults to `/`; if the real login page is elsewhere, change `LoginPage.path` in `framework/pages/login.page.ts`.
- A replay really operates in UAT (real bookings, real approvals); make sure the environment can take repeated runs.
