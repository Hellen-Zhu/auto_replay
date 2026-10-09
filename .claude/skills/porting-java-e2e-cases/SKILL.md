---
name: porting-java-e2e-cases
description: Use when a case of the Java + Cucumber (Genie) E2E project has to be implemented, ported, migrated or converted into this Playwright replay project - given a .feature file, a scenario, a TC-... case ID or a .snippet of that project, or a request like "implement this Java case here".
argument-hint: "<E2E project path> <feature file> [case ID]"
---

# Porting a Java E2E case

## Overview

The Java + Cucumber E2E project and this project describe the same cases in the same layers. Porting is **tracing every feature step down to its element keys on the Java side, then writing each level in the matching layer here**: reuse what exists, and stop where this project has no equivalent.

**Nothing is invented**: no element name, no testid, no data value, no step text, no API call.

This project's conventions are in `CLAUDE.md` (sections 3, 4, 11) and `README.md` ("QA: writing a new case", "QA: test data", "QA: element locators"). Read them first; this skill adds only the Java side and the mapping. `example-trade-creation.md` (next to this file) is one complete trace with its result: read it before the first port.

## Input

- The E2E project folder: argument, or `OREO_E2E_DIR`. Neither given: ask. It is read-only.
- One feature file under `src/test/resources/features/ui/`, optionally one scenario or case ID. One feature file per run. `features/api/` is out of scope.

## Layers

| Java E2E project | This project |
|---|---|
| `features/ui/<area>/<event>.feature` | `tests/<event>.spec.ts` in kebab-case (`trade_cancellation.feature` -> `tests/trade-cancellation.spec.ts`), one `test.describe` |
| Scenario / Scenario Outline, case ID `TC-...` | One `test` titled `[<case ID>] <what it does>`. An Outline is one test in a loop over `productsWith('<capability>')`, the ID built from the product: `[TC-TRADE-CREATION-${product}-UI-001]` |
| Examples column `product_type` | `framework/products.ts`: the scenario's capability on those products |
| Feature step line | `await When('<same text>', () => flows.<domain>.<method>(...))` |
| **FLOW** snippet (the one a feature step matches) | A public method of `framework/flows/<domain>.flow.ts`; its body lines become substeps: `this.ui.When / And('I ...', async () => { ... })` |
| **PAGE** / **COMPONENT** snippet (`page <page> ...`, `component <name> ...`) | Atomic operations of `framework/pages/<page>.page.ts` / `framework/components/<name>.ts`, called by the flow inside a substep |
| Built-in Genie step on `'<element key>'` | `this.ui.<action>(element('<same key>'))` inside that atomic operation |
| Custom Java step | Only the equivalents listed below; anything else stops the scenario |
| Stored variable | Run-time value: the flow's return value. Test data: `testdata/` + `this.params(data)` |
| `ProductDatFiles`, `src/test/resources/data/<P>.dat` | `datFile(product)`, `data/<PRODUCT>.dat` |

## Tracing a step on the Java side

1. Take the step line without its keyword (in an Outline, with an Examples value filled in) and match it against the regex of every snippet entry. Snippets are all `*.snippet` files of the project: find them by extension. An entry is an annotation and its indented body; `$1`, `$2` are the regex's capture groups; the annotation's keyword plays no part in matching:

   ```
   @When "^creates a new '([^']*)' trade$"
     When page trade portal clicks new trade button
     And upload '$1' dat file
   ```

2. Resolve each body line the same way, until it is one of:
   - a **custom Java step**: a Cucumber annotation in `src/test/java` (`@When("^upload '([^']*)' dat file$")`). Read the method body;
   - a **built-in Genie step**: defined nowhere in the project (`click '<element>'`, `assert that ...`).
3. The layer of a snippet is given by its section header (`# - FLOW: TRADE CREATION -`, `# - PAGE: NEW TRADE -`) and its wording: a flow snippet carries the feature's business wording, a page snippet starts with `page <page> ...`, a component snippet with `component <name> ...`.
4. For every leaf note the element keys, the stored variables and the literal texts.

A line that matches no entry and is not a recognizable built-in step, or matches several entries: stop that scenario.

## Built-in Genie steps

Seen so far. The `UI` class has `goto`, `fill`, `click`, `rightClick`, `clickAndCapture`, `upload`, `press`, `read`, `expectVisible`, `expectText`, `expectUrl` for the page, plus `api` for a request to the system's API, and nothing else.

