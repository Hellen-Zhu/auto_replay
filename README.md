# OREO UAT Replay Tool

QA runs a case locally with Playwright → once it passes, a **case file** (JSON) is exported automatically → the PO double-clicks the **portable runner** to replay it, really driving Edge on their own computer and producing a report with screenshots.

```
QA: npx playwright test  ──export──►  cases/trade-creation/TC-TRADE-CREATION-FX_TRF-UI-001.json
                                          │ put on the shared drive
PO: double-click run-case.bat → pick a case, or tick several → Edge opens and runs → evidence/xxx/report.html
```

A case file contains **no server address and no password**. Two kinds of data are kept apart:

| | Environment | Case data |
|---|---|---|
| What | Server address, accounts, passwords | What a case types or selects: counterparty, portfolio, product... |
| Where | `config.local.json` on each computer, never committed | `testdata/*.json`, committed |
| In the case file | `${cfg:accounts.maker.email}` (a reference, no value) | `${param:counterpartyName}` plus its value in `params` |
| For the PO | Asked for when missing; can be changed for a run | Comes with the case; can be changed for a run |

This file is the guide for using the project. Design decisions, the case file format, what is known of the OREO pages and what still has to be checked on the real system are in `CLAUDE.md`.

## Layout

| Path | Purpose |
|---|---|
| `tests/` | Cases, one spec per lifecycle event; `support.ts` holds what the specs share |
| `framework/flows/` | Business steps (Given / When / Then), one class per domain: `flows.<domain>.<step>()` |
| `framework/pages/`, `components/`, `api/` | Locators or requests, and atomic operations on them |
| `framework/ui.ts` | Executes each action and records it; `fixtures.ts` exports the case after a pass |
| `framework/products.ts` | Product registry: which product supports which kind of creation |
| `core/actions.js`, `core/lib/` | Execution core, shared by QA's run and the PO's replay. `actions.js` is the entry; the code is in the modules of `core/lib/` |
| `testdata/` | Case data: `common.json`, `shared/`, one `<spec name>.json` per spec |
| `testdata/dat/<PRODUCT>/` | The dat files cases upload or send; shipped to the PO |
| `elements/` | Element locators, a copy of the E2E project's; never edited here |
| `cases/<spec name>/` | Exported case files |
| `requests/` | The API requests the case files name (a case file holds only `"ref"` for each); written by the export. The package gets only the files its cases name: earlier versions of a changed request stay out |
| `runner/`, `portable/*.bat` | The PO's runner and its launchers |
| `scripts/` | `build-portable`, `sync-elements` |
| `mock-oreo/` | Mock OREO, for local tries only |
| `.claude/skills/porting-java-e2e-cases/` | Claude Code skill that ports a case of the E2E project |

## QA: setup and running

```bash
npm install                                        # uses the local Edge, no browser download
copy config.local.example.json config.local.json
```

Fill in `config.local.json` (it is in `.gitignore`):

- `baseUrl`: the address of the pages.
- `apiBaseUrl`: the address of the API **including the prefix its requests share** (`https://<api host>/api/v1`). It is not the pages' address.
- `accounts.<role>`: e-mail and password of the maker and the checker.
- `riskEngine`: `"real"` (default) waits for the system's risk calculation, up to `timeouts.response` (60 s); `"mock"` answers it in the browser, so a case does not fail because the risk engine is slow or down. For QA's run only: the PO's runner always uses `real`.

```bash
npx playwright test               # run every case; passing ones are exported to cases/<spec name>/
npx playwright test --headed      # watch the browser
npx playwright test -g FX_TRF     # only the cases whose title matches
npx playwright test --workers=4   # 4 cases at a time (default: half the CPU cores; --workers=1 for one at a time)
npm run replay                    # replay with the runner, as the PO sees it
npm run record                    # record a manual session
npm run mock                      # the mock OREO on http://localhost:4173
npx tsc -p .                      # type check
```

- Before the first run: copy the dat files to `testdata/dat/<PRODUCT>/<PRODUCT>.dat` (variants of a product go into the same folder under their own names) and run `npm run sync:elements -- <E2E project>`. A case whose dat file is missing is skipped.
- Cases do not depend on each other, so they can run side by side. On the real system every case logs in with the same account: start with 2 or 3 workers.
- To try without the real system: `npm run mock`, then `baseUrl` = `http://localhost:4173`, `apiBaseUrl` = `http://localhost:4173/api/v1`, maker password `maker1`. `MOCK_RISK_ENGINE=down npm run mock` makes its risk calculation fail, to see what `riskEngine` does.

