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

- Page Object Model in three layers, each calling only the one below (QA side only; the case format and the runner know nothing about it). **Page / component** (`framework/pages`, `framework/components`): owns locators as `protected readonly` fields and exposes atomic operations built on `this.ui.xxx` (one field, one button, one dropdown value, one check); a page exposes the components it contains as public fields (`newTrade.counterparty.select(v)`). **Flow** (`framework/flows`, one class per business domain extending `BaseFlow`, reached through the `flows` fixture as `flows.<domain>.<step>()`): business steps, i.e. the Given / When / Then groups and the atomic operations inside them; each takes an optional keyword. **Case** (`tests/`): only `flows.<domain>.xxx(...)` calls and data. `App` (`framework/app.ts`, the `app` fixture) holds one instance of every page and of `TopBar`. The refactoring was verified by exporting all ten cases on the mock before and after: the steps are identical.

- Data-driven cases (QA side): `testdata/common.json` is a flat object shared by all files; `testdata/<name>.json` is `{ "defaults": {...}, "cases": [ { "id": ..., ... } ] }`. `loadCases<T>(name)` (`framework/data.ts`) returns one object per row, merged common → defaults → row (the row wins). The row `id` is the case ID (`TC-TRADE-CREATION-FX_TRF-UI-001`): the case loops over the rows, puts it in the title as `[${data.id}] ...` without building it from other fields, and hands the row to the flow. In the flow `const p = this.params(data)`: `p.xxx` is recorded as `${param:xxx}` and its value is written to the `params` block of the case file (only parameters that are used, in order of first use); a field read directly (`data.product`, `data.kind`) decides the scenario and is recorded literally. Pages and components are unaffected: their operations take a `Val`.
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
| `framework/components/` | Shared components: `BaseComponent`, `TopBar`, `Combobox` (`select` = fill + click the `menuitem` entry), `ConfirmDialog` (`expectVisible`, `confirm`, `confirmAndCapture`) |
| `framework/pages/` | Page objects: `BasePage`, `login.page.ts` (`LoginPage.path = '/'`), `trades.page.ts`, `new-trade.page.ts` (`NewTradePage.createApi`), `trade-detail.page.ts` (`TradeDetailPage.status.pendingApproval = 'PARV'`). The create API and `PARV` are confirmed on the real system |
| `framework/app.ts` | `App`: every page plus `topBar`, sharing one `ui` |
| `framework/ui.ts` | `Target` type; `Val` (text, `cfg(...)` or a parameter); `UI` class: `goto / fill / click / press / read / expectVisible / expectText / expectUrl / step / Given / When / Then / And / But`, `params(data)`; automatic variables, password safety net, `exportCase` |
| `framework/data.ts` | `loadCases<T>(name)`: rows of `testdata/<name>.json` merged with its `defaults` and `testdata/common.json` (folder overridable with `OREO_TESTDATA_DIR`) |
| `framework/fixtures.ts` | Injects `ui`, `app` and `flows`, exports after the test passes; the file name is the case ID, i.e. the `[xxx]` at the start of the title (or an `@case:xxx` tag when the title has none) |
| `framework/flows/` | Flow layer, one file per domain: `base.flow.ts` (`BaseFlow` with `this.params(data)`, `Keyword`), `auth.flow.ts` (`flows.auth`: `login(role, keyword?)`, `expectCurrentUser(role)`), `trades.flow.ts` (`flows.trades`: `expectOnTradesPage()`), `trade-creation.flow.ts` (`flows.tradeCreation`: `createTrade(data)` up to the confirmed booking, returning the trade ID, and `expectPendingApproval(tradeId)`; `datFile`, `TradeKind`, `TradeCreationData`), `index.ts` (`Flows`, the registry) |
| `tests/login.spec.ts` | Login example case |
| `tests/trade-creation.spec.ts` | Trade creation: one case per row of `testdata/trade-creation.json` (products x {normal, StepIn full, StepIn partial}), mirroring `trade_creation.feature` of the Java + Cucumber E2E project; skips a case whose product has no `.dat` |
| `testdata/` | Case data: `common.json` plus one `<name>.json` per spec. Committed, QA side only (not packaged: a case file carries the values it uses). The committed values match the mock |
| `data/` | Files the cases upload (`<PRODUCT>.dat`, copied by the user from the E2E project); packaged for the PO. Only `data/README.md` is in the repo so far |
| `runner/runner.js` | PO-side runner: case selection, prompts for missing config (hidden password input), execution, screenshots, trace, HTML report |
| `portable/run-case.bat` | The PO's double-click entry point (**must use CRLF line endings**, keep the content ASCII) |
| `portable/record-session.bat` | Runs `runner.js --record`: manual session recording (CRLF, ASCII) |
| `portable/view-trace.bat` | Runs `runner.js --view`: serves the evidence list with report / trace viewer links until Enter (CRLF, ASCII) |
| `scripts/build-portable.js` | Builds `dist/UAT-Runner(.zip)` |
| `mock-oreo/server.js` | Mock OREO (mirrors the shadow DOM structure and testids), for local verification only; `npm run mock` → `http://localhost:4173`, maker / `maker1` |
| `cases/` | Exported case files (committed to Git, distributed to the PO) |

## 5. Case file format (formatVersion 1 and 2)