| Genie step | Here |
|---|---|
| `click '<el>'` | `ui.click(element('<el>'))` |
| `type inner value '<var>' from stored variable into '<el>'` + `click option from stored variable '<var>'` | A combobox: `new Combobox(ui, element('<el>', { inner: 'input' })).select(value)`. On the New Trade form: one line in `NewTradePage.fields` (kind `combobox`), operated by `setField` |
| `type inner value ... into '<el>'` alone | `ui.fill(element('<el>', { inner: 'input' }), value)`; on the New Trade form a `fields` line of kind `text` |
| `click '<el>'` + `click option '<text>'` | `ui.click(element('<el>'))`, then the entry `{ role: 'menuitem', name: '<text>', exact: true }`. That role is confirmed for comboboxes only: list it under "to verify" |
| `assert that '<el>' is eventually visible` | `ui.expectVisible(element('<el>'))`. An `sc-modal` host is 0 x 0: assert its slotted header, as `ConfirmDialog` does |
| `assert that '<el>' eventually contains from stored variable '<var>'` | `ui.expectText(element('<el>'), value)` |
| `assert that '<el>' eventually contains '<text>'` | `ui.expectText(element('<el>'), '<text>')`; a fixed UI text such as a status badge is a `static` of the page (`TradeDetailPage.status`) |
| `atomic refresh webpage and wait for page ready` | `ui.goto(<Page>.path)` of the page that is open; there is no reload action. Path unknown or carrying an id: stop |

A built-in step that is not in this table is ported only when its wording maps onto exactly one of those `UI` methods; say so in the report. Otherwise stop.

## Custom Java steps with an equivalent

| Java step | Here |
|---|---|
| `upload '<P>' dat file` | `newTrade.uploadDat(datFile(product))` |
| `click save / book using configured risk engine mode for new trade creation` | `newTrade.clickSave()` / `newTrade.clickBook()`, no extra waits |
| `confirm new trade creation and capture response as '<x>'` + `store e2e response field '<field>' from stored variable '<x>' as '<name>'` | `newTrade.confirmDialog.confirmAndCapture({ ...NewTradePage.createApi, saveAs: '<name>' })` |
| `search for trade stored as '<name>' in blotter` | `trades.searchTrade(tradeId)` |
| `open action menu item for new today blotter from stored variable '<name>'` | `trades.openActionMenu(tradeId)`: a right-click on the trade's row. Both together, as in `page trade portal searches and opens action menu for trade stored as '<name>'`: `flows.trades.openActionMenu(tradeId)` |
| `a Live '<P>' trade exists in the blotter` (`TradeProvisioningSteps`: the maker submits the trade through the API, the checker approves its task) | `flows.tradeProvisioning.provisionLiveTrade(product, data)`, returning the trade ID. It needs `apiBaseUrl` (with its prefix, `.../api/v1`) and the checker's e-mail in the local config |

Another Java step: read its method. Only browser actions on element keys (click, fill, set files, assert on a locator) are portable, as atomic operations; a capture of a response needs its URL, method and field from the Java source, kept as a `static` of the page like `NewTradePage.createApi`. A call to the system's API is portable only as an operation of an API object in `framework/api/` (see `TradesApi`, and "QA: preparing data through the API" in `README.md`), and only when its method, path, headers and body are all readable in the Java source: a request that is partly hidden behind a helper or a template that cannot be found is not guessed. An address or an account that the Java source hard-codes is never copied: the address is `apiBaseUrl` of the local config, the sender `this.as('<role>')`. A path is written without the prefix that `apiBaseUrl` carries (`/api/v1`): `/trades/create`, not `/api/v1/trades/create`. A check against a database, a file or anything else outside the page and the API is not portable: the case format has no such action.

## Stored variables

- **Set at run time** (`createdTradeId`, by a capture or store step): the flow that captures it returns it, the case passes it to the later flows. Use the same name as `saveAs`; it is recorded as `${var:<name>}` by itself.
- **Test data** (`basic.counterpartyName`, `stepIn.oldCounterpartyName`): find the key in the E2E project (search `src/test/resources/data/`) and take its value into `testdata/`.
  - Name: flat camelCase without the group (`counterpartyName`, `oldCounterpartyName`); when the last part alone says too little, join them (`cancel.reason` -> `cancelReason`).
  - Place: already there with the same value: reuse it. Otherwise `defaults` of `testdata/<spec>.json`; `common.json` only for a value every spec shares; a row only for a case whose value differs.
  - Already there with another value: do not overwrite it; report both values.
  - An account, a password or an address is never test data: `cfg(...)`, which `flows.auth.login(role)` already does.
- **The product** (`basic.productId`, the Examples value) is not data: it is the flow's plain argument, typed as the Product ID.

## Where a literal translation is wrong