## The cases

| Spec (`tests/<name>.spec.ts`) | Case IDs | What |
|---|---|---|
| `trade-creation` | `TC-TRADE-CREATION-<PRODUCT>-UI-001` to `-003` | Maker creates a normal / StepIn full / StepIn partial trade, per product that supports it |
| | `TC-TRADE-CREATION-UI-004` | The same for a product and dat file chosen as case data |
| `trade-approval-reject` | `TC-TRADE-APPROVE-CREATION-UI-001` / `-002`, `TC-TRADE-REJECT-CREATION-UI-001` / `-002` | Checker approves or rejects a pending new trade (normal, StepIn full, StepIn partial) |
| `trade-cancellation` | `TC-TRADE-CANCELLATION-UI-001` | Maker cancels a live trade; pending checker approval |
| `trade-allocation` | `TC-TRADE-ALLOCATION-UI-001` | Maker allocates to 2, 3 or 4 subtrades: the case data `allocationWays`, chosen in the runner |
| `trade-early-termination`, `trade-partial-termination`, `trade-novation-remaining`, `trade-step-out-full`, `trade-step-out-partial`, `trade-portfolio-reassignment`, `trade-partial-novation-remaining` | `TC-TRADE-<EVENT>-UI-001` | Maker triggers the event from the trade's action menu |
| `trade-amendment` | `TC-TRADE-AMENDMENT-UI-002` | Maker amends the field named by the case data `amendmentField` (`Counterparty` or `Risk Portfolio`, chosen in the runner); pending checker approval |

How the cases are cut:

- **Minimal coverage.** A case is repeated per product only where the product changes what is tested (creation). Everything else runs for one product, with one case per kind of trade or outcome.
- **The product and its dat file are case data** (`product`, `datFile`) in every case that is not repeated per product, so the PO runs it for another product by changing them before the run. A variation in data only (direction Sell, another counterparty, another dat file) is never a case of its own.
- **A case logs in once.** What the other role did before is the `Given`, prepared through the API: a lifecycle event starts from a live trade that the maker submits and the checker approves through the API. Where no such request is known (a pending cancellation, a pending amendment), the maker's case ends at "pending checker approval".
- **Every case whose `Given` creates its trade can also run on a trade that already exists** (there are no separate existing-trade cases). Each such case has its own `"tradeId": ""` in its test data (an event changes its trade, so the next event may not be able to run on it; never commit a real trade ID). The trade ID comes from, in this order:
  1. the environment variable `OREO_TRADE_ID` (applies to every case of the run: set it for one case at a time);
  2. `tradeId` of the case data;
  3. when both are empty, the case creates the trade through the API, as before.

  The exported case file is the same whichever source the run took: it holds the API steps that create the trade, run only while `tradeId` is empty, and `tradeId` is empty. In the runner the PO leaves `tradeId` empty (the case creates its trade, also in a batch) or changes it by its number to an existing trade's ID (the creating steps are then "not needed"; `-` empties it again). Nothing checks that a given trade is in the state the case starts from: a wrong trade fails at the first step that needs that state.

  ```bash
  # PowerShell: $env:OREO_TRADE_ID = "<trade ID>"; npx playwright test -g "TC-TRADE-CANCELLATION-UI-001"
  OREO_TRADE_ID=<trade ID> npx playwright test -g "TC-TRADE-CANCELLATION-UI-001"
  ```

Not every case has been run on the real system, and some were never run at all: the status per event and what still has to be checked are in `CLAUDE.md`, section 10.

## QA: test data

```jsonc
// testdata/common.json: values shared by every case
{ "counterpartyName": "10 AM NY", "portfolioId": "CM_OIL_CRU_OPT", "direction": "Buy" }

// testdata/trade-creation.json: values of this spec, and a row only for a case that differs
{
  "defaults": { "oldCounterpartyName": "10 AM JAK" },
  "cases": [ { "id": "TC-TRADE-CREATION-UI-004", "product": "FX_TRF", "datFile": "FX_TRF.dat" } ]
}

// testdata/trade-cancellation.json: "use" takes a block several specs share (testdata/shared/given-trade.json)
{
  "use": ["given-trade"],
  "defaults": { "cancelReason": "DEALER_ERROR" }
}
```

