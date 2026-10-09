# OREO UAT Replay Tool (MVP)

QA runs a case locally with Playwright → once it passes, a **case file** (JSON) is exported automatically → the PO double-clicks the **portable runner** to replay it, really driving Edge on their own computer and producing an execution report with screenshots.

```
QA: npx playwright test  ──export──►  cases/TC-TRADE-CREATION-FX_TRF-UI-001.json
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
| `framework/components/` | Component objects: controls and regions shared by several pages (`TopBar`, `Combobox`, `ConfirmDialog`, `TradeChangeConfirmation`, `Toast`), atomic operations only |
| `framework/api/` | API objects: one class per API area (`TradesApi`), holding its requests and one atomic operation per request; used to prepare data a case needs, see "QA: preparing data through the API" |
| `framework/pages/` | Page objects: one class per page, holding its locators (by element name, see `elements/`) and its atomic operations |
| `framework/elements.ts` | `element('<name>')`: looks a locator up in `elements/` by the name the E2E project gives it |
| `framework/app.ts` | `App`: one instance of every page and shared component, each created on first use |
| `framework/ui.ts` | Action wrapper: execute + record, handles dynamic values, case data and passwords automatically |
| `framework/data.ts` | Reads `testdata/<name>.json` and finds the row of a case ID (behind the `testData` fixture) |
| `framework/fixtures.ts` | Provides `flows`, `app` and `ui` to every test; exports to `cases/` automatically after a test passes |
| `framework/flows/` | Flow layer: business steps reported as Given / When / Then, composed from atomic operations; one file per business domain (`auth`, `trades`, `tradeCreation`, `tradeProvisioning`, `tradeCancellation`) |
| `tests/` | Test cases, one spec per lifecycle event: `trade-creation.spec.ts` (normal / StepIn full / StepIn partial, each for the products that support it), `trade-cancellation.spec.ts`; `support.ts` holds what the specs share |
| `testdata/` | Case data: `common.json` (values shared by all cases) and one `<name>.json` per spec. QA side only; the values a case uses are copied into its case file |
| `elements/` | Element locators, a copy of `src/test/resources/elements` of the E2E project (`pages/`, `components/`). Refreshed with `npm run sync:elements`, never edited here. QA side only |
| `data/` | Files the cases upload (one `.dat` per product); shipped to the PO with the package |
| `runner/runner.js` | PO-side runner |
| `portable/run-case.bat` | The launcher the PO double-clicks |
| `portable/record-session.bat` | Records a manual session (no case): the PO works by hand with the trace on, e.g. to report a bug |
| `portable/view-trace.bat` | Opens the list of earlier runs with their report and trace viewer links |
| `scripts/build-portable.js` | Builds the portable runner |
| `scripts/sync-elements.js` | Refreshes `elements/` from the E2E project and checks it against the page objects |
| `mock-oreo/` | Mock OREO pages, for local demos only |
| `.claude/skills/porting-java-e2e-cases/` | Claude Code skill: implements a case of the E2E project here, see "QA: porting a case from the E2E project" |

## QA: first-time setup

```bash
npm install                            # uses the local Edge, no browser download
copy config.local.example.json config.local.json
```

Edit `config.local.json`: fill in `baseUrl` (the real server address), `apiBaseUrl` (the address of the API, which is not the pages' address; only cases that call the API need it) and the account and password for each role. The file is in `.gitignore` and is never committed.

```bash
npx playwright test                    # run every case; passing ones are exported to cases/
npx playwright test --headed           # watch the browser while it runs
npm run replay                         # replay with the runner, exactly what the PO sees
```

> To try it without the real system: `npm run mock` starts the mock pages; set `baseUrl` and `apiBaseUrl` to `http://localhost:4173` and the maker password to `maker1`. The values in `testdata/` are those of the real system; the mock offers them too. The mock's header comment says which of its testids are real and which are only its own guess.

### Trade creation cases

