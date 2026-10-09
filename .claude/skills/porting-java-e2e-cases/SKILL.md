---
name: porting-java-e2e-cases
description: Use when a case of the Java + Cucumber (Genie) E2E project has to be implemented, ported, migrated or converted into this Playwright replay project - given a .feature file, a scenario, a TC-... case ID or a .snippet of that project, or a request like "implement this Java case here". Also when a Java step that prepares data through the API (a step of TradeProvisioningSteps, "... is provisioned via playwright api") has to become an API object and a flow of this project.
argument-hint: "<E2E project path> <feature file> [case ID]"
---

# Porting a Java E2E case

## Overview

The Java + Cucumber E2E project and this project describe the same cases in the same layers. Porting is **tracing every feature step down to its leaves on the Java side, then writing each level in the matching layer here**: reuse what exists, and stop where this project has no equivalent. A leaf is an element key for a step in the browser, and a request for a step that prepares data through the API.

**Nothing is invented**: no element name, no testid, no data value, no step text, and no part of an API request (method, path, part name, payload field, response field).

This project's conventions are in `CLAUDE.md` (sections 3, 4, 5, 11) and `README.md` ("QA: writing a new case", "QA: test data", "QA: element locators", "QA: preparing data through the API"). Read them first; this skill adds only the Java side and the mapping. Two complete traces with their results are next to this file: `example-trade-creation.md` (a case in the browser only) and `example-trade-cancellation.md` (a `Given` prepared through the API, then the browser). Read the one that is closer to the case before the first port.

## Input

- The E2E project folder: argument, or `OREO_E2E_DIR`. Neither given: ask. It is read-only.
- One feature file under `src/test/resources/features/ui/`, optionally one scenario or case ID. One feature file per run.
- A feature under `features/api/` is not ported: a case without the browser shows the PO nothing. It may be read to confirm a request (see "Steps that call the API").

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
| Custom Java step in the browser | Only the equivalents listed below; anything else stops the scenario |
| Custom Java step that sends requests (`... is provisioned via playwright api`, `TradeProvisioningSteps`) | A method of `framework/flows/trade-provisioning.flow.ts` that composes operations of an API object in `framework/api/`, one per request ("Steps that call the API") |
| Request template (`REQ-TPL-...` in the test data yml) | The payload's interface in the API object; its values in `testdata/<spec>.json` |
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
   - a **custom Java step**: a Cucumber annotation in `src/test/java` (`@When("^upload '([^']*)' dat file$")`). Read the method body. When it acts on the page, its leaves are element keys; when it sends requests, go on with "Steps that call the API";
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
| `type value '<text>' into '<el>'`, or `type inner value '<var>' from stored variable into '<el>'` alone | `ui.fill(element('<el>', { inner: INNER_INPUT }), value)`: both Java steps fill `input[part='input'], textarea[part='input']` inside the element, which is the web component host also when its key ends in `_textarea`. On the New Trade form a `fields` line of kind `text` |
| `type '<var>' from stored variable into '<el>'` | The Java step fills the element itself: `ui.fill(element('<el>'), value)` |
| `click '<el>'` + `click option '<text>'` | `ui.click(element('<el>'))`, then the entry `{ role: 'menuitem', name: '<text>', exact: true }`. That role is confirmed for comboboxes and for the reason select of the trade change confirmation dialog; for another dropdown list it under "to verify" |
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
| `trigger cancellation for trade using configured risk engine mode from trade portal for trade stored as '<name>'` | `trades.clickCancelAction()`, then `trades.confirmDialog.expectVisible()` |
| `confirm cancel trade and wait for page ready` (clicks `trade_change_confirmation.confirm_btn` and waits for the answer of `POST /trades/trigger-event`) | `trades.confirmDialog.confirm()`: a plain click, nothing is read from the answer |
| `assert toast notification with type '<type>' and message '<text>'` | `app.toast.expectMessage(Toast.message.<name>)`, the text as a `static` of `Toast`. The type is not checked: "to verify" |
| `blotter row '<el>' index 0 column '<column>' is '<value>'` | `trades.expectRowShows(tradeId, <value>)`, the value as a `static` of `TradesPage`. The row contains the text, which is weaker than the Java check of one column (its implementation was not seen): "to verify" |
| `a live '<P>' trade is provisioned via playwright api` (`TradeProvisioningSteps`: the maker submits the trade through the API, the checker approves its task). The feature line `a Live '<P>' trade exists in the blotter` resolves to it | `flows.tradeProvisioning.provisionLiveTrade(product, data)`, returning the trade ID |

