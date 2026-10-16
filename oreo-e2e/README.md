# oreo-e2e: layered test data for the Java E2E project

Reference implementation of this project's test data mechanism (`testdata/*.json`: shared blocks, feature
defaults, case rows, `byProduct`) for the Java + Cucumber (Genie) E2E project, with two features written end to end
on it: trade creation and trade early termination (feature, steps, page objects, data). Self-contained Maven module:
no Genie, no browser. The browser and the API are two interfaces (`OreoUi`, `OreoApi`); here they are recording
stand-ins that log each action, in the E2E project they are backed by Genie.

The folders follow the E2E project's layout (`glue`, `testdata`, `utils`, `OreoModule`, `OreoModuleConfiguration`
in `src/main`; `OreoTest`, `data`, `features/ui/trading`, `genie.properties`, `uat.properties` in `src/test`). The
package is `com.example.module.oreo` because this repository is public: rename it to the E2E project's package when
copying. Not created, as they need Genie or were not seen: `META-INF/services`, `snippet/`, `cucumber.xml`,
`elements/`, `log4j2.xml`, the other environments' properties.

## Problem it solves

The old format (`data/**/*.yml`) needs one entry per case per product, each repeating a `requestRef` and the
product ID; templates copy each other's whole `basic` block; requests are JSON text inside YAML strings; a missing
entry only logs a warning.

## Layout

**Current stage: transcription.** The E2E project's files are typed in from the user's photos as they are, without
guessing missing code and without making the project compile; only the company package prefix is written `com.example`
and the accounts' e-mail domain `example.com`, since this repository is public. Comments the user did not photograph are
left out (only comments are left out). Until all files are in, `mvn test` is not expected to pass.

The folders follow the E2E project. Files marked *placeholder* hold only a comment (Java: an empty class) and are
there so the tree matches; copy the real file over them from the E2E project.

```
pom.xml, .gitignore
.gitattributes, .mcp.json, azure-pipelines-maven.yml, .claude/, docs/   placeholders
src/main/java/com/example/module/oreo/
  OreoModule.java, OreoModuleConfiguration.java   transcribed from the E2E project
  glue/ScenarioContext.java       transcribed from the E2E project
  glue/ui/PlaywrightServiceResolver.java, CommonE2EInteraction.java, CommonE2EAssertion.java,
          CommonHelpers.java, LoginSteps.java, NewTradeSteps.java, ToastSteps.java,
          TradeDetailSteps.java, TradePortalSteps.java, TradeLifecycleEventSteps.java,
          TradeProvisioningSteps.java   transcribed from the E2E project
  glue/hooks/ScenarioLifecycleHooks.java, E2EScenarioHooks.java   transcribed from the E2E project
  glue/hooks/PlaywrightTraceHooks          placeholder
  glue/ui/LoginSteps.java                  "<role> is logged in to the trade portal" (authentication_login.snippet)
  glue/ui/NewTradeSteps.java               trade_creation.snippet
  glue/ui/TradeProvisioningSteps.java      "a Live '<P>' trade exists in the blotter" (API, forKey API-SETUP-TRADE-CREATE)
  glue/ui/TradeLifecycleEventSteps.java    lifecycle_event / common_trade_action / trade_early_termination snippets
  glue/ui/CommonE2EAssertion, CommonE2EInteraction, CommonHelpers, PlaywrightServiceResolver,
          ToastSteps, TradeDetailSteps, TradePortalSteps            placeholders
  testdata/TestDataLoader.java, TestDataRecord.java, ProductDatFiles.java   transcribed from the E2E project (YAML loader)
  testdata/Products.java          product registry: old name -> product ID (FX_CO -> FX_PSCRIPT, FX_FSB -> FX_PSCRIPT_FSKO)
  utils/DateUtil.java, RestApiUtil.java   transcribed from the E2E project
src/main/resources/
  META-INF/services/com.example.genie.module.GenieModule   placeholder (named after the GenieModule interface there)
  snippet/api/, snippet/ui/components|flows|pages/*.snippet placeholders
  snippet/ui/components/*.snippet, snippet/ui/flows/*.snippet,
          snippet/ui/pages/*.snippet   transcribed from the E2E project
  cucumber.xml                    transcribed from the E2E project
src/test/java/com/example/module/oreo/
  OreoTest.java                   the Cucumber run (features/; glue and report set here)
src/test/resources/
  data/common.json                shared blocks; setup data API-SETUP-TRADE-CREATE, UI-SETUP-RISK-CALC-NEW-SUCCESS
  data/ui/trade_creation.yml, trade_early_termination.yml, data/api/trade_creation.yml   the E2E project's YAML test data
  data/<PRODUCT ID>.dat           placeholders: FX_PSCRIPT, FX_PSCRIPT_FSKO, FX_PSCRIPT_TRF, FX_TRF
  elements/components|pages/*.json       the files the replay project has (../elements/) copied; the others []
  features/ui/trading/            trade_creation.feature, trade_early_termination.feature, as in the E2E project
  genie.properties, uat.properties       settings without accounts or addresses
  enrich, pt, sit .properties, log4j2.xml   placeholders
```

## How a step maps to the E2E project

| E2E project | Here |
|---|---|
| feature line -> FLOW snippet | a Cucumber step method (`steps/`) doing the snippet's lines in order |
| PAGE / COMPONENT snippet, built-in step on `'<element key>'` | a page object method calling `OreoUi` with the same element key |
| `ctx.clickAndWaitForResponse`, `clickWithMockedResponse`, `clickAndCaptureResponse` | the `OreoUi` methods of the same names |
| `RestApiUtil.postMultipart(...)` | `OreoApi.postMultipart(...)` |
| `ctx.riskEngineMode()` | `OreoConfig.riskEngineMode()`; `RiskCalculation.clickUsingMode` = the switch of TradeLifecycleEventSteps |
| `from stored variable 'earlyTermination.amount'` | `ctx.text("earlyTermination.amount")`, injected by the hook |

Taken from the replay project, not seen in the Java code: the login testids, `/checker/tasks/<taskId>/approve`
with `{}`, `/trades/calculate-risk-for-new` for Book (mocked like the trade's calculation), the trade detail check of
"trade is created with pending approval status and info" (trade ID and `PARV` on the header card), and the blotter
check by row and column.

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

1. Copy the `testdata` package into the E2E project's `testdata` package (rename the package). Keep the static API the hook and the steps call: `tcKeyFromName(name)`, `getByTcId(tcId)` throwing
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

To check: `cd oreo-e2e && mvn test` (both features run through Cucumber against the recording stand-ins; report in
`target/cucumber-report.html`).