(The real files are plain JSON, without comments, and may hold more values.)

- A case gets `common.json` → the blocks listed under `use` (`testdata/shared/<block>.json`, values several specs share) → `defaults` → its own row; the later one wins. Everything is optional, and **a case that needs nothing different has no row**.
- **Data is matched by case ID**: a test title starts with its ID in `[ ]`, and `testData<...>()` looks that ID up in `testdata/<spec file name>.json`. A row whose `id` matches no case is simply not used. The ID is also the exported file name.
- In the flow, `const p = this.params(data)`: `p.counterpartyName` is recorded as `${param:counterpartyName}` and its value goes into the `params` block of the case file. Only parameters a case really uses are written.
- What decides the scenario stays in the spec and is passed to the flow as a plain argument.
- **The trade a lifecycle event starts from** is described by `testdata/shared/given-trade.json`: `product`, `datFile` and `tradeType` (`Normal`, `StepInFull` or `StepInPartial`; a StepIn type sends the block's `oldCounterpartyName`, `oldCounterpartyFmId` and `novationDate` as the request's `udf` list). Change them there for every event, or in a spec's `defaults` / a case's row for that spec or case. The PO can change all three in the runner: the product and the dat file from what the package has, the trade type from the three values (the case file holds the `udf` list of both StepIn types and the runner sends the one of the chosen type, none for `Normal`), so the StepIn values must be in the test data whatever type QA runs.
- `testdata/` is committed: business values only. A value that must stay local is a reference, `"${cfg:tradeData.counterpartyName}"`. Passwords never go here.
- A missing value fails the case with the name of the field.

## QA: element locators

Locators are the element files of the Java + Cucumber E2E project, copied as they are into `elements/`:

```json
{ "name": "new_trade.book_btn", "lookupDetails": { "findBy": "testId", "value": "create-trade-book-btn" } }
```

A page or component uses an element by its name: `element('new_trade.book_btn')`. An element file names the web component; the real control inside it is added where it is used: `element('<name>', { inner: INNER_INPUT })` for every text field (filling the component itself fails with `Element is not an <input> ...`).

```bash
npm run sync:elements -- "C:\path\to\the-e2e-project"    # or set OREO_E2E_DIR once
npm run sync:elements                                      # no path: only checks elements/ against framework/
```

- The sync mirrors the files (added / changed / removed), fails on a name that `framework/` uses but no file defines, and lists hand-written testids that an element already defines.
- Never edit `elements/` by hand. **A new element is added in the E2E project** and synced; until then a hand-written `{ testId: '...' }` works.
- Only `findBy: testId` is supported so far.

## QA: writing a new case

Three layers, each calling only the one below:

| Layer | Where | Contains |
|---|---|---|
| Case | `tests/*.spec.ts` | The scenario's step lines and data; calls flows only |
| Flow | `framework/flows/*.flow.ts` | Business steps composed of atomic operations; no locators, no `ui.xxx` |
| Page / component / API object | `framework/pages/`, `components/`, `api/` | Locators or requests, and atomic operations built on `this.ui.xxx`; no sequences |

```ts
// tests/trade-cancellation.spec.ts (shortened)
test('[TC-TRADE-CANCELLATION-UI-001] Cancellation of a Live trade is pending checker approval after Maker submits it',
  async ({ flows, testData, Given, When, Then, And }) => {
    const { product, data } = givenProduct(flows, testData<TradeCancellationData>(), '...');
    const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
    await And('maker is logged in to the trade portal', () => flows.auth.login('maker'));
    await When('perform cancellation for the trade from trade portal', () => flows.tradeCancellation.cancelFromTradePortal(tradeId, data));
    await Then('the cancellation is submitted successfully', () => flows.tradeCancellation.expectSubmitted());
  });
```

