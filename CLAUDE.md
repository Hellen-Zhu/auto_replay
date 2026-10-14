# OREO UAT Replay - Project Notes

> Short version, loaded into every session. **The full notes are in `docs/handover-notes.md`** (sections 1-11 below have the same numbers there). Before changing an area, read its section there: it records every user requirement, what was verified where, and what is only inferred.

## 1. Goal

UAT of OREO, a bank-internal system for the lifecycle of non-flow FX structured products (TARF, DCD, KO Forward ...). The user is QA. QA runs a case with Playwright -> a case file (JSON) is exported -> the PO, without installing anything, double-clicks `run-case.bat` and really replays the case in their own browser (Edge). MVP done; trade creation, checker approve / reject, cancellation, allocation and other lifecycle events are written; many are verified on the mock only (see section 10).

## 2. Key decisions (do not overturn lightly)

- Playwright; cases in TypeScript, runner in plain JS. Export **JSON step data, not code**; QA run and PO replay share `core/actions.js` (what was recorded is exactly what replays).
- Record at the action layer, never mouse clicks (trade IDs differ every run).
- Server address, accounts, passwords only in `config.local.json` (never in code, case files or Git). Case data in `testdata/*.json`, carried in the case file as `params`.
- PO side: portable folder (local `node.exe` copied, `@playwright/test`, machine's Edge via `channel: msedge`). No video (no ffmpeg download on the intranet).
- Locators: `data-testid`, via the E2E project's element JSON copied into `elements/`, used by name: `element('new_trade.book_btn')`.
- A trade a case needs beforehand is created through the API (`api` step, `page.request`, header `X-User-Id` = role's e-mail; no login).
- `FX_CO` = `FX_PSCRIPT`, `FX_FSB` = `FX_PSCRIPT_FSKO`: use only the new names.
- A case logs in once (one role). Specs are per lifecycle event, not per product; minimal coverage (repeat per product only where the product changes what is tested).
- The PO's runner always uses the real risk engine (`FIXED_SETTINGS` in `runner/lib/settings.js`); QA's run reads `riskEngine` (`real` / `mock`) from config.
- The runner never uses a password from the config file: the PO types it (kept in memory only).
- **English only** in the repo (code, comments, messages, file names, docs, case files). Exception: `docs/demo-slide.html` and `docs/how-it-works.html` (Chinese at the user's request).
- Rejected: noVNC live view, Java jar, click record-and-replay, playwright-bdd / Cucumber.

## 3. Architecture

```
QA:  tests/*.spec.ts -> framework/flows/ -> framework/pages + components + api -> framework/ui.ts (execute + record)
                                                                                     |
                                                                               core/actions.js  (shared execution core)
                                                                                     ^
PO:  run-case.bat -> runner/runner.js -> reads cases/**/*.json step by step ----------+
```

- Layers (QA side): **case** (`tests/`, step lines + data) -> **flow** (`framework/flows/`, `flows.<domain>.<step>()`, Given/When/Then groups) -> **page / component / API object** (locators, requests, atomic operations via `this.ui.xxx`). Each layer calls only the one below.
- Test data: merged `testdata/common.json` -> `shared.<block>` listed in `use` -> `defaults` of `testdata/<spec name>.json` -> the row whose `id` = case ID in the title `[TC-...]`. Rows only for cases that differ. In a flow, `const p = this.params(data)` records `${param:xxx}`.
- Product and dat file are case data (`shared.given-trade`); dat files at `testdata/dat/<PRODUCT>/<file>.dat`, default `<PRODUCT>.dat`.
- Event cases: `givenProduct` + `givenTrade` (`tests/support.ts`); `Given` = `flows.trades.orCreate(...)`: uses `OREO_TRADE_ID` / `tradeId` of case data, else creates the trade through the API (recorded with `when: { param: 'tradeId', empty: true }`).
- Variants inside one case: `ui.onlyWhen(param, choices, values, fn)` (e.g. `allocationWays`, `amendmentField`), `byParam(...)` in API bodies (e.g. `tradeType` Normal / StepInFull / StepInPartial), `ui.distinct(...)` for values that must differ.
- Every login first resets the account's preferences (`PUT /uc/api/user-preferences`), so every case has an `api` step and needs `apiBaseUrl`.
- Export after a passing test: `cases/<spec name>/<caseId>.json` (`framework/fixtures.ts`); API requests to `requests/<ref>.json`. An export never moves or deletes files.
- Runner (PO): keyboard case tree (folders, search, Space ticks, batch, parallel up to 8), numbered-list fallback (`OREO_PLAIN_MENU=1` / piped input), drag-and-drop of files / folders, settings and case data as a keyboard list, step-by-step (`S`), pause (`P`), Ctrl+C handling, browser kept open after a single case, evidence in `evidence/<caseId>_<timestamp>/` (`report.html`, `result.json`, screenshots, `trace.zip`), local view server (127.0.0.1:9400) for report and trace viewer, `--record` and `--view` modes. The runner frames the element of each action before it acts (`browser.highlight`, `highlightMs`, runner only) and opens a single case maximized.
- QA runs are parallel (`fullyParallel`, default workers); a case must never depend on state another case left.

Details of each point: `docs/handover-notes.md` section 3.

## 4. Layout

| Path | Responsibility |
|---|---|
| `core/actions.js`, `core/lib/` | Execution core (CommonJS, depends only on `@playwright/test`; copied into the package). `actions.js` only re-exports `core/lib/*`; outside code requires `core/actions` only |
| `core/config.js` | Reads `config.local.json` (`OREO_UAT_CONFIG`, `OREO_BASE_URL`, `OREO_API_BASE_URL`) |
| `framework/ui.ts` | `UI`: recorded operations, `Given/When/Then`, params, `onlyWhen`, `byParam`, `exportCase` |
| `framework/elements.ts` | `element(name, extra?)`, `INNER_INPUT` |
| `framework/pages/`, `framework/components/` | Page objects and components (locators + atomic operations) |
| `framework/api/` | API objects (`TradesApi`, `UserPreferencesApi`), paths after the `apiBaseUrl` prefix |
| `framework/flows/` | One flow class per domain, registry in `index.ts` |
| `framework/products.ts` | Product registry `PRODUCTS` and capabilities |
| `framework/risk-engine.ts` | Risk calculation requests and mocked answer |
| `framework/data.ts`, `framework/fixtures.ts` | Test data lookup; fixtures and export |
| `tests/*.spec.ts`, `tests/support.ts` | One spec per lifecycle event |
| `testdata/`, `testdata/dat/` | Case data (committed); dat files (packaged) |
| `elements/` | Copy of the E2E project's element JSON; refresh with `npm run sync:elements`, never edit by hand (current files are partial) |
| `runner/runner.js`, `runner/lib/` | PO runner; modules ordered `state, paths, console, menu, case-list, case-tree, settings, execute, batch, report, view-server, record` (no cycles; shared mutable state in `state.js`) |
| `portable/*.bat` | PO entry points (**CRLF, ASCII only**) |
| `scripts/build-portable.js`, `scripts/sync-elements.js` | Package build; element sync and check |
| `mock-oreo/server.js` | Mock OREO for local verification (its header lists what is real vs. mock-only: never copy mock-only testids into `framework/`) |
| `cases/`, `requests/` | Exported case files and their API requests |
| `.claude/skills/porting-java-e2e-cases/` | Skill to port a Java + Cucumber E2E case |

Per-file details (every flow, page operation, spec): `docs/handover-notes.md` section 4.

## 5. Case file format

`FORMAT_VERSION` = 15 (`core/lib/case-format.js`). Shape: `name`, `description`, `requiredConfig`, `params`, `distinct`, `scenario` (step lines for the reader), `steps` = `[{ step, actions: [ action | { substep, when?, actions } ] }]`. No `formatVersion`, `source` or `codeVersion` is written. Placeholders `${cfg:...}`, `${var:...}`, `${param:...}`, resolved in values and targets. Actions: `goto fill click press select upload api set read expectVisible expectHidden expectEnabled expectDisabled expectValue expectText expectUrl wait`. An `api` step is `{ action: 'api', ref }` -> `requests/<ref>.json`. **When changing the format, change both `framework/ui.ts` (writer) and `core/lib/` (reader)**, and remember that the PO then needs a newly built package. Full spec: `docs/handover-notes.md` section 5.

## 6. OREO page facts

- Web components with open shadow DOM: fill the inner control (`{ inner: INNER_INPUT }`), never the `sc-text-input` host; click `sc-button` hosts directly.
- Dropdown options are `{ role: 'menuitem', name, exact: true }`. `sc-modal` host is 0x0: assert `[slot="header"]`.
- Paths: login `/login`, trades `/trades`, new trade `/trade/new`, detail `/trade/<id>`. Row action menu = right-click on the row; match a row by a cell whose whole text is the ID (child trades contain the ID).
- API on another origin, prefix `/api/v1` belongs to `apiBaseUrl` only. Statuses: `PARV`, `LIVE`, `DEAD`, `DRFT`. Toast: `[data-title]`, `[data-description]`.

More (testids, request and response shapes): `docs/handover-notes.md` section 6.

## 7. Commands

```bash
npm install
npx playwright test --headed      # run cases; passing ones are exported
npm run replay                    # replay with the runner
npm run build:portable            # dist/UAT-Runner(.zip)
npm run sync:elements -- <path>   # refresh and check elements/
npm run mock                      # mock OREO at http://localhost:4173 (apiBaseUrl http://localhost:4173/api/v1)
npx tsc -p .                      # type check
```

## 8. Environment

Windows + VS Code + PowerShell; company intranet, external domains do not resolve; npm through the company mirror. PO machine: no installs, has Edge. Repo: `https://github.com/Hellen-Zhu/auto_replay`.

## 9. Pitfalls (do not regress)

Readline line queue (not `rl.question`), muted echo and `discardTyped`, keys hidden from readline in the tree, `historySize: 0`, Ctrl+C never `rl.close()` at a prompt, response capture through CDP `Fetch` (not `waitForResponse` / `route.fetch`), per-click `page.unroute`, `${var:...}` resolved in targets, never fill a web component host, never repeat `/api/v1` in a path. Runner context `viewport: null` (a fixed viewport in a headed window flickers on every screenshot). Explanations: `docs/handover-notes.md` section 9.

## 10. Status and next steps

Main open items: sync the real element files on the company machine; run creation, cancellation, approval, allocation and the other events on the real system (most are mock-only or never run); confirm inferred requests (approve / reject body `{}`), risk engine mode, StepIn trades, preference reset; test the portable build on the PO's Windows machine. Full list with what is confirmed vs. inferred: `docs/handover-notes.md` section 10.

## 11. Coding conventions

- Specs read like the Java `.feature`: `await When('<feature step line>', () => flows.x.y(...))`; flows open substeps; action flows do not assert, `Then` is a separate `expect...` flow.
- Cases call only flows; flows call only page / component / API operations (no locators, no `ui.click`, no paths); pages / components / API objects hold locators and requests and only atomic operations.
- Every page action through `this.ui.xxx`, every API call through an API object (`this.ui.api`); never `page` or `fetch` directly.
- Locators: `element('<name>')` from `elements/`; never invent a name; until it exists write `{ testId: '...' }`.
- Accounts via `cfg('accounts.<role>...')`; never commit an address, IP, password or real trade ID.
- Case data only in `testdata/` (common / shared block / defaults / row), never in config or as a literal in a spec.
- Only write requests that are known; say in a comment what is inferred.
- Repo content in English; talk with the user in Chinese.
- When a fact here changes, update `docs/handover-notes.md` and keep this file short.