- **Step text**: the case's step is the feature line, word for word, keyword apart (`<product_type>` -> `${product}`). Substeps inside the flow are new `I ...` sentences in business words, not the `page new trade ...` wording; one per action the PO would recognize, so a click and the wait that follows it share one.
- **An action flow does not assert its outcome.** A check that waits until the UI is ready for the next action stays (`newTrade.expectOpen()`, `confirmDialog.expectVisible()`). A check of the result at the end of an action snippet belongs to the `expect...` flow that the `Then` calls: add it there unless that flow already checks it.
- **Pages hold no sequences.** A page snippet with several leaves becomes several atomic operations that the flow calls in order. The exception is one control operated in two moves (`Combobox.select`).
- **Reuse before writing.** A step that is already implemented is called, also from another domain: `creates a new '<p>' trade` is `flows.tradeCreation.createTrade(product, data)`, `<role> is logged in to the trade portal` is `flows.auth.login('<role>')`. Search flows, pages, components and `NewTradePage.fields` first.
- **Products come from the registry**, not from the Examples table. Add the capability (the `Capability` union, then the product's list) only for products of the Examples that are registry keys. An Examples product that is not a key is not added or renamed on a guess: report it.
- **New things have a fixed place**: a page extends `BasePage`, is exported from `framework/pages/index.ts` and registered in `App`; a component extends `BaseComponent` and is a public field of the page that contains it; a domain extends `BaseFlow` and is registered in `Flows`, with its `...Data` type exported next to it (the case asks for `testData<TradeCreationData & ...>()`).
- **Every test sets its description** (one sentence on what the case does; it is shown to the PO), and a test that uploads a `.dat` is skipped while that file is missing: see `prepare()` in `tests/trade-creation.spec.ts`. A second spec that needs the skip shares it through a helper module under `tests/` instead of copying it.

## Stop and report, do not work around

Skip the whole scenario (a case that silently lacks a step claims a coverage it does not have) and go on with the others:

- a custom Java step without an equivalent, an API call whose request is not fully known, or any database / file check;
- an element key that is not in `elements/` after the sync, an element whose `findBy` is not `testId`, a locator with a placeholder. Supporting another `findBy` is the user's decision, not a hand-written CSS / XPath;
- a control this project cannot operate yet (date picker, Yes / No toggle, grid cell editing): its real DOM is needed;
- a second login in one scenario, unless the Java side does it purely with UI steps (log out, log in) on defined elements; a new browser session per user cannot be expressed in a case file;
- a new tab or window, a download, a fixed wait.

Never, whatever the reason:

- edit `elements/` by hand, or write an element name that `elements/` does not define anywhere under `framework/`, comments included (the element check reads them);
- edit `mock-oreo/` to make a case pass, or `core/`, `runner/`, `framework/ui.ts`, `framework/fixtures.ts` to make a step possible: a missing action is a gap to report;
- call `page` directly, write a data literal into a spec, loop over testdata rows, write one spec per product;
- put a server address, an IP or a password into any file; write anything but English in the repo;
- commit or push: leave git to the user.

## Workflow

1. `npm run sync:elements -- "<E2E project>"`. It refreshes `elements/` and checks the page objects; if it refuses or fails, report its message and stop.
2. Trace every scenario in scope (above) and decide per scenario: portable, or blocked by which step.
3. Write bottom-up what is missing: elements are already there -> page / component operations -> flow methods -> capability in `framework/products.ts` -> `testdata/` -> the spec.
4. A product's `data/<PRODUCT>.dat` is missing: when `ProductDatFiles` has a constant of exactly that name, copy its file to `data/<PRODUCT>.dat` and list it in the report; otherwise leave it missing (the case is skipped) and report it.
5. Verify, in this order:
   - `npx tsc -p .`
   - `npm run sync:elements` (no path: check only)
   - `npx playwright test tests/<spec> --list`: the titles must start with the feature's case IDs.
6. Run the new cases only when `config.local.json` points at the real system and the `.dat` is there: `npx playwright test -g "<case ID>"`. Every run books real UAT trades: at most three runs per case. Fix only what the port got wrong (a missing `inner`, a wrong entry role); never loosen a check. A case file appears in `cases/<spec name>/` only after a pass.
7. Report.

## Report

In the conversation, in the user's language; no report file. **Ported does not mean passing**: state for every case what was actually verified.

1. **Cases**: one line per case ID: `passed, exported` / `ported, not run (why)` / `ported, failing (the error)` / `not ported (the blocking step, why, what is needed)`.
2. **Trace**: per ported scenario, feature step -> flow method (new or reused) -> substeps -> page operations -> element keys.
3. **Files**: created and changed, `elements/` changes of the sync included.
4. **To verify on the real system**: everything assumed rather than known (an entry role, an `inner`, a built-in step outside the table, a data value).
5. **Needs the user**: missing elements or testids, products that are not in the registry, conflicting data values, Java steps without an equivalent.