- **A case reads like the feature file**: one `Given / When / Then / And / But('step text', () => flows...)` line per step. Each line is a row of the PO's report; the steps a flow opens inside it are shown as substeps.
- An action flow does not assert its outcome: the `Then` is a separate `expect...` flow called by the case.
- Every action goes through `this.ui.xxx`; a direct call on `page` is not recorded.
- A value a step produces (`ui.read`, a captured response, an API `save`) becomes a variable by itself when it is used later, so a replay uses its own trade ID. It is also printed (`createdTradeId = ...`) and shown in the report.
- The click that starts a risk calculation is `ui.clickAndAwait(target, RiskCalculation.forTrade(tradeId))`: it waits for the answer, or mocks it when `riskEngine` is `mock`.
- A form with many fields is a table: a new New Trade field is one line in `NewTradePage.fields` plus its value in testdata.
- New things have a fixed place: a page extends `BasePage` and is registered in `App`; a domain extends `BaseFlow` and is registered in `Flows`; a product is one line in `framework/products.ts` plus its dat file; a new lifecycle event is a spec, a flow that fills its dialog between `flows.lifecycleEvent.openAction` and `submit`, and a testdata file.
- Accounts and passwords are always `cfg('accounts.<role>....')`. Only **passing** cases are exported.

### Preparing data through the API

```ts
// framework/api/trades.api.ts (shortened)
static readonly submit: ApiRequest = { method: 'POST', path: '/trades/create?tradeAction=SUBMIT' };

async submitTrade(role: string, basic: TradeBasic, file: string) {
  const saved = await this.ui.api({
    ...TradesApi.submit,
    headers: this.as(role),                                    // X-User-Id: that role's e-mail from the local config
    multipart: { trade: { json: { basic } }, datFile: { file } },
    save: { createdTradeId: 'data.trade.id', createdTaskId: 'data.checkerContext.taskId' },
  });
  return { tradeId: saved.createdTradeId, taskId: saved.createdTaskId };
}
```

- The call is recorded like any other step, so the PO's replay creates its own trade. The case file holds only the name of the request (`{ "action": "api", "ref": "post-trades-create-..." }`); the request itself (path, headers, body, parts) is written to `requests/<ref>.json`, which the package carries. Send `requests/` along with case files whose requests are new or changed.
- An API object holds the requests and one operation per request; a flow composes them (`flows.tradeProvisioning.provisionLiveTrade`); a case never calls them.
- The API has no login: `this.as('maker')` sends that role's e-mail as `X-User-Id`, as a config reference.
- A path **starts after the prefix** that `apiBaseUrl` carries: `/trades/create`, never `/api/v1/trades/create`, never a full address. A request of the same server that is not under the prefix would be written with its whole path and `base: 'origin'`; no request needs it so far (the preference reset `/uc/api/user-preferences` is under the prefix).
- Every login (`flows.auth.login`) first resets the preferences of the account it logs in with (theme, formats, the blotters the trade portal shows) through the API, like the E2E project's before-scenario hook: the accounts are shared. So every case needs `apiBaseUrl`, and a replay by the PO resets that account too.
- Use it for the `Given` only: the `When` and the `Then` stay in the browser, or the replay shows nothing.

### Porting a case from the E2E project

```
/porting-java-e2e-cases C:\path\to\the-e2e-project src\test\resources\features\ui\trading\trade_cancellation.feature
```

The skill translates level by level (feature step → case step, FLOW snippet → flow method, PAGE / COMPONENT snippet → atomic operation, element key → `element('<same key>')`, API provisioning step → API object operation). It stops instead of guessing and never commits; review, run and commit yourself.

## Packaging for the PO

```bash
npm run build:portable                    # copies your local node.exe, no internet needed
npm run build:portable -- --with-config   # include your baseUrl and accounts (passwords are stripped)
npm run build:portable -- --no-zip        # the folder only
```

This produces `dist/UAT-Runner.zip`. Afterwards only newly exported case files have to be sent: the PO drops them into the package's `cases` folder (plus any new file under `testdata/dat/` and `requests/`).

**Build and send a new package whenever the case format or the runner changed.** A case file does not carry its format version, so an older runner cannot tell that a file is too new and fails at its first step. The current runner still runs older files.

## PO: how to use it

