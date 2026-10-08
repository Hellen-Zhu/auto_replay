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
| The PO side is a **portable folder**: portable `node.exe` + `runner` + `@playwright/test` | The PO cannot install software; uses the machine's own **Edge** (`channel: msedge`), no browser download |
| **No video** by default | Video depends on Playwright's ffmpeg; the company intranet cannot resolve `cdn.playwright.dev`, so the download fails |
| Packaging **copies the local node.exe** instead of downloading Node | The company intranet cannot reach nodejs.org |
| Locators **prefer `data-testid`** | Explicit user requirement; developers already provide testids on key controls |
| **English only** across the repo | Explicit user requirement: no Chinese in code, comments, messages, file names, docs or case files |
| Rejected approaches | Intranet server + live noVNC view (user found it too complex); packaging as a Java jar; pure click record-and-replay |

## 3. Architecture

```
QA:  tests/*.spec.ts ──acts through ui.xxx──► framework/ui.ts (execute + record)
                                                 │ calls
                                                 ▼
                                           core/actions.js  ◄── shared execution core
                                                 ▲
PO:  run-case.bat → runner/runner.js ──reads cases/*.json, calls step by step┘
```

- After a test **passes**, `framework/fixtures.ts` exports `cases/<caseId>.json` automatically.
- The runner lists the cases under `cases/`; the PO types a number (plain Enter = the first one) or drags a json onto the bat.
- When settings are already provided, the runner shows them and lets the PO type `C` to change `baseUrl` and the non-secret account fields for that run only; changing the address or an account clears the matching saved password so it is asked for again. Afterwards the runner offers to save the typed-in address and account to `config.local.json` (default No); it never writes a password, only blanks one that no longer matches.
- Pausing is a runner-only feature (the case format has no pause action): before the run the PO can type `S` for step-by-step mode (stops before each titled group), and on a real console pressing `P` pauses after the current step; Enter resumes. Pauses only happen between steps, are recorded per step (`pausedSec`) and excluded from the reported duration. That prompt defaults to a normal run when input has ended, so older piped inputs keep working.
- Every replay produces `evidence/<caseId>_<timestamp>/`: `report.html` (one row per BDD step, i.e. per titled group, with its result and screenshot; the actions behind it are in a collapsed list, opened automatically for a failed step), `result.json` (still one entry per action), `step-XX.png` (one per action), `trace.zip`.
- Links: the runner starts a local-only http server (`127.0.0.1`, port `evidence.viewPort` or `OREO_VIEW_PORT`, default 9400) that serves `/evidence/*` and Playwright's own trace viewer from `playwright-core/lib/vite/traceViewer` at `/trace/*`. The console and the report footer show the report URL and the "Full replay" trace viewer URL (`/trace/index.html?trace=<url of trace.zip>`). On a console the server lives until the PO presses Enter; with piped input the runner exits right away. `--view` (view-trace.bat) serves an index of all runs. `trace.playwright.dev` is opt-in (`evidence.traceViewer: "official"`, which also turns on CORS for `/evidence/*`), because the intranet probably cannot reach it; it has no upload feature, it only reads the local `trace.zip` through `?trace=`. Never upload a trace.zip to a public host: it contains the server address, screenshots, network traffic and typed passwords.

## 4. Layout and responsibilities

| Path | Responsibility |
|---|---|
| `core/actions.js` | Execution core: `resolveTarget`, `resolveValue` (placeholders), `executeStep`, `describeStep`. **Keep it CommonJS and dependent only on `@playwright/test`** (it is bundled into the runner) |
| `core/config.js` | Reads `config.local.json` (overridable with `OREO_UAT_CONFIG` / `OREO_BASE_URL`), `launchOptions`, `secretEntries` |
| `framework/targets.ts` | Page element locator table `T` |
| `framework/ui.ts` | `UI` class: `goto / fill / click / press / read / expectVisible / expectText / expectUrl / step / Given / When / Then / And / But`; automatic variables, password safety net, `exportCase` |
| `framework/fixtures.ts` | Injects `ui`, exports after the test passes; `@case:xxx` in the title sets the file name |
| `framework/flows.ts` | Reusable flows: `login(ui, role)`, `createTrade(ui, product, kind)`; `LOGIN_PATH = '/'`; `CREATE_TRADE_API` (confirmed), unconfirmed `PENDING_APPROVAL_TEXT` |
| `tests/login.spec.ts` | Login example case |
| `tests/trade-creation.spec.ts` | Trade creation: loops `PRODUCTS` x {normal, StepIn full, StepIn partial}, mirroring `trade_creation.feature` of the Java + Cucumber E2E project; skips a product whose `.dat` is missing |
| `data/` | Files the cases upload (`<PRODUCT>.dat`, copied by the user from the E2E project); packaged for the PO. Only `data/README.md` is in the repo so far |
| `runner/runner.js` | PO-side runner: case selection, prompts for missing config (hidden password input), execution, screenshots, trace, HTML report |
| `portable/run-case.bat` | The PO's double-click entry point (**must use CRLF line endings**, keep the content ASCII) |
| `portable/view-trace.bat` | Runs `runner.js --view`: serves the evidence list with report / trace viewer links until Enter (CRLF, ASCII) |
| `scripts/build-portable.js` | Builds `dist/UAT-Runner(.zip)` |
| `mock-oreo/server.js` | Mock OREO (mirrors the shadow DOM structure and testids), for local verification only; `npm run mock` → `http://localhost:4173`, maker / `maker1` |
| `cases/` | Exported case files (committed to Git, distributed to the PO) |

## 5. Case file format (formatVersion 1)

