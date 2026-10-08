# OREO UAT Replay - Project Handover Notes

> Context file for Claude Code. It is read automatically when this project is opened.

## 1. Background and goal

- Project: UAT testing of OREO, a bank-internal system managing the full lifecycle of non-flow FX structured products (TARF, DCD, KO Forward, etc.).
- Role: the user is QA.
- Goal: **QA runs a case locally with Playwright → a "case file" (JSON) is exported automatically → the PO, without writing code or installing anything, double-clicks to really replay that case in the browser on their own computer, to reproduce issues or repeat acceptance.**
- Current status: **the MVP is complete and verified** (log in → land on the Trades page → verify the top-right corner shows the current user), end to end on the mock pages and triggered successfully on the company machine. Next: connect to the real system and add business cases.

## 2. Key decisions already made (do not overturn lightly)

| Decision | Reason |
|---|---|
| Use Playwright (cases in TypeScript, runner in plain JS) | Best locators, auto-waiting and trace capability |
| Export **JSON step data**, not code | The PO runs data only: safe and easy to audit; waits, screenshots, browser, etc. are controlled centrally by the runner |
| **QA runs and PO replays share `core/actions.js`** | Guarantees "what ran when it was recorded is exactly what runs on replay" |
| Record at the "action layer" instead of recording mouse clicks | The system is stateful (trade IDs differ every time); click recordings cannot be re-run |
| Server address, accounts and passwords live only in `config.local.json` | Never in code, case files or Git (the real IP seen in screenshot URLs must not appear in the repo) |
| **Case data lives in `testdata/*.json`** (committed) and travels inside the case file as `params` | Different cases need different parameters, so they cannot all sit in one config file; the PO gets the data with the case and can change it for a run. Config is for the environment only |
| The PO side is a **portable folder**: portable `node.exe` + `runner` + `@playwright/test` | The PO cannot install software; uses the machine's own **Edge** (`channel: msedge`), no browser download |
| **No video** by default | Video depends on Playwright's ffmpeg; the company intranet cannot resolve `cdn.playwright.dev`, so the download fails |
| Packaging **copies the local node.exe** instead of downloading Node | The company intranet cannot reach nodejs.org |
| Locators **prefer `data-testid`** | Explicit user requirement; developers already provide testids on key controls |
| **Locators are the E2E project's element JSON**, copied as it is into `elements/` and used by name: `element('new_trade.book_btn')` | Explicit user requirement: do not convert the Java project's locators one by one; a locator is maintained in one place |
| **English only** across the repo | Explicit user requirement: no Chinese in code, comments, messages, file names, docs or case files |
| Rejected approaches | Intranet server + live noVNC view (user found it too complex); packaging as a Java jar; pure click record-and-replay |

## 3. Architecture

```
QA:  tests/*.spec.ts ─► framework/flows/   ─► framework/pages + components ──ui.xxx──► framework/ui.ts (execute + record)
     (case: scenario)   (flow: BDD steps)      (locators + atomic operations)       │ calls
                                                                                    ▼
                                                                              core/actions.js  ◄── shared execution core
                                                                                    ▲
PO:  run-case.bat → runner/runner.js ──reads cases/*.json, calls step by step──────┘
```

- Page Object Model in three layers, each calling only the one below (QA side only; the case format and the runner know nothing about it). **Page / component** (`framework/pages`, `framework/components`): owns locators as `protected readonly` fields and exposes atomic operations built on `this.ui.xxx` (one field, one button, one dropdown value, one check); a page exposes the components it contains as public fields (`newTrade.confirmDialog.confirm()`); a form with many fields is a table plus one generic operation (`newTrade.setField(name, v)`). **Flow** (`framework/flows`, one class per business domain extending `BaseFlow`, reached through the `flows` fixture as `flows.<domain>.<step>()`): business steps, i.e. the Given / When / Then groups and the atomic operations inside them; each takes an optional keyword. **Case** (`tests/`): only the scenario's steps, each wrapping `flows.<domain>.xxx(...)` calls, and data. `App` (`framework/app.ts`, the `app` fixture) holds one instance of every page and of `TopBar`. The refactoring was verified by exporting all ten cases on the mock before and after: the steps are identical.