```json
{
  "formatVersion": 2, "name": "...", "description": "...",
  "source": "tests/login.spec.ts › ...", "codeVersion": "git:abc123",
  "requiredConfig": ["accounts.maker.email", "accounts.maker.password"],
  "params": { "counterpartyName": "MOCK BANK A" },
  "steps": [
    { "title": "Log in as maker", "action": "goto", "value": "/" },
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
- `title` is attached only to the first action of each `ui.step()` group. Titles are written BDD-style (`Given ...`, `When ...`, `Then ...`); this is plain text in the same field, not a format change.
- When changing the format, change both `ui.ts` (writer) and `actions.js` (reader), and consider `formatVersion` compatibility.

## 6. Known OREO page structure (from user screenshots)

- UI components are **web components with open shadow DOM** (`sc-text-input`, `sc-button`, with a Shoelace-style `sl-button` inside).
- **Inputs**: the real `<input part="input">` is inside the shadow root, so the target must be `{ testId: '...', inner: 'input' }` (CSS locators pierce open shadow roots; calling `fill` on the host throws).
- **Buttons**: click the host `sc-button` directly.
- Known testids:
  - Login: `login-dialog`, `login-email-input`, `login-password-input`, `login-sign-in-to-portal-btn`
  - Top bar: `layout-new-trade-btn`, `layout-ai-reader-btn`, `layout-theme-toggle-btn`, `layout-user-menu-btn` (contains `<span>maker</span>`), `layout-topnav-c…` (truncated in the screenshot)
- New Trade: all testids in `framework/pages/new-trade.page.ts` and `trade-detail.page.ts` were supplied by the user from the E2E project's element JSON. The create-trade request is `POST .../api/v1/trades/create?tradeAction=SUBMIT` (multipart, on a different origin than the page), answered with `{ code, status: 'PENDING APPROVAL', data: { trade: { id } } }`. The detail header shows the status as the badge `PARV`. Comboboxes: fill the inner input, then click the dropdown entry, which is not a native option but `<sl-menu-item role="menuitem">` with the typed text highlighted in `<b>` (`Combobox.entry` = `{ role: 'menuitem', name, exact: true }`). The confirmation dialog is an `sc-modal` whose host is 0 x 0 (the panel is in its shadow root), so `expectVisible` on the host fails; assert the slotted header instead (`inner: '[slot="header"]'`; `h2` resolves to two elements). `upload` accepts either the file input or a zone wrapping it. The New Trade page path is `/trade/new`. Test data (counterparty, portfolio, direction, old counterparty) lives in `testdata/`; the product type is typed as the Product ID.
- Trades page path is `/trades`; the page has blotters such as Validation Blotter / Pending Approval / Expires Today, and a search box "Search by Trade ID..." (testid unknown).
- Example test account: `maker@test.com` (display name `maker`). **The login page path is unconfirmed**; `/` is currently assumed.

## 7. Common commands

```bash
npm install
copy config.local.example.json config.local.json   # fill in baseUrl and accounts/passwords
npx playwright test --headed      # run cases; passing ones are exported to cases/
npm run replay                    # replay locally with the runner (same experience as the PO)
npm run build:portable            # build dist/UAT-Runner.zip (--with-config includes config with passwords stripped; --no-zip)
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

1. **Connect to the real system**: confirm the login page path (change `LoginPage.path`) and get `login.spec.ts` passing against the real `baseUrl`.
2. **Trade creation on the real system**: confirm what "configured risk engine mode" needs and the full pending-approval assertions; add the `.dat` files; put the real values into `testdata/` and add rows for all 18 products.
3. **Approval case**: maker books a TARF through New Trade → `read` the trade ID → checker logs in → finds the trade in Pending Approval and approves it → verify the status. This validates automatic trade-ID variables. Needs the testids of the booking form, search box, approve button and status field.
4. Test the portable build on the PO's machine (Edge launch, IT policy, UAT network reachability).
5. Optional enhancements: a case index page; copying ffmpeg from the local cache into the package (if video is needed later).

## 11. Coding conventions

- Reports read as BDD without any BDD framework (playwright-bdd / Cucumber were rejected by the user): the test title is the Scenario, and steps are grouped with `ui.Given / When / Then / And / But(text, fn)` (capitalized, since a lowercase `then` would make `UI` a thenable). `flows.auth.login(role, keyword)` defaults to `Given`. The runner emphasizes the keyword in the report.
- Action flows do not assert their own outcome: the `Then` is a separate `expect...` flow called by the case (`createTrade` then `expectPendingApproval`), so the scenario's expectation is visible in the case.
- Layering: cases call only flows; flows call only page / component operations (never `ui.click / ui.fill`, no locators) and own the Given / When / Then grouping; pages and components hold the locators and only atomic operations (no sequences, no BDD keywords). A new page extends `BasePage` and is registered in `App`; a control shared by pages becomes a component; a new business domain extends `BaseFlow` and is registered in `Flows`.
- Every page action must go through `ui.xxx` (inside a page or component: `this.ui.xxx`); do not use `page` directly, or it will not be recorded.
- Add new elements to the page or component that owns them, preferring `data-testid`; when a testid is missing, ask the developers to add one rather than writing brittle CSS/XPath.
- Accounts and passwords always use `cfg('accounts.<role>.password')`; never put a real server address, IP or password into any committed file.
- Case data never goes into `config.local.json` or into a spec as a literal: put it in `testdata/` (shared values in `common.json` or `defaults`, differences in the row) and use it in the flow through `this.params(data)`. A flow that needs data takes one typed data object (`createTrade(data: TradeCreationData)`). Read `data.xxx` directly only for fields that decide the scenario. `testdata/` is committed: business values only; write `"${cfg:...}"` for anything that must stay local.
- Everything in the repo is written in English: code, comments, console and report text, test titles, step titles, docs.
- Language for talking with the user: Chinese.