Another Java step: read its method.

- **Browser actions on element keys** (click, fill, set files, assert on a locator) are portable as atomic operations. A capture of a response needs its URL, method and field from the Java source, kept as a `static` of the page like `NewTradePage.createApi`.
- **Requests to the system's API**: the next section.
- **A check against a database, a file or anything else outside the page and the API** is not portable: the case format has no such action.

## Steps that call the API

A step such as `a live '<P>' trade is provisioned via playwright api` does nothing in the browser: its Java method sends requests. Each request is **read in the Java code**, then written here as an operation of an API object, and a flow composes the operations. `example-trade-cancellation.md` shows both halves for the step that is already ported.

### 1. Read every request on the Java side

Follow the step's method through its private helpers down to each call that sends a request. One step is often several requests (the maker submits, the checker approves): note them in order, and for each one fill in this table.

| What | Where it is in the Java project |
|---|---|
| Method, path, query | The sending call. `RestApiUtil.postMultipart(helper, "/trades/create?tradeAction=SUBMIT", userId, "trade", tradeJson, "datFile", datFilePath)` is a POST to that path. For another sending method read the call and, when its source is in the project, its body |
| Who sends it | The user argument of that call, followed back to the role it stands for (maker, checker). Only the role is taken, never the account |
| Shape | Multipart: the name of each part and whether it is JSON or a file. Otherwise a JSON body, or no body |
| Payload | `TestDataLoader.forKey("<KEY>").request()`: search the `*.yml` files under `src/test/resources` for `<KEY>`, follow its `requestRef` to the `REQ-TPL-...` entry and take its `request` block. Then read what the code changes in it before sending (the product, an ID from a stored variable) |
| File | `ProductDatFiles.valueOf(<product>)`: the product's dat file |
| Response fields that are used | `body.at("/data/trade/id")` followed by `ctx.set("<name>", ...)`: the field and the name it is stored under |
| Values from an earlier request | `ctx.get("<name>")` in a path or in the payload |
| Checks on the answer | An assertion on the status code, or on a field of the response (`code`, `status`) |

A scenario under `features/api/` that sends the same request, and its test data, may be read to confirm the field names and the shape of the answer.

A request that cannot be read completely (a helper or a template that is not found, a body built inside a library whose source is not in the project) is not guessed: the scenario is not ported and the report says which part is missing.

### 2. Write it in this project's style

Reuse first: `flows.tradeProvisioning.provisionLiveTrade(product, data)`, and `submitTrade`, `approveTask`, `rejectTask` of `TradesApi`. What is missing is written bottom-up, each part in its fixed place:

| Read on the Java side | Here |
|---|---|
| A request | A `static` of the API object of its area (`TradesApi.submit`); with an ID in the path, a function (`TradesApi.approve(taskId)`). Its comment says where the request was read and what the answer looks like |
| The path | The same text, starting after the prefix that `apiBaseUrl` carries: `/trades/create`, never `/api/v1/trades/create`, never a full address |
| The user argument | `headers: this.as('<role>')`: the `X-User-Id` header as a reference to `accounts.<role>.email` of the local config. The API has no login |
| `postMultipart(..., "<json part>", json, "<file part>", path)` | `multipart: { '<json part>': { json: { ... } }, '<file part>': { file: datFile(product) } }` |
| A JSON body | `body: { ... }`; a request without a body has neither `body` nor `multipart` |
| The `request` block of the template | An exported interface with the same structure, nested objects and lists included (`TradeBasic`): `Val` for a text, `number` for a number, `string` for the product |
| `body.at("/a/b/0/c")` + `ctx.set("<name>", ...)` | `save: { <name>: 'a.b.0.c' }` with the same variable name; the operation returns the saved fields as a typed object |
| `ctx.get("<name>")` in a path or in the payload | An argument of the operation, given the value that an earlier operation returned. Only a value that came out of `ui.api` / `ui.read` is recorded as `${var:<name>}`; a literal would make the replay call the recording's trade |
| An assertion that the status code is 2xx | Nothing: an `api` step fails on any other status, and on a saved field that the answer does not contain |