`tests/trade-creation.spec.ts` has four tests (normal trade, StepIn full, StepIn partial, normal trade with direction Sell), each run for its own list of products, since not every product supports StepIn, mirroring `trade_creation.feature` of the E2E project. Before running them:

1. Copy the product `.dat` files into `data/` (`FX_PSCRIPT.dat`, `FX_TRF.dat`, `FX_PSCRIPT_FSKO.dat`); a case whose product has no file is skipped.
2. Check the values in `testdata/common.json` (counterparty, portfolio, direction) and `testdata/trade-creation.json` (old counterparty for StepIn).

To add a product, add one line to the registry in `framework/products.ts` with the capabilities it supports (`create`, `stepInFull`, `stepInPartial`) and put its `.dat` file in `data/`; the specs pick it up through `productsWith(...)`. To run everything of one product: `npx playwright test -g FX_TRF`.

### Trade cancellation cases

`tests/trade-cancellation.spec.ts` mirrors `trade_cancellation.feature`: one test per product with the `cancel` capability, `[TC-TRADE-CANCELLATION-<product>-UI-001]`. Its `Given a Live '<product>' trade exists in the blotter` is not done in the browser: the trade is submitted and approved **through the API** (see "QA: preparing data through the API"), and the cancellation itself is done in the trade portal. Before running it:

1. Set `apiBaseUrl` in `config.local.json` and make sure the `checker` account has its e-mail there (its password is not needed: the API takes no login).
2. Copy the product `.dat` files into `data/`, as for trade creation.
3. Run `npm run sync:elements -- <E2E project>`: the trade portal and confirmation dialog elements this case uses come from the E2E project's element files.
4. **Fill in `TradesApi.approve` in `framework/api/trades.api.ts`**: the request that approves a task was not available when this was written, so the case stops with a message saying so, before it creates anything.

Its data is in `testdata/trade-cancellation.json` (the trade that is created, the cancellation reason and comments). Parts of this case were written from what is known of the E2E project and still have to be checked on the real system; they are listed in `CLAUDE.md`, section 10.

## QA: test data

Case data lives in `testdata/`, not in `config.local.json`:

```jsonc
// testdata/common.json: values shared by every case
{ "counterpartyName": "10 AM NY", "portfolioId": "CM_OIL_CRU_OPT", "direction": "Buy" }

// testdata/trade-creation.json: values of this spec, and a row only for a case that needs something different
{
  "defaults": { "oldCounterpartyName": "10 AM JAK" },
  "cases": [
    { "id": "TC-TRADE-CREATION-FX_TRF-UI-004", "direction": "Sell" }
  ]
}
```

(The real files are plain JSON, without comments.)

- A case gets `common.json`, then `defaults` of its spec's file, then its own row: **the row wins over `defaults`, `defaults` win over `common.json`**. So a value shared by everything is written once. **A case that needs nothing different has no row at all** (only the Sell case has one); `cases`, `defaults` and even the file are optional.
- `id` is the full case ID. **The data is matched at run time**: a test title starts with its case ID in `[ ]` (the spec may build it, e.g. `[TC-TRADE-CREATION-${product}-UI-001]`), and the `testData` fixture looks that ID up in `testdata/<spec file name>.json` (`tests/trade-creation.spec.ts` → `testdata/trade-creation.json`). Take care with the spelling of an `id`: a row that matches no case is simply not used. The ID is also the exported file name (`cases/<id>.json`).
- In the test: `const data = testData<TradeCreationData>()`, then hand it to the flow.
- In the flow, `const p = this.params(data)` turns the data into parameters. `p.counterpartyName` is recorded as `${param:counterpartyName}` and its value is written into the `params` block of the case file, so the PO sees it before the run and can change it for one run. Only the parameters a case really uses are written.
- What decides **the scenario itself** (which steps, which file, which title: the product) stays in the spec and is passed to the flow as a plain argument; each scenario is its own test and its own flow (`createTrade`, `createStepInFullTrade`, `createStepInPartialTrade`). It is recorded as it is and the PO cannot change it.
- `testdata/` and the exported case files are committed, so they hold business values only. A value that must not be committed is written as a reference to local config, e.g. `"counterpartyName": "${cfg:tradeData.counterpartyName}"`; the PO is then asked for it like any other setting. Passwords never go here (the run fails if a test data value contains one).
- A missing value fails the case with the name of the field, e.g. `Test data "oldCounterpartyName" is not set`.

