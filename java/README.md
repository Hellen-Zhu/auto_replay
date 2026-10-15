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
  testdata/TestDataLoaderTest.java    the 9 trade creation cases resolve to exactly the old YAML's data
src/test/resources/
  data/common.json                    shared blocks
  data/ui/trade_creation.json         the feature's data (replaces 93 lines of YAML)
  features/ui/trade_creation.feature  unchanged feature
  legacy-data/ui/trade_creation.yml   the old file, only for the equivalence test
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

## What changes for each task

| Task | Old | New |
|---|---|---|
| Add a product | one YAML entry per case of every feature | add an Examples row; register the name in `Products` if it is an old name |
| Change the default counterparty | every template of every feature | one block in `common.json` |
| A new feature | a template + one entry per case and product | a file with `use` and its own `defaults` |
| A case without data | warning, ctx empty, a later step fails | the feature's defaults |

## Porting into the E2E project

1. Copy `TestDataLoader`, `TestDataRecord`, `JsonMerge` and `Products` next to the existing classes (rename the
   package). Keep the static API the hook calls: `tcKeyFromName(name)`, `getByTcId(tcId)` throwing `AssertionError`.
   If the existing `TestDataRecord.flattenRequest()` builds array paths another way, keep that one.
2. `ScenarioLifecycleHooks`: nothing to change but the imports. Its `GenieScenario.setAttribute` calls stay; the
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