- Data-driven cases (QA side): `testdata/common.json` is a flat object shared by all files; `testdata/<name>.json` is `{ "defaults": {...}, "cases": [ { "id": ..., ... } ] }`, all optional. A case is merged common → defaults → row (the row wins). **Data is matched at run time by case ID** (explicit user requirement): a test title starts with its case ID in `[ ]`, which the spec may build (`[TC-TRADE-CREATION-${product}-UI-001]`); the row `id` in testdata is the full ID (`TC-TRADE-CREATION-FX_TRF-UI-001`); the `testData` fixture (`const data = testData<TradeCreationData>()`) looks the title's ID up in `testdata/<spec file name>.json`. A row exists only for a case whose values differ from the shared ones (explicit user requirement: no rows that hold nothing but an id); without a row the case gets common + defaults. Do not generate the cases by looping over the testdata rows. The case hands the data to the flow. In the flow `const p = this.params(data)`: `p.xxx` is recorded as `${param:xxx}` and its value is written to the `params` block of the case file (only parameters that are used, in order of first use); what decides the scenario (the product) stays in the spec, is passed to the flow as a plain argument and is recorded literally. Pages and components are unaffected: their operations take a `Val`.
- Element locators (QA side): `elements/` mirrors `src/test/resources/elements` of the Java + Cucumber E2E project, with the same two folders (`pages/`, `components/`) and file names; each file is a list of `{ "name": "new_trade.book_btn", "lookupDetails": { "findBy": "testId", "value": "create-trade-book-btn" } }`. `element(name, extra?)` (`framework/elements.ts`) turns a name into a `Target`; `extra` (`inner`, `nth`, `exact`) adds what the element files do not know, above all `{ inner: 'input' }`, since they only locate the host of a control. Files are read once, on first use; an unknown name, a name defined differently in two files or an unsupported `findBy` (only `testId` so far, `FIND_BY`) fails the case with a clear message, and only for elements that are really used. `npm run sync:elements -- <E2E project>` (or `OREO_E2E_DIR`) mirrors the files (added / changed / removed; it aborts without copying when a file seems to contain a server address) and then checks `elements/` against `framework/`: used names that are undefined fail it, hand-written testids that an element defines are listed with the `element('...')` to use. `OREO_ELEMENTS_DIR` points the loader at another folder. Nothing changes for the PO: a case file holds resolved targets and `elements/` is not packaged. No dynamic (placeholder) locators yet: the E2E project has none that are needed.
- After a test **passes**, `framework/fixtures.ts` exports `cases/<caseId>.json` automatically.
- The runner lists the cases under `cases/`; the PO types a number (plain Enter = the first one) or drags a json onto the bat.
- When settings are already provided, the runner shows them and lets the PO type `C` to change `baseUrl` and the non-secret account fields for that run only; changing the address or an account clears the matching saved password so it is asked for again. Afterwards the runner offers to save the typed-in address and account to `config.local.json` (default No); it never writes a password, only blanks one that no longer matches.
- A case with `params` gets a "Case data" list at the same prompt; `D` changes values for that run only (`CD` does both; the case file is never modified). The prompt text is unchanged for a case without params. The run's data goes to `result.json` (`caseData`, with `changedFrom` for a changed value) and to a "Case data" block in the report.
- Pausing is a runner-only feature (the case format has no pause action): before the run the PO can type `S` for step-by-step mode (stops before each titled group), and on a real console pressing `P` pauses after the current step; Enter resumes. Pauses only happen between steps, are recorded per step (`pausedSec`) and excluded from the reported duration. That prompt defaults to a normal run when input has ended, so older piped inputs keep working.
- Every replay produces `evidence/<caseId>_<timestamp>/`: `report.html` (one row per BDD step, i.e. per titled group, with its result and screenshot; the actions behind it are in a collapsed list, opened automatically for a failed step), `result.json` (still one entry per action), `step-XX.png` (one per action), `trace.zip`.
- Recording (`runner.js --record`, `record-session.bat`, `npm run record`): no case is run; the browser opens on `baseUrl` with tracing on and the PO works by hand, to report a bug. A trace only lists actions made through Playwright, so an init script in every page (`watchUserActions`) reports clicks, entered values and Enter through `exposeBinding`; each report becomes a `tracing.group(...)` entry with a screenshot inside it (which gives the trace a page snapshot) and a row in the report. Output is `evidence/recording_<timestamp>/` with `report.html`, `result.json` (`mode: "recording"`), `step-XX.png`, `trace.zip`. It ends on Enter or when the browser window is closed. It is evidence only: no case file is produced. Password fields and values equal to a configured secret are masked in the report; the trace still contains them.
- Links: the runner starts a local-only http server (`127.0.0.1`, port `evidence.viewPort` or `OREO_VIEW_PORT`, default 9400) that serves `/evidence/*` and Playwright's own trace viewer from `playwright-core/lib/vite/traceViewer` at `/trace/*`. The console and the report footer show the report URL and the "Full replay" trace viewer URL (`/trace/index.html?trace=<url of trace.zip>`). On a console the server lives until the PO presses Enter; with piped input the runner exits right away. `--view` (view-trace.bat) serves an index of all runs. `trace.playwright.dev` is opt-in (`evidence.traceViewer: "official"`, which also turns on CORS for `/evidence/*`), because the intranet probably cannot reach it; it has no upload feature, it only reads the local `trace.zip` through `?trace=`. Never upload a trace.zip to a public host: it contains the server address, screenshots, network traffic and typed passwords.

