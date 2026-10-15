# Layered test data for the Java E2E project

Reference implementation of this project's test data mechanism (`testdata/*.json`: shared blocks, feature
defaults, case rows, `byProduct`) for the Java + Cucumber (Genie) E2E project, with trade creation migrated as the
first feature. Self-contained Maven module: no Genie, no browser. The step classes here only check the data the real
snippets would read.

## Problem it solves

The old format (`data/**/*.yml`) needs one entry per case per product, each repeating a `requestRef` and the
product ID; templates copy each other's whole `basic` block; requests are JSON text inside YAML strings; a missing
entry only logs a warning.

## Layout

```
src/main/java/com/oreo/uat/testdata/
  TestDataLoader.java     resolves a case ID to its record (new files, old YAML as fallback)
  TestDataRecord.java     request / response JSON + flattenRequest()
  JsonMerge.java          deep merge (objects key by key, arrays replaced)
  Products.java           product registry: old name -> product ID (FX_CO -> FX_PSCRIPT, FX_FSB -> FX_PSCRIPT_FSKO)
src/test/java/com/oreo/uat/
  hooks/ScenarioLifecycleHooks.java   same ctx keys as today (_tc.key, _tc.request, _tc.request.<field>, basic.xxx)
  steps/TradeCreationSteps.java       data-only stand-ins for the trade creation snippets
  testdata/TestDataLoaderTest.java    the 9 trade creation cases and API-SETUP-TRADE-CREATE resolve to exactly the old YAML's data
src/test/resources/
  data/common.json                    shared blocks and setup data (forKey)
  data/ui/trade_creation.json         the feature's data (replaces 93 lines of YAML)
  features/ui/trade_creation.feature  unchanged feature
  legacy-data/{ui,api}/trade_creation.yml   the old files, only for the equivalence tests
  fixture-data/                       unit test fixture for setup changes of a feature and a case
```

## Data files

`data/common.json` holds named blocks; each is a record part (`request`, `response`). A request is the API body as
it is: copy it from the browser's Network tab and paste it in.

```json
{ "shared": {
    "trade-basic": { "request": { "basic": { "portfolioId": "...", "counterpartyName": "10 AM NY", "direction": "Buy" } } },
    "step-in":     { "request": { "stepIn": { "oldCounterpartyName": "..." } } } } }
```

`data/<layer>/<feature>.json`, found from the case ID (`TC-TRADE-CREATION-FX_FSB-UI-002` -> `data/ui/trade_creation.json`):

```json
{
  "use": ["trade-basic"],
  "productPath": "basic.productId",
  "defaults": { "request": {} },
  "byProduct": { "FX_FSB": { "request": {} } },
  "cases": {
    "TC-TRADE-CREATION-UI-002": { "use": ["step-in"], "byProduct": { "FX_FSB": { "request": { "basic": { "direction": "Sell" } } } } },
    "TC-TRADE-CREATION-UI-003": { "use": ["step-in"] }
  }
}
```

Merge order, later wins, objects merged key by key, arrays replaced:

1. the file's `use` blocks
2. `defaults`
3. the case entry's `use` blocks (key = case ID without the product)
4. the case entry's `request` / `response`
5. the product ID (from `Products`) at `request.<productPath>`
6. the file's `byProduct.<product>`
7. the case entry's `byProduct.<product>`

Rules:
- A case entry is only for a case whose data differs; without one the case gets the feature's data.
- A product is never written in a data file: it comes from the case ID (the Examples' `product_type`). A product
  name has underscores (`FX_TRF`), a feature only dashes.
- Keys starting with `_` at these levels are comments; any other unknown key fails, so typos do not pass silently.
- A data variation is not a new case entry when an Examples column or `byProduct` can express it.

## Setup data for API steps (`forKey`)

A step that creates what a case needs through the API (`a live '<P>' trade is provisioned via playwright api`) loads
named data, not case data: `TestDataLoader.forKey("API-SETUP-TRADE-CREATE").request()`. Its entry is in the `setup`
section of `common.json`, the request body as copied:

```json
"setup": {
  "API-SETUP-TRADE-CREATE": {
    "productPath": "basic.productId",
    "request": { "basic": { "counterpartyFmId": "...", "portfolioId": "ABS_EQF", "productId": "FX_TRF", "direction": "Buy", "premiumAmount": 10000, "premiumCurrency": "USD" } },
    "byProduct": { "FX_FSB": { "request": {} } }
  }
}
```

- `forKey(key)` keeps the old signature. The product comes from the running case's ID; `forKey(key, product)` takes
  the product the step was given (`provisionLiveTradeByProduct(product)`). Either way the product ID goes to
  `productPath`, so the setup data has no entry per product.
- A case that needs its setup trade a little different (a notional for partial novation) changes it in its own
  feature file, not with a new setup key: `setup.<KEY>` at the top of the file (every case of the feature) or in a
  case entry, each with an optional `byProduct`. The hook tells the loader which case is running
  (`setCurrentCase` / `clearCurrentCase`).
- Merge order: the entry's `use` blocks, its `request` / `response`, the product ID, its `byProduct`, the feature's
  `setup.<KEY>` (+ `byProduct`), the case entry's `setup.<KEY>` (+ `byProduct`).
- A key `common.json` does not have is looked up in the old YAML as before (`requestRef` -> `REQ-TPL-...`).

In the step, only the call changes if the product should come from the step's argument:

```java
String tradeJson = TestDataLoader.forKey(testDataKey, product).request();
```

Not known from the E2E project: how its step puts the product into `productId` today (the old template says
`FX_TRF`). If the step sets it itself after `forKey`, drop `productPath` from the entry or remove that code.

## What changes for each task

| Task | Old | New |
|---|---|---|
| Add a product | one YAML entry per case of every feature | add an Examples row; register the name in `Products` if it is an old name |
| Change the default counterparty | every template of every feature | one block in `common.json` |
| A new feature | a template + one entry per case and product | a file with `use` and its own `defaults` |
| A case without data | warning, ctx empty, a later step fails | the feature's defaults |
| A setup trade a case needs different | a new setup key and template | `setup.<KEY>` in the case's own entry |

## Porting into the E2E project

1. Copy `TestDataLoader`, `TestDataRecord`, `JsonMerge` and `Products` next to the existing classes (rename the
   package). Keep the static API the hook and the steps call: `tcKeyFromName(name)`, `getByTcId(tcId)` throwing
   `AssertionError`, `forKey(key)` (plus the new `forKey(key, product)`).
   If the existing `TestDataRecord.flattenRequest()` builds array paths another way, keep that one.
2. `ScenarioLifecycleHooks`: add `TestDataLoader.setCurrentCase(tcId)` before the lookup and an `@After` that calls
   `clearCurrentCase()` (both in the version here); nothing else changes. Its `GenieScenario.setAttribute` calls stay; the
   version here writes to `ScenarioContext` only because Genie is not available.
3. The data root is `data/` on the classpath (or `-Doreo.testdata.dir=...`). Old YAML files under it keep working:
   a case whose feature has no `.json` file is looked up there (`requestRef` template deep-merged with the entry's
   `request`). So features migrate one at a time.
4. Migrate a feature: write its `.json`, run its scenarios and compare the `[test-data:request]` log lines with the
   ones before, then delete its YAML entries.

Assumed, to confirm against the E2E project's loader (its source was not available here): the old `requestRef`
merge is a deep merge (the per-product overrides only set `basic.productId`, so a shallow merge would lose the rest of
`basic`), and `response` is not taken from the template.

To check: `mvn test` (the equivalence test plus the feature run through Cucumber with the data-only steps).