## QA: element locators

Locators are not written again in this project: they are the element files of the Java + Cucumber E2E project, copied as they are into `elements/` (same `pages/` and `components/` folders, same file names):

```json
[
  { "name": "new_trade.book_btn", "lookupDetails": { "findBy": "testId", "value": "create-trade-book-btn" } }
]
```

A page object or component refers to an element by that name: `element('new_trade.book_btn')`. The element files only know the control itself, so what is specific to how this project operates it is added at the place of use, e.g. the real `<input>` inside a web component: `element('new_trade.portfolio_select', { inner: 'input' })`.

To refresh `elements/` after the E2E project changed:

```bash
npm run sync:elements -- "C:\path\to\the-e2e-project"    # or set OREO_E2E_DIR once
npm run sync:elements                                      # no path: only checks elements/ against the page objects
```

- It copies every `*.json` under `src/test/resources/elements`, removes the ones that no longer exist there, and lists what was added / changed / removed. Then run the cases and commit `elements/`.
- It fails when a page object uses a name that is not defined (e.g. renamed in the E2E project), and it lists the testids that are still hand-written in `framework/` although an element defines them, with the `element('...')` to use instead.
- A wrong name also fails the case at run time, with the names that do exist for that page.
- Never edit `elements/` by hand: the next sync overwrites it. **A new element is added in the E2E project** and synced. Until it exists there, a hand-written `{ testId: '...' }` works as before.
- Only `findBy: testId` is supported so far. The sync reports any other kind it sees; supporting one is one line in `FIND_BY` of `framework/elements.ts`.
- The sync refuses to copy a file that seems to contain a server address. To try the element files of another folder without copying them, set `OREO_ELEMENTS_DIR`.
- The PO package is not affected: an exported case file already contains the resolved locators, so `elements/` is not packaged.

## QA: writing a new case

The framework follows the Page Object Model, in three layers. Each layer only calls the one below it:

| Layer | Where | Contains | Example |
|---|---|---|---|
| Case | `tests/*.spec.ts` | The scenario: which flows, in which order, with which data | `flows.tradeCreation.createTrade(product, data)` |
| Flow | `framework/flows/*.flow.ts` | Business steps: a Given / When / Then line of the report and the atomic operations behind it | `I book the trade and confirm` |
| Page / component | `framework/pages/`, `framework/components/` | Locators and **atomic operations**: one thing a user does (fill one field, click one button, pick one dropdown value) or one check | `newTrade.clickBook()` |

**1. Page / component: atomic operations.** Locators stay inside the class (`protected`); the outside only sees methods:

```ts
// framework/pages/trades.page.ts
export class TradesPage extends BasePage {
  static readonly path = '/trades';
  protected readonly searchInput = element('trade_portal.search_input', { inner: "input[part='input'], textarea[part='input']" });
  protected readonly allTradesBlotter = element('trade_portal.all_trade_blotter');

  // The first row of the blotter that shows this trade ID: the rows are only told apart by their text
  protected row(tradeId: Val): TargetIn {
    return { ...this.allTradesBlotter, inner: 'role=row', hasText: tradeId, nth: 0 };
  }

  async searchTrade(tradeId: Val) { await this.ui.fill(this.searchInput, tradeId); }
  async openActionMenu(tradeId: Val) { await this.ui.rightClick(this.row(tradeId)); }   // the action menu is a context menu
}
```

A control used on several pages is a component (`framework/components/`), e.g. `new Combobox(this.ui, element('...', { inner: 'input' })).select(value)`.

