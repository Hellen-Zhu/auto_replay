# oreo-e2e: the Java E2E project with layered test data

The Java + Cucumber (Genie) E2E project's file tree, transcribed from the user's photos, with its test data moved
from YAML to layered JSON case data, setup files and recorded API responses compared strictly (section "Test data").
Design and reasons: `docs/superpowers/specs/2026-10-16-oreo-e2e-test-data-design.md`.

The folders follow the E2E project's layout (`glue`, `testdata`, `utils`, `OreoModule`, `OreoModuleConfiguration`
in `src/main`; `OreoTest`, `data`, `features/ui/trading`, `genie.properties`, `log4j2.xml` in `src/test`). The
package is `com.example.module.oreo` because this repository is public: rename it to the E2E project's package when
copying. Not created, as they need Genie or were not seen: `META-INF/services`, `snippet/`, `cucumber.xml`,
`elements/`, `log4j2.xml`, the other environments' properties.

## Problem it solves

The old format (`data/**/*.yml`) needed one entry per case per product, each repeating a `requestRef` and the
product ID; templates copied each other's whole `basic` block; requests were JSON text inside YAML strings; every API
case carried a hand-copied full response (770 lines for 15 API cases); a missing entry only logged a warning.

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
  glue/api/RestServiceResolver.java, ApiRequestSteps.java, ApiResponseAssertionSteps.java,
          TradeApiSteps.java   transcribed from the E2E project
  glue/hooks/ScenarioLifecycleHooks.java, E2EScenarioHooks.java   transcribed from the E2E project
  glue/hooks/PlaywrightTraceHooks          placeholder
  glue/ui/LoginSteps.java                  "<role> is logged in to the trade portal" (authentication_login.snippet)
  glue/ui/NewTradeSteps.java               trade_creation.snippet
  glue/ui/TradeProvisioningSteps.java      "a Live '<P>' trade exists in the blotter" (API, setup data trade-create)
  glue/ui/TradeLifecycleEventSteps.java    lifecycle_event / common_trade_action / trade_early_termination snippets
  glue/ui/CommonE2EAssertion, CommonE2EInteraction, CommonHelpers, PlaywrightServiceResolver,
          ToastSteps, TradeDetailSteps, TradePortalSteps            placeholders
  testdata/ProductDatFiles.java   transcribed from the E2E project
  testdata/TestData, TestDataRepository, CaseData, SetupData, CaseId, JsonLayers, Json,
          ExpectedResponses, ResponseMasker, ProjectPaths, TradeRequests   test data and recording ("Test data")
  testdata/Products.java          product registry: old name -> product ID (FX_CO -> FX_PSCRIPT, FX_FSB -> FX_PSCRIPT_FSKO)
  utils/DateUtil.java, RestApiUtil.java   transcribed from the E2E project
src/main/resources/
  META-INF/services/com.example.genie.module.GenieModule   placeholder (named after the GenieModule interface there)
  snippet/api/common_api.snippet, common_trade_action.snippet, trade_creation.snippet,
          snippet/ui/components/*.snippet, snippet/ui/flows/*.snippet,
          snippet/ui/pages/*.snippet, elements/**/*.json,
          pom.xml, genie.properties, log4j2.xml   transcribed from the E2E project
  cucumber.xml                    transcribed from the E2E project