```json
{
  "formatVersion": 1, "name": "...", "description": "...",
  "source": "tests/login.spec.ts › ...", "codeVersion": "git:abc123",
  "requiredConfig": ["accounts.maker.email", "accounts.maker.password"],
  "steps": [
    { "title": "Log in as maker", "action": "goto", "value": "/" },
    { "action": "fill", "target": { "testId": "login-email-input", "inner": "input" }, "value": "${cfg:accounts.maker.email}" },
    { "action": "read", "target": { "testId": "trade-id" }, "saveAs": "tradeId" },
    { "action": "click", "target": { "text": "${var:tradeId}" } }
  ]
}
```

- Actions: `goto fill click press select upload read expectVisible expectText expectUrl wait`
- `upload`: `value` is a path relative to the root that must be inside `data/` (`resolveDataFile`; the runner checks the files exist before prompting). `click` may carry `capture: { url, method, field, saveAs }`: the response of the matching request (path ends with `url`; a query in `url` must match too, since the path alone never contains it) is read in the browser without re-sending it, and `field` of its JSON response is stored as a variable.
- Target fields: `testId | role(+name) | label | placeholder | text | css`, plus `inner`, `nth`, `exact`
- Placeholders: `${cfg:path}` = local config; `${var:name}` = a value read by an earlier `read` or `capture`. **Resolved in both value and target**; `requiredConfig` covers both as well.
- `title` is attached only to the first action of each `ui.step()` group. Titles are written BDD-style (`Given ...`, `When ...`, `Then ...`); this is plain text in the same field, not a format change.
- When changing the format, change both `ui.ts` (writer) and `actions.js` (reader), and consider `formatVersion` compatibility.

## 6. Known OREO page structure (from user screenshots)

- UI components are **web components with open shadow DOM** (`sc-text-input`, `sc-button`, with a Shoelace-style `sl-button` inside).
- **Inputs**: the real `<input part="input">` is inside the shadow root, so the target must be `{ testId: '...', inner: 'input' }` (CSS locators pierce open shadow roots; calling `fill` on the host throws).
- **Buttons**: click the host `sc-button` directly.
- Known testids:
  - Login: `login-dialog`, `login-email-input`, `login-password-input`, `login-sign-in-to-portal-btn`
  - Top bar: `layout-new-trade-btn`, `layout-ai-reader-btn`, `layout-theme-toggle-btn`, `layout-user-menu-btn` (contains `<span>maker</span>`), `layout-topnav-c…` (truncated in the screenshot)
- New Trade: all testids in `framework/targets.ts` (`newTrade`, `tradeDetail`) were supplied by the user from the E2E project's element JSON. The create-trade request is `POST .../api/v1/trades/create?tradeAction=SUBMIT` (multipart, on a different origin than the page), answered with `{ code, status: 'PENDING APPROVAL', data: { trade: { id } } }`. Still `UNCONFIRMED` in `framework/flows.ts`: the pending-approval status text on the detail page. Comboboxes: fill the inner input, then click the dropdown entry, which is not a native option but `<sl-menu-item role="menuitem">` with the typed text highlighted in `<b>` (`dropdownItem` in `flows.ts` = `{ role: 'menuitem', name, exact: true }`). The confirmation dialog is an `sc-modal` whose host is 0 x 0 (the panel is in its shadow root), so `expectVisible` on the host fails; assert the slotted header instead (`inner: '[slot="header"]'`; `h2` resolves to two elements). `upload` accepts either the file input or a zone wrapping it. The New Trade page path is `/trade/new`. Test data lives in `tradeData.*` of `config.local.json`; the product type is typed as the Product ID.
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
- Response capture pauses the response in the browser through a CDP session (`Fetch.enable` at the `Response` stage, `Fetch.getResponseBody`, then `Fetch.continueRequest`); Chromium only. Do not go back to either alternative: `waitForResponse` / `page.on('response')` lose the body when the page navigates right after the response, and `page.route` + `route.fetch()` re-sends a multipart upload without its file (the real system answers `Invalid dat file: empty or null bytes`). The mock posts real multipart and navigates immediately, so it catches both.

## 10. Suggested next steps

1. **Connect to the real system**: confirm the login page path (change `LOGIN_PATH` in `flows.ts`) and get `login.spec.ts` passing against the real `baseUrl`.
2. **Trade creation on the real system**: confirm the status text on the detail page, what "configured risk engine mode" needs and the full pending-approval assertions; add the `.dat` files; extend `PRODUCTS` to all 18 products.
3. **Approval case**: maker books a TARF through New Trade → `read` the trade ID → checker logs in → finds the trade in Pending Approval and approves it → verify the status. This validates automatic trade-ID variables. Needs the testids of the booking form, search box, approve button and status field.
4. Test the portable build on the PO's machine (Edge launch, IT policy, UAT network reachability).
5. Optional enhancements: parameterized runs (PO changes currency pair / notional); business data in the report; a case index page; copying ffmpeg from the local cache into the package (if video is needed later).

## 11. Coding conventions

- Reports read as BDD without any BDD framework (playwright-bdd / Cucumber were rejected by the user): the test title is the Scenario, and steps are grouped with `ui.Given / When / Then / And / But(text, fn)` (capitalized, since a lowercase `then` would make `UI` a thenable). `login(ui, role, keyword)` defaults to `Given`. The runner emphasizes the keyword in the report.
- Every page action must go through `ui.xxx`; do not use `page` directly, or it will not be recorded.
- Add new elements to `framework/targets.ts` first, preferring `data-testid`; when a testid is missing, ask the developers to add one rather than writing brittle CSS/XPath.
- Accounts and passwords always use `cfg('accounts.<role>.password')`; never put a real server address, IP or password into any committed file.
- Everything in the repo is written in English: code, comments, console and report text, test titles, step titles, docs.
- Language for talking with the user: Chinese.