## 4. Layout and responsibilities

| Path | Responsibility |
|---|---|
| `core/actions.js` | Execution core: `FORMAT_VERSION`, `resolveTarget`, `resolveValue` (placeholders), `showPlaceholders`, `executeStep`, `describeStep`. **Keep it CommonJS and dependent only on `@playwright/test`** (it is bundled into the runner) |
| `core/config.js` | Reads `config.local.json` (overridable with `OREO_UAT_CONFIG` / `OREO_BASE_URL`), `launchOptions`, `secretEntries` |
| `framework/components/` | Shared components: `BaseComponent`, `TopBar`, `Combobox` (`select` = fill + click the `menuitem` entry), `ConfirmDialog` (built from its dialog and confirm button targets; `expectVisible`, `confirm`, `confirmAndCapture`) |
| `framework/pages/` | Page objects: `BasePage`, `login.page.ts` (`LoginPage.path = '/'`), `trades.page.ts`, `new-trade.page.ts` (`NewTradePage.createApi`; `NewTradePage.fields`: field name -> `{ element, kind, required?, scenario?, when? }`, operated by the one atomic `setField(name, value)` per kind of control, `combobox` and `text` so far. A new form field is one line in this table plus its value in testdata; `TradeCreationData` is derived from it and the create flows fill every optional field the case has a value for in one `And I fill the optional fields` step, failing on a data name that is not in the table. `date` and `yesNo` kinds and the optional fields' testids are still to come from the user. This table framework was type-checked only, not run on the mock, at the user's request), `trade-detail.page.ts` (`TradeDetailPage.status.pendingApproval = 'PARV'`). The create API and `PARV` are confirmed on the real system |
| `framework/elements.ts` | `element(name, extra?)`: the locator of an element of `elements/` by its name; `FIND_BY` maps a `findBy` kind to a `Target` (only `testId` so far) |
| `framework/app.ts` | `App`: every page plus `topBar`, sharing one `ui` |
| `framework/ui.ts` | `Target` type; `Val` (text, `cfg(...)` or a parameter); `UI` class: `goto / fill / click / press / read / expectVisible / expectText / expectUrl / step / Given / When / Then / And / But`, `params(data)`; automatic variables, password safety net, `exportCase` |
| `framework/products.ts` | Product registry: `PRODUCTS` (product type -> capabilities: `create`, `stepInFull`, `stepInPartial`; a data-only variation such as direction Sell is not a capability (explicit user requirement) but a single test with its testdata row) and `productsWith(capability)`. **Specs are per event, not per product** (user decision): a spec loops `productsWith(...)`, so a new product is one line here plus its `.dat`; a new lifecycle event is a new spec, flow and capability |
| `framework/data.ts` | `findCase(name, id)`: `testdata/common.json` + `defaults` of `testdata/<name>.json` + the row with that id, if any (folder overridable with `OREO_TESTDATA_DIR`); `caseIdOf(title)` |
| `framework/fixtures.ts` | Injects `ui`, `app`, `flows` and `testData` (the case's row, matched by case ID), exports after the test passes; the file name is the case ID, i.e. the `[xxx]` at the start of the title (or an `@case:xxx` tag when the title has none) |
| `framework/flows/` | Flow layer, one file per domain: `base.flow.ts` (`BaseFlow` with `this.params(data)`, `Keyword`), `auth.flow.ts` (`flows.auth`: `login(role, keyword?)`, `expectCurrentUser(role)`), `trades.flow.ts` (`flows.trades`: `expectOnTradesPage()`), `trade-creation.flow.ts` (`flows.tradeCreation`: `createTrade(product, data)`, `createStepInFullTrade(product, data)`, `createStepInPartialTrade(product, data)`, each up to the confirmed booking and returning the trade ID, and `expectPendingApproval(tradeId)`; `datFile`, `TradeCreationData`), `index.ts` (`Flows`, the registry) |
| `tests/trade-creation.spec.ts` | Trade creation: three separate tests like the scenarios of the Java feature (normal `-UI-001`, StepIn full `-UI-002`, StepIn partial `-UI-003`), each looping the products that support it (`productsWith('create' / 'stepInFull' / 'stepInPartial')`), plus the Sell case `-UI-004` (a single test for FX_TRF outside the loops; a normal trade whose `direction` is overridden by its testdata row), because not every product supports StepIn full / partial; no kind table (explicit user requirement). Each takes its data from `testdata/trade-creation.json` by case ID, mirroring `trade_creation.feature` of the Java + Cucumber E2E project; skips a case whose product has no `.dat` |
| `testdata/` | Case data: `common.json` plus one `<name>.json` per spec (`trade-creation.json`: `defaults` plus the row of the Sell case). Committed, QA side only (not packaged: a case file carries the values it uses). The committed values are those of the real system (`10 AM NY`, `CM_OIL_CRU_OPT`, `Buy`, old counterparty `10 AM JAK`); the mock offers them too |
| `elements/` | Copy of the E2E project's element JSON (`pages/`, `components/`). Never edited here: refreshed with `npm run sync:elements`. QA side only, not packaged. **The four committed files were typed in from the user's photos and are partial** (`new_trade_page.json` 12 elements, `trade_change_confirmation_dialog.json` 2, `trade_detail_page.json` and `trade_portal_page.json` 1 each); the first sync on the company machine replaces them with the real ones |
| `data/` | Files the cases upload (`<PRODUCT>.dat`, copied by the user from the E2E project); packaged for the PO. Only `data/README.md` is in the repo so far |
| `runner/runner.js` | PO-side runner: case selection, prompts for missing config (hidden password input), execution, screenshots, trace, HTML report |
| `portable/run-case.bat` | The PO's double-click entry point (**must use CRLF line endings**, keep the content ASCII) |
| `portable/record-session.bat` | Runs `runner.js --record`: manual session recording (CRLF, ASCII) |
| `portable/view-trace.bat` | Runs `runner.js --view`: serves the evidence list with report / trace viewer links until Enter (CRLF, ASCII) |
| `scripts/build-portable.js` | Builds `dist/UAT-Runner(.zip)` |
| `scripts/sync-elements.js` | `npm run sync:elements`: mirrors the E2E project's element JSON into `elements/` and checks it against `framework/` (without a path: the check only). `SUPPORTED` must stay in step with `FIND_BY` |
| `.claude/skills/porting-java-e2e-cases/` | Skill that implements a case of the Java + Cucumber E2E project here (`SKILL.md` plus `example-trade-creation.md`, the trace of the case that is already ported). The E2E project's layers are feature -> FLOW snippet -> PAGE / COMPONENT snippet -> built-in Genie step or custom Java step -> element key, mapped to case step -> flow method (substeps) -> page / component operation -> `element('<key>')`. It syncs `elements/` first, skips a whole scenario it cannot express (non-UI step, undefined element, unsupported control) and never commits. **Written from the user's photos of the E2E project and not run against it, at the user's request**: where the `*.snippet` files and the stored variables' data live, and the full list of built-in steps, are found at run time, so the first real port may need the skill adjusted |
| `mock-oreo/server.js` | Mock OREO (mirrors the shadow DOM structure and testids), for local verification only; `npm run mock` → `http://localhost:4173`, maker / `maker1` |
| `cases/` | Exported case files (committed to Git, distributed to the PO). Empty in the repo until the trade creation cases are exported with the real `.dat` files |

## 5. Case file format (formatVersion 1 and 2)

```json
{
  "formatVersion": 2, "name": "...", "description": "...",
  "source": "tests/trade-creation.spec.ts › ...", "codeVersion": "git:abc123",
  "requiredConfig": ["accounts.maker.email", "accounts.maker.password"],
  "params": { "counterpartyName": "10 AM NY" },
  "steps": [
    { "title": "When maker is logged in to the trade portal", "substep": "I log in as maker", "action": "goto", "value": "/" },
    { "action": "fill", "target": { "testId": "login-email-input", "inner": "input" }, "value": "${cfg:accounts.maker.email}" },
    { "action": "fill", "target": { "testId": "counterparty", "inner": "input" }, "value": "${param:counterpartyName}" },
    { "action": "read", "target": { "testId": "trade-id" }, "saveAs": "tradeId" },
    { "action": "click", "target": { "text": "${var:tradeId}" } }
  ]
}
```

- Versions: 1 = steps only; 2 = adds the `params` block and `${param:name}`. A case that uses no case data is still written as version 1, so its export is unchanged and an older runner still runs it. `FORMAT_VERSION` in `core/actions.js` is the highest version the code runs; the runner refuses a newer file with a message asking for the current package.
- `params`: flat object, name → text. A value may contain `${cfg:path}` (for a value that must not be committed); nothing else is resolved inside a param value.

- Actions: `goto fill click press select upload read expectVisible expectText expectUrl wait`
- `upload`: `value` is a path relative to the root that must be inside `data/` (`resolveDataFile`; the runner checks the files exist before prompting). `click` may carry `capture: { url, method, field, saveAs }`: the response of the matching request (path ends with `url`; a query in `url` must match too, since the path alone never contains it) is read in the browser without re-sending it, and `field` of its JSON response is stored as a variable.
- Target fields: `testId | role(+name) | label | placeholder | text | css`, plus `inner`, `nth`, `exact`
- Placeholders: `${cfg:path}` = local config; `${var:name}` = a value read by an earlier `read` or `capture`; `${param:name}` = case data from `params`. **Resolved in both value and target**; `requiredConfig` covers both as well, plus the `${cfg:...}` inside used param values.
- `title` is attached only to the first action of each outermost `ui.step()` group, `substep` to the first action of each nested one. Titles are written BDD-style (`Given ...`, `When ...`, `Then ...`); this is plain text in the same field, not a format change.
- When changing the format, change both `ui.ts` (writer) and `actions.js` (reader), and consider `formatVersion` compatibility.

## 6. Known OREO page structure (from user screenshots)

- UI components are **web components with open shadow DOM** (`sc-text-input`, `sc-button`, with a Shoelace-style `sl-button` inside).
- **Inputs**: the real `<input part="input">` is inside the shadow root, so the target must be `{ testId: '...', inner: 'input' }` (CSS locators pierce open shadow roots; calling `fill` on the host throws).
- **Buttons**: click the host `sc-button` directly.
- Known testids:
  - Login: `login-dialog`, `login-email-input`, `login-password-input`, `login-sign-in-to-portal-btn`
  - Top bar: `layout-new-trade-btn`, `layout-ai-reader-btn`, `layout-theme-toggle-btn`, `layout-user-menu-btn` (contains `<span>maker</span>`), `layout-topnav-c…` (truncated in the screenshot)
- New Trade: the elements used by `framework/pages/new-trade.page.ts`, `trade-detail.page.ts`, the confirmation dialog and the New Trade button of the top bar come from the E2E project's element JSON (`elements/`). Still hand-written, because their element names are not known yet: the login page and the other top bar buttons. The create-trade request is `POST .../api/v1/trades/create?tradeAction=SUBMIT` (multipart, on a different origin than the page), answered with `{ code, status: 'PENDING APPROVAL', data: { trade: { id } } }`. The detail header shows the status as the badge `PARV`. Comboboxes: fill the inner input, then click the dropdown entry, which is not a native option but `<sl-menu-item role="menuitem">` with the typed text highlighted in `<b>` (`Combobox.entry` = `{ role: 'menuitem', name, exact: true }`). The confirmation dialog is an `sc-modal` whose host is 0 x 0 (the panel is in its shadow root), so `expectVisible` on the host fails; assert the slotted header instead (`inner: '[slot="header"]'`; `h2` resolves to two elements). `upload` accepts either the file input or a zone wrapping it. The New Trade page path is `/trade/new`. Test data (counterparty, portfolio, direction, old counterparty) lives in `testdata/`; the product type is typed as the Product ID.
- Trades page path is `/trades`; the page has blotters such as Validation Blotter / Pending Approval / Expires Today, and a search box "Search by Trade ID..." (testid unknown).
- Example test account: `maker@test.com` (display name `maker`). **The login page path is unconfirmed**; `/` is currently assumed.

## 7. Common commands

```bash
npm install
copy config.local.example.json config.local.json   # fill in baseUrl and accounts/passwords
npx playwright test --headed      # run cases; passing ones are exported to cases/
npm run replay                    # replay locally with the runner (same experience as the PO)
npm run build:portable            # build dist/UAT-Runner.zip (--with-config includes config with passwords stripped; --no-zip)
npm run sync:elements -- <path>   # refresh elements/ from the E2E project, then check it; without a path, check only
npm run mock                      # start the mock OREO
npx tsc -p .                      # type check
```

## 8. User environment and constraints

- Windows + VS Code + PowerShell (pwsh); company intranet, **external domains do not resolve** (`ENOTFOUND cdn.playwright.dev`); npm works through the company mirror.
- PO machine: cannot install software, has Edge. Still to confirm whether IT allows running `node.exe` / `.bat` from a shared drive.
- GitHub repo: `https://github.com/Hellen-Zhu/auto_replay`. `.gitignore` excludes `config.local.json`, `node_modules/`, `evidence/`, `dist/`, `test-results/`.

## 9. Pitfalls already fixed (do not regress)

- The runner reads input through a line queue from `rl[Symbol.asyncIterator]()`; consecutive `rl.question` calls drop lines under piped input and exit silently.
- While a case runs on a console, key echo is muted and lines typed during the run are discarded before the next prompt (`discardTyped`), so a stray Enter cannot skip a pause. This is skipped for piped input, where every buffered line is an intended answer.
- When video initialization fails, **close the whole browser and launch again**; closing only the context makes the later `newPage` fail.
- The "no browser found" hint is shown only when `browserType.launch` fails; otherwise it is a false alarm.
- The trace viewer needs http (it registers a service worker), so a `file://` link to it never works; that is why the runner serves it. The Claude desktop preview pane cannot register that service worker either - verify the viewer in a real Chrome / Edge.
- `${var:...}` inside a target must also be resolved in `executeStep` (needed to locate a trade that was just booked).
- In the recording script, typed text is remembered from `input` and reported before the next action (mousedown elsewhere, Enter, focusout, pagehide), not from `change`: `change` is not a composed event, so it never reaches the document from inside a shadow root. Clicks are taken at `mousedown`, because a dropdown closes on mousedown and the `click` then lands on whatever is behind it (`click` is used only for keyboard clicks, `detail === 0`). Labels of shadow buttons come from the host with the testid, since the inner button only holds a slot.
- Response capture pauses the response in the browser through a CDP session (`Fetch.enable` at the `Response` stage, `Fetch.getResponseBody`, then `Fetch.continueRequest`); Chromium only. Do not go back to either alternative: `waitForResponse` / `page.on('response')` lose the body when the page navigates right after the response, and `page.route` + `route.fetch()` re-sends a multipart upload without its file (the real system answers `Invalid dat file: empty or null bytes`). The mock posts real multipart and navigates immediately, so it catches both.

## 10. Suggested next steps

1. **Sync the element files on the company machine**: `npm run sync:elements -- <path of the E2E project>` replaces the partial files typed in from photos with the real ones (two entries were not fully visible there: the name `new_trade.stepin_toggle` and the value of `new_trade.book_btn`; `trade_portal.new_trade_btn` was taken from the Java snippets). Then switch the hand-written testids the script lists (login page, top bar) to `element('...')`, run the cases and commit `elements/`.
2. **Connect to the real system**: confirm the login page path (change `LoginPage.path`) and get the login step of the trade creation cases passing against the real `baseUrl`. There is no separate login case (removed at the user's request): login is only a `Given` of business cases.
3. **Trade creation on the real system**: confirm what "configured risk engine mode" needs and the full pending-approval assertions; add the `.dat` files; extend the registry in `framework/products.ts` (per product, only the capabilities it supports) to all 18 products.
4. **Approval case**: maker books a TARF through New Trade → `read` the trade ID → checker logs in → finds the trade in Pending Approval and approves it → verify the status. This validates automatic trade-ID variables. Needs the testids of the booking form, search box, approve button and status field.
5. **First port with the skill**: on the company machine run `/porting-java-e2e-cases <E2E project> <feature file>` on a small UI feature and correct the skill where the real project differs from the photos (snippet location, data files, built-in steps).
6. Test the portable build on the PO's machine (Edge launch, IT policy, UAT network reachability).
7. Optional enhancements: a case index page; copying ffmpeg from the local cache into the package (if video is needed later).

## 11. Coding conventions

- Reports read as BDD without any BDD framework (playwright-bdd / Cucumber were rejected by the user): the test title is the Scenario, and steps are grouped with `ui.Given / When / Then / And / But(text, fn)` (capitalized, since a lowercase `then` would make `UI` a thenable). The runner emphasizes the keyword in the report.
- **The spec carries the feature's steps** (explicit user requirement: the case must read like the Java `.feature`, with the same step lines): a case is a list of `await When('maker is logged in to the trade portal', () => flows.auth.login('maker'))` lines, using the `Given / When / Then / And / But` fixtures (the step returns the flow's result). Steps nest in two levels like a feature step and its snippet: the outermost step (the case's) is recorded as `title`, i.e. a report row; a step a flow opens inside it is recorded as `substep` (keyword stripped), an optional field on the first action of that group that older runners ignore (no format version change). The runner prints substeps, shows them as headings in the row's action list and stops on them in step-by-step mode. A flow step outside any case step is still a `title`.
- Action flows do not assert their own outcome: the `Then` is a separate `expect...` flow called by the case (`createTrade` then `expectPendingApproval`), so the scenario's expectation is visible in the case.
- Layering: cases call only flows; flows call only page / component operations (never `ui.click / ui.fill`, no locators) and own the Given / When / Then grouping; pages and components hold the locators and only atomic operations (no sequences, no BDD keywords). A new page extends `BasePage` and is registered in `App`; a control shared by pages becomes a component; a new business domain extends `BaseFlow` and is registered in `Flows`.
- Every page action must go through `ui.xxx` (inside a page or component: `this.ui.xxx`); do not use `page` directly, or it will not be recorded.
- A locator is `element('<name>')` with the name from `elements/`, held by the page or component that owns the control. Never edit `elements/` by hand and never invent a name: a new element is added in the E2E project and synced. Until it exists there, write `{ testId: '...' }` (the sync reports it once an element defines that testid). Prefer `data-testid`; when a testid is missing, ask the developers to add one rather than writing brittle CSS/XPath.
- Accounts and passwords always use `cfg('accounts.<role>.password')`; never put a real server address, IP or password into any committed file.
- Case data never goes into `config.local.json` or into a spec as a literal: put it in `testdata/` (shared values in `common.json` or `defaults`, differences in the row) and use it in the flow through `this.params(data)`. A flow that needs data takes one typed data object after its scenario arguments (`createTrade(product, data: TradeCreationData)`). `testdata/` is committed: business values only; write `"${cfg:...}"` for anything that must stay local.
- Everything in the repo is written in English: code, comments, console and report text, test titles, step titles, docs.
- Language for talking with the user: Chinese.