1. Unzip `UAT-Runner.zip`; nothing needs to be installed.
2. Double-click **run-case.bat** and choose a case with the keyboard (or drag a case `.json` onto the bat file, or drop it into the window that is already open and press Enter: the console types the path of the file, and a case file may be anywhere on the computer):

   ```
   Choose a case to run   (14 cases)

   > + [ ] trade-cancellation/   (3 cases)
     + [ ] trade-creation/   (11 cases)
   ```

   | Key | Does |
   |---|---|
   | Up / Down | Move the highlighted row |
   | Right / Left | Open / close a folder |
   | Enter | Open a folder, or run the case |
   | Typing | Search (a product, part of a case ID); Backspace deletes, Esc clears |
   | Space | Tick a case, or every case of a folder |
   | Ctrl+C | Close the window |

   In a very small window the runner shows a plain numbered list instead (also with the environment variable `OREO_PLAIN_MENU=1`).
3. The runner lists the settings (address, account) and the **case data** of the case, with `Run the case` highlighted below them. **Enter** starts the run; **Up / Down** move to a value and **Enter** changes it: a product or dat file is picked from a list in the same way, any other value is typed. In the plain numbered list (step 2) every line has a number instead: type it to change that value (several at once also work: `2 5`).
   - **Passwords are always typed in** (hidden), once per account and window. A password in `config.local.json` is not used, and none is ever saved.
   - A change of case data applies to this run only; the case file is not modified. A product or a dat file is chosen from the ones in the package.
   - A case that creates its trade first asks **which trade it runs on**: create a new one (through the API), or use an existing one (type its `tradeId`). With an existing trade the data and the account needed only to create a trade are not shown or asked for. The trade must be in the state the case starts from, and the run changes it.
   - A typed-in address or account can be saved to `config.local.json` for next time.
4. Edge opens and runs the steps. Press `P` in the console window to pause after the current step, Enter to resume; Ctrl+C stops the run.
5. The report opens: one row per Given / When / Then step with its result and screenshot, and the values the run produced (e.g. the ID of the trade it created). The console and the report also give two links: **Report** and **Full replay** (Playwright's trace viewer). They work on this computer only, while the runner window is open.
6. After a single case the browser stays open, so you can look at the result or go on by hand (that is not in the report). Press Enter to close it and choose the next case, or type `Q` to close the window.
7. **view-trace.bat** lists earlier runs with their links. If something goes wrong, send the run's folder under `evidence/` to QA.

### Running several cases

- Tick cases with Space and press Enter, or drag a folder or several case files onto run-case.bat. A folder of cases can also be dropped into the open window (one file or one folder per drop), then Enter.
- The settings are asked for once; case data cannot be changed (run a case on its own for that).
- Then choose: **Enter** = one after another; **a number** (2 to 8) = that many at the same time, each in its own Edge window. Running at the same time logs the same account in from several browsers: start with 2.
- A case that cannot be run (it needs a newer runner, a data file is missing, it needs a trade ID) is left out and listed.
- At the end a summary opens (`evidence/batch_<time>/report.html`): one row per case with its result, values and links.

### Recording a bug by hand

1. Double-click **record-session.bat**; Edge opens on the system address.
2. Work as usual; the console lists each click and each value entered.
3. Press Enter in the console window (or close the browser). A report opens, with the Full replay link.
4. Send the `evidence/recording_<time>/` folder to QA.

A recording is evidence, not a case: it cannot be replayed. Password fields are masked in the report, but **`trace.zip` contains what was typed, the passwords included**: share the folder inside the team only, never on a public site.

## Known limitations

- A replay really operates in UAT: real bookings, real approvals. A case with API steps creates a new trade on every replay.
- The PO's computer needs Edge (default) or Chrome (`browser.channel`: `"chrome"`), and the company must allow running `node.exe` and `.bat` from an unzipped folder. Test on one PO machine first.
- The runner's case list, running several cases at the same time and the browser that stays open were verified on macOS against the mock only, not on Windows / Edge.
- No video by default: it needs Playwright's ffmpeg, which cannot be downloaded on the intranet. Screenshots and the trace are enough to reproduce.
- The report and trace viewer links are local (`127.0.0.1:9400`; another port: `"evidence": { "viewPort": 9500 }`). To show a run to someone else, send the evidence folder.
- An API step has no screenshot: the report shows the call and the values it saved. API calls are sent from Node, which does not use the certificates Windows trusts: an `https` API with a company certificate may fail, which is not handled yet.
- With `"riskEngine": "mock"` the risk calculation is not sent at all, so such a run does not prove the risk engine works; the report says so.