src/test/java/com/example/module/oreo/
  OreoTest.java                   the Cucumber run (features/; glue and report set here)
  testdata/*Test.java, FeatureCases.java, CaseDataLookup.java   unit tests, offline checks, case lookup
src/test/resources/
  data/api/, data/ui/, data/setup/   the test data ("Test data")
  data/common.json                left from an earlier design; nothing reads it (kept on purpose)
  testdata-fixtures/data/         small data files for the loader's unit tests
  data/<PRODUCT ID>.dat           placeholders: FX_PSCRIPT, FX_PSCRIPT_FSKO, FX_PSCRIPT_TRF, FX_TRF
  elements/components|pages/*.json       the files the replay project has (../elements/) copied; the others []
  features/ui/trading/            trade_creation.feature, trade_early_termination.feature, as in the E2E project
  genie.properties, log4j2.xml          settings (addresses and accounts are placeholders)
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

## Test data

```
src/test/resources/data/
  api/common.json, ui/common.json       shared blocks; they apply only where a file names them in "use"
  api/<event>.json, ui/<event>.json     one per feature file name: defaults, byProduct, case rows
  api/expected/<event>/<caseId>.json    recorded API responses, one per case: in full, or a patch on a base case
  setup/<name>.json                     payloads that prepare a case (trade-create, risk-calc-success-mock ...)
  <PRODUCT>.dat                         the products' dat files
```

API and UI data never read each other; only the code is shared.

### Case data

The case ID in the scenario name selects the file and the product:
`TC-TRADE-CREATION-FX_PSCRIPT_TRF-API-002` -> `data/api/trade_creation.json`, product `FX_PSCRIPT_TRF`. A product is a
`ProductDatFiles` constant; an ID without one (`TC-TRADE-CREATION-API-004`) is a case without a product.

```jsonc
{
  "_comment": "features/api/trading/trade_creation.feature",
  "defaults":  { "use": ["trade-basic"], "dynamicFields": { "data.trade.id": "type" } },
  "byProduct": { "FX_PSCRIPT_TRF": { "request": { "basic": { "direction": "Sell", "premiumAmount": null } } } },
  "cases": [
    { "id": "TC-TRADE-CREATION-<product_type>-API-002", "_comment": "StepIn Partial", "use": ["stepin-partial"] },
    { "id": "TC-TRADE-CREATION-API-004", "request": { "basic": { "counterpartyName": "" } }, "dynamicFields": null }
  ]
}
```

- Layers, each optional, later wins: `defaults` -> `byProduct[P]` -> the case's row -> the row's `byProduct[P]`.
  A layer applies its `use` blocks in order, then its own `request` and `dynamicFields`. A case without a product
  gets `defaults` and its row only.
- Objects merge key by key; arrays and values replace; `null` removes a key. `_comment` is a comment at any depth.
- A row exists only for a case that differs from the defaults. Its `id` is the feature's, as written: an Outline's
  `TC-TRADE-CREATION-<product_type>-API-002` covers every product; product differences go into the row's `byProduct`.
  A case matched by two rows is an error.
- Any other key is a load error. `basic.productId` is never written: the step sets it from the product.
- The hook puts the request into ctx as before (`_tc.key`, `_tc.request`, `_tc.request.<field>`, flat leaves such as
  `basic.counterpartyName`) and writes the applied layers to the report (`[test-data:layers]`).

### Setup data

`data/setup/<name>.json`: `request` and / or `response`, `_comment`, and `extends` (another setup file, merged
under this one). Read by the steps `... from test data '<name>'` and by `TestData.setup("<name>")`. The setup trade
and the API case blocks hold the same values but are kept apart on purpose: what an API case sends must not change
how a UI case prepares its trade. `trade-cancellation` and `trade-amendment` have no file yet (not covered).

### Recorded responses

`response matches current scenario` (behind `the '<x>' should be '<y>' successfully` and `failed to ...`, after the
status code check) compares the response strictly with `data/api/expected/<event>/<caseId>.json`:

| Situation | Run | Result |
|---|---|---|
| Regression | `mvn test` | strict comparison |
| New product or case | `mvn test`, then the compaction | its file is recorded and the scenario fails once: compact, review the file against the requirement, commit, run again |
| The API changed on purpose | `OREO_EXPECTED=update mvn test ...` (or `-Doreo.expected=update`), then the compaction | the files are rewritten in full and compacted again: review `git diff`, commit |

The values that change from run to run are masked by the case's `dynamicFields` (path -> rule) when the file is
recorded:

| Rule | Still checked |
|---|---|
| `type` | presence and type of the value |
| `type-tree` | the whole structure, and the type of every leaf |
| `regex:<pattern>` | the value matches the pattern |
| `ignore` | nothing; only when the others cannot work |

A path is keys joined by `.`, `[n]` for one array element, `[*]` for all. A rule whose path is not in the response
fails the recording. Never edit an expected file by hand: change the rule and record again.

### Base and patch

The variants of a case return mostly the same response, so a variant's file holds only its differences from a
base case of the same product. The event file declares the base once:

```jsonc
"defaults": { "expectedBase": "TC-TRADE-CREATION-<product_type>-API-001", ... }
```

`<product_type>` becomes the case's product, so `FX_TRF-API-002` builds on `FX_TRF-API-001`. A case without a
product, and the base case itself, have no base; a `byProduct` entry or a row may name another base, or `null`.
A base has no base of its own.

```json
{
  "_base": "TC-TRADE-CREATION-FX_TRF-API-001",
  "_patch": [
    { "op": "replace", "path": "/data/trade/basic/eventStatus", "value": "..." },
    { "op": "add", "path": "/data/trade/basic/udf", "value": [ "..." ] }
  ]
}
```

The case is compared strictly with the base's file plus the ops. Recording always writes the full response; the
compaction then turns the variants into patches:

```bash
mvn test -Dtest=CompactExpectedFiles -Doreo.compact=trade_creation
```

(`all` for every event.) Objects are compared key by key, arrays of the same length element by element, other arrays
are replaced whole; a patch that is not shorter than the full response is not written. Any problem (a base without a
file, a patch that does not apply) stops it before a file is written, and a second run changes nothing. Then review
`git diff` and commit. A change every variant shares (a new response field) shows in the base files only.

Re-record a base together with its variants. A base recorded alone can leave a variant's patch that no longer fits
(an `add` on a key the base now has); that case then fails with an error naming the op. The way out is in the error:
record the case again with `OREO_EXPECTED=update` (update mode does not read the file), then compact.

### Commands

```bash
mvn test -Dtest='com.example.module.oreo.testdata.*Test'
```

The unit tests and the offline checks of `TestDataValidationTest` (no environment needed): every data file loads,
every case of every feature resolves, every row and event file has its feature, every API case has its expected file
and every expected file its case, the rules agree with the expected files, every setup name used exists, the expected
files resolve and are compacted (a file the compaction would still change is a warning).

```bash
mvn test -Dtest=CaseDataLookup -Doreo.case=TC-TRADE-CREATION-FX_PSCRIPT_TRF-API-002
```

Prints the merged data of one case: the applied layers, the request, the `dynamicFields`, the `expectedBase`, the
expected file (full, or patch on which base) and the expected response in full.

The offline tests are JUnit 4. Should `mvn test -Dtest=TestDataValidationTest` report no tests (a JUnit Platform
without the vintage engine), add `org.junit.vintage:junit-vintage-engine` in test scope.

### Maintenance

| Task | What to change |
|---|---|
| New product | `ProductDatFiles` constant and `data/<P>.dat`; the product in each feature's Examples; `byProduct` only where its data or dynamic fields differ; run the API cases, compact, review the recorded files, commit (no base to declare: `defaults` covers every product) |
| New positive case | nothing when it runs on the defaults; otherwise a row with the feature's ID; after the recording, compact |
| New negative case | a row with the `request` change and `"dynamicFields": null` |
| New event | `data/<channel>/<event>.json`, named after the feature file; shared blocks through `use` |
| A field turns out dynamic | its rule in the event file (`defaults` or `byProduct`), then record again |
| Change the default counterparty | `api/common.json`, `ui/common.json`, `setup/trade-create*.json` (three places, on purpose); record the API cases again |
| New setup payload | `data/setup/<what-it-prepares>.json`, referenced by that name |