```ts
// framework/api/trades.api.ts: the requests, and one atomic operation per request
export class TradesApi extends BaseApi {
  static readonly submit: ApiRequest = { method: 'POST', path: '/trades/create?tradeAction=SUBMIT' };
  static readonly approve = (taskId: string): ApiRequest => ({ method: 'POST', path: `/checker/tasks/${taskId}/approve`, body: {} });

  async submitTrade(role: string, basic: TradeBasic, file: string): Promise<{ tradeId: string; taskId: string }> {
    const saved = await this.ui.api({
      ...TradesApi.submit,
      headers: this.as(role),
      multipart: { trade: { json: { basic } }, datFile: { file } },
      save: { createdTradeId: 'data.trade.id', createdTaskId: 'data.checkerContext.taskId' },
    });
    return { tradeId: saved.createdTradeId, taskId: saved.createdTaskId };
  }

  async approveTask(role: string, taskId: string) {
    await this.ui.api({ ...TradesApi.approve(taskId), headers: this.as(role) });
  }
}
```

- **API object** (`framework/api/<area>.api.ts`): a request of an area that has a class goes into that class (`TradesApi`: `/trades/...` and the checker's tasks). A new area is a new class that extends `BaseApi`, is exported from `framework/api/index.ts` and gets a getter in `App` like `tradesApi`. An operation sends one request: its first argument is the role, then the payload and the IDs. No second request and no BDD keyword in it.
- **Flow**: one method per Java step in `framework/flows/trade-provisioning.flow.ts`, named after the state it leaves (`provisionLiveTrade`), with `keyword: Keyword = 'Given'` as its last parameter and one substep per request (`I submit a new ${product} trade through the API as maker`, `I approve the trade through the API as checker`). It returns what the later steps need: the trade ID.
- **Data**: the leaf values of the template go to `defaults` of `testdata/<spec>.json` under flat names (`counterpartyFmId`, `premiumAmount`), by the rules of "Stored variables". The flow's `...Data` type lists them and is exported from `framework/flows/index.ts`. A text is used as `p.<name>` (`const p = this.params(data)`) and recorded as a parameter; a number is passed as `data.<name>` and recorded as it is, since a parameter is always text; the product is the flow's plain argument.
- **Case**: the feature line with the flow behind it, the returned ID handed to the later flows. A case never calls an API object:

  ```ts
  const tradeId = await Given(`a Live '${product}' trade exists in the blotter`, () => flows.tradeProvisioning.provisionLiveTrade(product, data));
  ```

### 3. Limits

- **The API is for the data of a `Given`.** An API call or an assertion on a response inside a `When` or a `Then` stops the scenario: what the case is about stays in the browser, or the PO's replay shows nothing.
- **A check of a response field** (`code`, `status`) has no equivalent: an `api` step checks the HTTP status and that the saved fields are there, nothing else. When it is a safety check inside a provisioning helper, port the request and list the dropped check under "to verify"; when it is what the scenario asserts, stop.
- **A payload value the Java code computes at run time** (today's date, a random reference) has no equivalent: a case file holds fixed values. Stop.
- **All or nothing.** A flow with several requests is written only when every one of them is known: a flow that stops halfway leaves a half-prepared trade in UAT on every run.
- **Inferred is said.** A part that was concluded rather than read (as the `{}` body of approve / reject was, from a content length) is stated in the request's comment and listed under "to verify".
- **Compare before changing.** When the Java source of a request this project already has is at hand, compare the two (the body of approve / reject; how the product ID and the dat file are chosen per product: this project sends the product type and `data/<PRODUCT>.dat`). Report a difference before changing an operation that other cases use.
- A second user who only sends requests is not a second login: `this.as('<role>')`.
- A case with an API step needs `apiBaseUrl` with its prefix (`.../api/v1`) and the e-mail of every role that sends a request in `config.local.json`. Say so in the report when a role is new.
- An address or an account that the Java source hard-codes is never copied.
- `TradeProvisioningSteps` has more steps of this kind (a trade with a pending cancellation, several trades, a StepIn trade that is pending approval, an amendment). None of them is ported yet: each is traced as above. A field that is read from a list (`/data/results/0/checkerTaskId`) is saved as `data.results.0.checkerTaskId`.

## Stored variables

- **Set at run time** (`createdTradeId`, by a capture, a store step or `ctx.set` after a request): the flow that produces it returns it, the case passes it to the later flows. Use the same name as `saveAs` / the key of `save`; it is recorded as `${var:<name>}` by itself.
- **Test data** (`basic.counterpartyName`, `stepIn.oldCounterpartyName`, the values of a request template): find the key in the E2E project (search `src/test/resources/`) and take its value into `testdata/`.
  - Name: flat camelCase without the group (`counterpartyName`, `oldCounterpartyName`); when the last part alone says too little, join them (`cancel.reason` -> `cancelReason`).
  - Place: already there with the same value: reuse it. Otherwise `defaults` of `testdata/<spec>.json`; `common.json` only for a value every spec shares; a row only for a case whose value differs.
  - Already there with another value: leave the existing one as it is, put this spec's value into its own `defaults` (as `portfolioId` in `testdata/trade-cancellation.json`, which differs from `common.json`) and report both values.
  - A literal in a snippet line (`selects reason option 'DEALER_ERROR'`, `types comments as '...'`) is test data too, not a literal in the flow.
  - An account, a password or an address is never test data: `cfg(...)`, which `flows.auth.login(role)` and `this.as(role)` already do.
- **The product** (`basic.productId`, the Examples value) is not data: it is the flow's plain argument, typed as the Product ID and sent as the request's `productId`.

## Where a literal translation is wrong

- **Step text**: the case's step is the feature line, word for word, keyword apart (`<product_type>` -> `${product}`). Substeps inside the flow are new `I ...` sentences in business words, not the `page new trade ...` wording; one per action the PO would recognize, so a click and the wait that follows it share one.
- **An action flow does not assert its outcome.** A check that waits until the UI is ready for the next action stays (`newTrade.expectOpen()`, `confirmDialog.expectVisible()`). A check of the result at the end of an action snippet belongs to the `expect...` flow that the `Then` calls: add it there unless that flow already checks it.
- **Pages hold no sequences.** A page snippet with several leaves becomes several atomic operations that the flow calls in order. The exception is one control operated in two moves (`Combobox.select`). The same goes for an API object: a Java helper that sends two requests becomes two operations and one flow method.
- **Reuse before writing.** A step that is already implemented is called, also from another domain: `creates a new '<p>' trade` is `flows.tradeCreation.createTrade(product, data)`, `<role> is logged in to the trade portal` is `flows.auth.login('<role>')`, a live trade is `flows.tradeProvisioning.provisionLiveTrade(product, data)`, searching a trade and opening its action menu is `flows.trades.openActionMenu(tradeId)`. Search flows, pages, components, API objects and `NewTradePage.fields` first.
- **Products come from the registry**, not from the Examples table. Add the capability (the `Capability` union, then the product's list) only for products of the Examples that are registry keys. Two products were renamed and the features may still list the old names: `FX_CO` is `FX_PSCRIPT`, `FX_FSB` is `FX_PSCRIPT_FSKO`. Use the new name everywhere (registry, case ID, `data/<PRODUCT>.dat`, the request's `productId`) and never add the old one. Any other Examples product that is not a key is not added or renamed on a guess: report it.
- **New things have a fixed place**: a page extends `BasePage`, is exported from `framework/pages/index.ts` and registered in `App`; a component extends `BaseComponent` and is a public field of the page that contains it; an API object extends `BaseApi`, is exported from `framework/api/index.ts` and registered in `App`; a domain extends `BaseFlow` and is registered in `Flows`, with its `...Data` type exported next to it (the case asks for `testData<TradeProvisioningData & TradeCancellationData>()`).
- **Every test starts with `prepare(product, '<description>')`** from `tests/support.ts`: it sets the description (one sentence on what the case does; it is shown to the PO) and skips the case while `data/<PRODUCT>.dat` is missing, which a case that uploads the file or sends it with a request needs.

## Stop and report, do not work around

Skip the whole scenario (a case that silently lacks a step claims a coverage it does not have) and go on with the others:

- a custom Java step without an equivalent, or any database / file check;
- a request that is not completely readable, a payload value computed at run time, an API call or a response assertion in a `When` or a `Then`;
- an element key that is not in `elements/` after the sync, an element whose `findBy` is not `testId`, a locator with a placeholder. Supporting another `findBy` is the user's decision, not a hand-written CSS / XPath;
- a control this project cannot operate yet (date picker, Yes / No toggle, grid cell editing): its real DOM is needed;
- a second user who acts in the browser in the same scenario, unless the Java side does it purely with UI steps (log out, log in) on defined elements; a new browser session per user cannot be expressed in a case file;
- a new tab or window, a download, a fixed wait.

Never, whatever the reason:

- edit `elements/` by hand, or write an element name that `elements/` does not define anywhere under `framework/`, comments included (the element check reads them);
- edit `mock-oreo/` to make a case pass, or `core/`, `runner/`, `framework/ui.ts`, `framework/fixtures.ts` to make a step possible: a missing action is a gap to report;
- call `page`, `page.request` or `fetch` directly, call `ui.api` outside an API object, write a data literal into a spec, loop over testdata rows, write one spec per product;
- put a server address, an IP, an account of the Java source or a password into any file; write anything but English in the repo;
- commit or push: leave git to the user.

## Workflow

1. `npm run sync:elements -- "<E2E project>"`. It refreshes `elements/` and checks the page objects; if it refuses or fails, report its message and stop.
2. Trace every scenario in scope (above), the requests of its API steps included, and decide per scenario: portable, or blocked by which step.
3. Write bottom-up what is missing: elements are already there -> page / component / API object operations -> flow methods -> capability in `framework/products.ts` -> `testdata/` -> the spec.
4. A product's `data/<PRODUCT>.dat` is missing: when `ProductDatFiles` has a constant of exactly that name, copy its file to `data/<PRODUCT>.dat` and list it in the report; otherwise leave it missing (the case is skipped) and report it. That includes the two renamed products while the E2E project has their file only under the old name: which file to take is the user's call.
5. Verify, in this order:
   - `npx tsc -p .`
   - `npm run sync:elements` (no path: check only)
   - `npx playwright test tests/<spec> --list`: the titles must start with the feature's case IDs.
6. Run the new cases only when `config.local.json` points at the real system and the `.dat` is there; a case with an API step also needs `apiBaseUrl` and the e-mail of every sending role: `npx playwright test -g "<case ID>"`. Every run books real UAT trades, through the API too: at most three runs per case. Fix only what the port got wrong (a missing `inner`, a wrong entry role); never loosen a check. A case file appears in `cases/<spec name>/` only after a pass.
7. Report.

## Report

In the conversation, in the user's language; no report file. **Ported does not mean passing**: state for every case what was actually verified.

1. **Cases**: one line per case ID: `passed, exported` / `ported, not run (why)` / `ported, failing (the error)` / `not ported (the blocking step, why, what is needed)`.
2. **Trace**: per ported scenario, feature step -> flow method (new or reused) -> substeps -> page operations -> element keys. For an API step: Java step -> its requests in order (method, path, sending role, where the payload comes from, saved fields) -> API object operation -> flow method.
3. **Files**: created and changed, `elements/` changes of the sync included.
4. **To verify on the real system**: everything assumed rather than known (an entry role, an `inner`, a built-in step outside the table, a data value, an inferred part of a request, a response check that was dropped, a difference between the Java source and an operation that already exists).
5. **Needs the user**: missing elements or testids, products that are not in the registry, missing `.dat` files, conflicting data values, Java steps without an equivalent, requests that could not be read completely, settings a new role needs in `config.local.json`.