A form with many fields is a table instead of one operation per field: `NewTradePage.fields` maps each field name to its element and kind of control (`combobox`, `text`), and `newTrade.setField(name, value)` operates it according to the kind. **To support another New Trade field, add one line to that table and write its value in testdata** (in the case's row, or in `defaults` for every case): the create flows fill every optional field a case has a value for, in the order of the table, in one `And I fill the optional fields` step. A name in the data that is not in the table fails the case. Only a new kind of control needs new code. A new page is registered in `framework/app.ts` (`App`).

**2. Flow: business steps.** A flow method wraps atomic operations in the Given / When / Then line the PO reads in the report. Flows are grouped by business domain, one class per file (`auth.flow.ts`, `trades.flow.ts`, `trade-creation.flow.ts`); a new domain extends `BaseFlow` and is registered in `framework/flows/index.ts` (`Flows`), which makes it available as `flows.<domain>`:

```ts
// framework/flows/trades.flow.ts
export class TradesFlow extends BaseFlow {
  async openActionMenu(tradeId: string, keyword: Keyword = 'When') {
    const { trades } = this.app;
    await this.ui[keyword]('I search for the trade and open its action menu', async () => {
      await trades.searchTrade(tradeId);       // becomes ${var:createdTradeId} automatically
      await trades.openActionMenu(tradeId);
    });
  }
}
```

A flow that needs case data takes it as one typed object and turns it into parameters (see "QA: test data"):

```ts
// framework/flows/trade-creation.flow.ts
private async selectBasicInfo(product: string, data: TradeCreationData) {
  const p = this.params(data);      // case data: recorded as ${param:name}; the product is recorded as it is
  ...
  await newTrade.setField('counterpartyName', p.counterpartyName);
  await newTrade.setField('productId', product);
```

**3. Case: the scenario.** A case uses the `flows` fixture and nothing else; its data comes from `testdata/`, matched by the case ID in the title:

```ts
test('[TC-TRADE-SEARCH-FX_TRF-UI-001] Checker finds a new FX_TRF trade', async ({ flows, testData }) => {
  const data = testData<TradeCreationData>();                                      // shared values + row "TC-TRADE-SEARCH-FX_TRF-UI-001" of testdata/trade-search.json, if any
  await When('maker is logged in to the trade portal', () => flows.auth.login('maker'));   // the step as in the feature file
  const tradeId = await flows.tradeCreation.createTrade('FX_TRF', data);           // When I open the New Trade form ... And I book the trade and confirm
  await flows.tradeCreation.expectPendingApproval(tradeId);                        // Then the trade is created with pending approval status
  await flows.auth.login('checker', 'And');                                        // And I log in as checker
  await flows.trades.openActionMenu(tradeId);                                      // When I search for the trade and open its action menu
});
```

Key points:

- Cases hold no locators, no `ui.xxx` and no page calls: only flows and data. Flows hold no locators and no `ui.click / ui.fill`: only page / component operations. Pages and components hold no Given / When / Then and no multi-step sequences.
- An action flow does not assert its own outcome: `createTrade` ends at the confirmed booking and returns the trade ID, and the case states the expected result with a separate `expect...` flow (the `Then`). This keeps the scenario readable in the case and lets another case expect something else after the same action.
- **A case is written like the scenario of a feature file**: each line is `await Given / When / Then / And / But('step text', () => flows.<domain>.<step>(...))`, using the fixtures of the same names; the step returns what the flow returns (`const tradeId = await And("creates a new 'FX_TRF' trade", () => flows.tradeCreation.createTrade(product, data))`). That step is a row of the PO's report; the steps the flow opens inside it (`I open the New Trade form`, `I book the trade and confirm`, ...) are recorded as `substep` and shown as headings in the row's action list, like a feature step and the snippet behind it. A flow called outside any case step still reports its own steps as rows.
- Inside a page or component every action goes through `this.ui.xxx`. Do not call `page` directly, or the action will not be recorded.
- The case ID in `[ ]` at the start of the title sets the exported file name (a title without one can use an `@case:xxx` tag instead). The test title is shown as the **Scenario**, and each `ui.Given / When / Then / And / But('...', ...)` group (written in the flow layer) becomes one line of it in the PO's run log and report, so write them as business-readable sentences.
- A value read with `ui.read()` is **turned into a variable automatically** when it is used later, so the PO's replay uses the freshly generated value.
- Use `cfg('accounts.maker.password')` for accounts and passwords; even a password typed in plain text by mistake is replaced with a config reference on export.
- Case data does not go into `config.local.json`: put it in `testdata/` and use it through `this.params(data)` in the flow.
- OREO inputs are web components and the real `<input>` sits in the shadow DOM, so input targets need `inner: 'input'`; buttons can be clicked on the host element directly.
- In a page or component, `ui.upload(target, 'data/FX_TRF.dat')` uploads a file from `data/`; `ui.clickAndCapture(target, { url, method, field, saveAs })` clicks and reads a value out of the response the click triggers (for example the new trade ID), which then behaves like a value from `ui.read()`.
- Text fields of a target can be a parameter or a config reference too: `{ role: 'menuitem', name: p.direction }`.
- A target can be narrowed by the text it contains: `{ ...blotter, inner: 'role=row', hasText: tradeId, nth: 0 }` is the first row of the blotter that shows that trade ID (`inner`, then `hasText`, then `nth`). `hasText` matches a part of the text, so the ID `T12` also finds the row of `T123`: search for the trade first.
- `ui.rightClick(target)` clicks with the right mouse button, which opens a context menu such as the action menu of a blotter row.
- Only **passing** cases are exported.

## QA: preparing data through the API

A case that works on an existing trade (cancel, approve, step in...) does not have to book that trade through the UI first: a step can call the system's API, and the call is recorded in the case file like any other step, so the PO's replay creates its own trade.

```ts
// framework/api/trades.api.ts: the request and one atomic operation for it
export class TradesApi extends BaseApi {
  static readonly submit: ApiRequest = { method: 'POST', path: '/api/v1/trades/create?tradeAction=SUBMIT' };

  async submitTrade(role: string, basic: TradeBasic, file: string) {
    const saved = await this.ui.api({
      ...TradesApi.submit,
      headers: this.as(role),                                    // X-User-Id: that role's e-mail from the local config
      multipart: { trade: { json: { basic } }, datFile: { file } },
      save: { createdTradeId: 'data.trade.id', createdTaskId: 'data.checkerContext.taskId' },
    });
    return { tradeId: saved.createdTradeId, taskId: saved.createdTaskId };
  }
}
```

- API objects are the same layer as pages and components: they hold the requests (path, method, fields of the response) and one operation per request, built on `this.ui.api(...)`. A flow composes them into a business step (`flows.tradeProvisioning.provisionLiveTrade(product, data)`); a case never calls them. A new API object extends `BaseApi` and is registered in `App`.
- **The API has no login**: a request only says who sends it, with that user's e-mail in the `X-User-Id` header. `this.as('maker')` writes it as a reference to `accounts.maker.email`, so the e-mail is never in the case file.
- `path` is always relative; the address is `apiBaseUrl` in `config.local.json` (the API is not on the pages' address). A full address in a path is refused.
- `save` keeps fields of the JSON response as variables. Used later, on a page or in another API call, they become `${var:createdTradeId}` by themselves, like a value from `ui.read()`.
- A text inside `headers`, `body` or a JSON part can be a parameter or a config reference (`p.counterpartyName`, `cfg(...)`). A number is recorded as it is, since a parameter is always text: the PO cannot change it for a run.
- A file part is a file under `data/` (`{ file: 'data/FX_TRF.dat' }`), like an upload.
- The request is sent with Playwright's own request client (`page.request`), from Node, not by the page: there is no screenshot for it, and the report shows the call and the values it saved. Any answer other than 2xx fails the step with the status and the start of the response.
- Use it for preparing data only. What the case is about (the `When` and the `Then`) stays in the browser, or the PO's replay would show nothing.

## QA: porting a case from the E2E project

A case that already exists in the Java + Cucumber E2E project does not have to be rewritten by hand: the Claude Code skill in `.claude/skills/porting-java-e2e-cases/` implements it here. Open this project in Claude Code and ask for it, or call the skill directly:

```
/porting-java-e2e-cases C:\path\to\the-e2e-project src\test\resources\features\ui\trading\trade_cancellation.feature
```

A third argument limits it to one case ID; the project path can also come from `OREO_E2E_DIR`.

The two projects have the same layers, so the skill translates level by level:

| E2E project | This project |
|---|---|
| Feature step | The case's step, with the same text |
| FLOW snippet | Flow method; its lines become the substeps |
| PAGE / COMPONENT snippet, built-in or Java step | Atomic operation of a page / component |
| Element key | `element('<same key>')`, after `npm run sync:elements` |
| Stored variable | `testdata/`, or the value a flow returns (a captured trade ID) |

- It syncs `elements/` first, reuses the flows and operations that exist, and ends with a report per case ID: ported and passed, ported but not run, or not ported and why.
- It stops instead of guessing: a step that is neither a browser action nor an API call whose request is fully known (a database check, a file check), an element that is not defined or not found by testid, or a control this project cannot operate yet leaves the whole scenario unported, with what is needed. It never invents an element name, a testid, a data value or an API request.
- It does not commit. Review the changes, run the cases against UAT (every run books real trades) and commit them yourself.

## Packaging for the PO

```bash
npm run build:portable                    # copies your local node.exe, no internet needed
npm run build:portable -- --with-config   # include your baseUrl and accounts (passwords are stripped)
npm run build:portable -- --no-zip        # produce the folder only, no zip
```

This produces `dist/UAT-Runner.zip`; put it on the shared drive. After that, only newly exported `cases/*.json` files need to be sent to the PO, who drops them into their `cases` folder (plus any new file under `data/` that a case uploads). `testdata/` is not part of the package: a case file carries the data it uses.

A case file is written in the lowest format version that can express it, and a runner refuses a file newer than itself with a message asking for the current package:

| Version | The case uses | Runs on |
|---|---|---|
| 1 | Steps only | Every runner |
| 2 | Case data (`params`) | A runner built since case data was added |
| 3 | A right-click, or a target narrowed with `hasText` (any case that works on a blotter row) | A runner built since those were added |
| 4 | An API call (any case that prepares its trade through the API) | A runner built from this version or later: send the PO a new package |

## PO: how to use it

1. Unzip `UAT-Runner.zip` (nothing needs to be installed).
2. Double-click **run-case.bat**, type a number and press Enter; or drag a case `.json` onto the bat file.
3. The runner shows the system address and account it is about to use. Press Enter to continue, or type `C` to switch to another environment or account for this run (the password is then asked for again). Anything missing, such as the password, is prompted for. After typing in an address or account, the runner offers to save it to `config.local.json` for next time; passwords are never saved.
   If the case comes with **case data** (counterparty, portfolio...), it is listed there too. Type `D` to change a value for this run, e.g. to book against another counterparty; `CD` changes both settings and data. The case file itself is not modified, and the report shows the data the run used and marks what was changed.
   A case that prepares its data through the API also needs the **API address** (`apiBaseUrl`); it is shown, asked for and saved like the system address.
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
- A replay really operates in UAT (real bookings, real approvals); make sure the environment can take repeated runs. A case with API steps creates a new trade on every replay.
- An API step has no screenshot: the report shows the call and the values it saved (e.g. the new trade ID), and the following steps show the result in the browser.
- API calls are sent from Node, not from Edge, so they do not use the certificates Windows trusts. If the API address is `https` with a company certificate and the call fails with a certificate error, tell QA: this is not handled yet.
