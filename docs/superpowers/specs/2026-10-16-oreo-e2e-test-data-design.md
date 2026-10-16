# oreo-e2e test data: design

Status: draft for review. Branch: `feature/testdata-refactor`.
Scope: the Java + Cucumber (Genie) project in `oreo-e2e/` only. The Playwright side is not touched.

## 1. Goals and constraints

From the user, in their words where it matters:

1. **Easy to maintain.** Today one YAML entry per case and product, and a hand-copied full response per case (`data/api/trade_creation.yml` is 770 lines for 15 API cases).
2. **API and UI decoupled, one mechanism.** "我还是希望 api/ui 能解耦": the API and UI data trees never read each other; only the code (loader, case ID parsing, product registry, dat files) is shared.
3. **Every field of an API response is checked, per product.** "针对每个 product 我们要确保它的每个字段的正确性至少 schema 是对的，一些动态值我们可以忽略，但你就给这种部分匹配的不太行". No partial match: strict comparison of the whole response; only dynamic values are relaxed, and only to a type check.
4. Format: JSON, comments as `"_comment"` fields.
5. Defaults: a case without its own row runs on defaults; rows exist only for cases that differ.
6. Setup data (bodies sent to prepare a case, mocked answers) lives apart from case data, one readable file name per payload, no folder per file.
7. ctx variable names stay as they are (`basic.counterpartyName`, `stepIn.oldCounterpartyName`, `earlyTermination.direction`): snippets do not change.
8. Portfolio is `ABS_EQF` everywhere (UI used `CM_OIL_CRU_OPT`).
9. Kept for now: `data/common.json` (leftover of an earlier design, not read by anything) and `testdata/Products.java`.

## 2. Core idea

Two kinds of data, two ways to maintain them:

| | What it is | Who decides it | How it is kept |
|---|---|---|---|
| **Input**: request bodies, UI form values, setup payloads | what we send | QA | written by hand, layered: a value is written once, a case writes only what differs |
| **Output**: API responses | what the system returns | the system | recorded into a file per case, reviewed, committed, then compared strictly |

Recording follows Playwright's `toMatchSnapshot` / `--update-snapshots` pattern, implemented in our own assertion step. genie-rest still sends the request and returns the response; nothing in Genie changes.

## 3. File layout

```
src/test/resources/data/
  setup/                                  payloads that prepare a case; shared by API and UI
    trade-create.json
    trade-create-stepin-partial.json
    trade-create-stepin-full.json
    user-preference-defaults.json
    risk-calc-success-mock.json
    risk-calc-partial-success-mock.json
  api/
    common.json                           shared blocks for API event files
    trade_creation.json                   one file per feature file name
    expected/
      trade_creation/
        TC-TRADE-CREATION-FX_TRF-API-001.json     recorded response, one per case
        ...
  ui/
    common.json                           shared blocks for UI event files
    trade_creation.json
    trade_early_termination.json
  FX_TRF.dat, FX_PSCRIPT.dat, ...          unchanged
```

The YAML files (`data/api/*.yml`, `data/ui/*.yml`) are removed at the end of the migration (section 11).

## 4. Case IDs

Grammar: `TC-<EVENT>[-<PRODUCT>]-<CHANNEL>-<NNN>`, e.g. `TC-TRADE-CREATION-FX_PSCRIPT_TRF-API-002`.

- `CHANNEL` is `API` or `UI`: it selects the tree `data/api/` or `data/ui/`.
- `PRODUCT` is the token before the channel when it is a `ProductDatFiles` constant. Products contain `_`, never `-`, so the token is unambiguous. No such token: the case has no product (e.g. `TC-TRADE-CREATION-API-004`).
- `EVENT` is the rest, lower-cased with `-` -> `_`: `TRADE-CREATION` -> `trade_creation.json`, the same name as the feature file.

The case ID comes from the scenario name, as today (`TestDataLoader.tcKeyFromName`).

## 5. Case data

### 5.1 Files

`<channel>/common.json` holds shared blocks only; nothing in it applies unless a file or row names it in `use`. (A request default there would leak into every event's body: an early termination body has no `basic`.)

```jsonc
// data/api/common.json
{
  "_comment": "Blocks API event files pull in with \"use\".",
  "shared": {
    "trade-basic": { "request": { "basic": {
      "counterpartyFmId": "300036958", "counterpartyName": "10 AM NY", "portfolioId": "ABS_EQF",
      "direction": "Buy", "premiumAmount": 10000, "premiumCurrency": "USD" } } },
    "stepin-partial": { "request": { "basic": { "udf": [
      { "key": "stepInType",   "value": "StepInPartial", "type": "Text" },
      { "key": "oldCptyName",  "value": "10 AM JAK",     "type": "Text" },
      { "key": "oldCptyFmId",  "value": "300036957",     "type": "Text" },
      { "key": "novationDate", "value": "2026-06-10",    "type": "Date" } ] } } },
    "stepin-full": { "request": { "basic": { "udf": [ "... the same with StepInFull ..." ] } } }
  }
}
```

`<channel>/<event>.json`:

```jsonc
// data/api/trade_creation.json
{
  "_comment": "features/api/trading/trade_creation.feature",
  "defaults": {
    "use": ["trade-basic"],
    "dynamicFields": {
      "msg": "regex:Submitted for checker approval\\. TaskId: CHK-.*",
      "data.trade.id": "type",
      "data.trade.basic.dealDate": "type",
      "data.trade.basic.valueDate": "type",
      "data.trade.basic.premiumDate": "type",
      "data.checkerContext.taskId": "type"
    }
  },
  "byProduct": {
    "FX_TRF": { "dynamicFields": {
      "data.trade.instrument.version": "type",
      "data.trade.instrument.TRF.schedule": "type-tree",
      "data.trade.instrument.TRF.payoffDict": "type-tree",
      "data.trade.instrument.TRF.delivery.DD_Physical.dd_roundings": "type-tree" } },
    "FX_PSCRIPT": { "dynamicFields": {
      "data.trade.instrument.PayoffScript.trdData.DataRec.fixingSched.FS_SchedParams.fs_anchorDate": "type",
      "data.trade.instrument.PayoffScript.trdData.DataRec.fixingSched.FS_SchedParams.fs_end.SE_ByEndDate.se_endDate": "type" } },
    "FX_PSCRIPT_FSKO": { "dynamicFields": {
      "data.trade.basic.notionalAmount": "type",
      "data.trade.instrument.version": "type",
      "data.trade.instrument.PayoffScript": "type-tree" } },
    "FX_PSCRIPT_TRF": {
      "request": { "basic": { "direction": "Sell", "premiumAmount": null, "premiumCurrency": null } },
      "dynamicFields": { "data.trade.instrument": "type-tree", "data.trade.trace": "type-tree" } }
  },
  "cases": [
    { "id": "TC-TRADE-CREATION-<product_type>-API-002", "_comment": "StepIn Partial",
      "use": ["stepin-partial"],
      "byProduct": { "FX_PSCRIPT_TRF": { "request": { "basic": { "notionalCurrency": "" } } } } },
    { "id": "TC-TRADE-CREATION-<product_type>-API-003", "_comment": "StepIn Full",
      "use": ["stepin-full"],
      "byProduct": { "FX_PSCRIPT_TRF": { "request": { "basic": { "direction": "Buy", "notionalCurrency": "CNH" } } } } },
    { "id": "TC-TRADE-CREATION-API-004", "_comment": "counterparty absent: 400",
      "use": ["stepin-partial"],
      "request": { "basic": { "counterpartyFmId": "300036957", "counterpartyName": "" } },
      "dynamicFields": null },
    { "id": "TC-TRADE-CREATION-API-005", "_comment": "portfolio absent: 400",
      "use": ["stepin-full"], "request": { "basic": { "portfolioId": "" } }, "dynamicFields": null },
    { "id": "TC-TRADE-CREATION-API-006", "_comment": "checker submits: 403", "dynamicFields": null }
  ]
}
```

API-001 has no row: its four cases run on the defaults.

The `dynamicFields` above show the shape. The initial entries are derived in migration step 2 from the old responses: a rule wherever the old data had a value-level placeholder for that case, `ignore` changed to `type-tree` (approved by the user). They are confirmed or corrected at the first recording on the real system (section 9, step 6).

### 5.2 Keys

| Where | Allowed keys |
|---|---|
| `common.json` | `_comment`, `shared` |
| a shared block | `_comment`, `request`, `dynamicFields` |
| event file | `_comment`, `defaults`, `byProduct`, `cases` |
| `defaults`, a `byProduct` entry | `_comment`, `use`, `request`, `dynamicFields` |
| a case row | `id`, `_comment`, `use`, `request`, `dynamicFields`, `byProduct` |

- `request` is a JSON object: the request body (API) or the form values (UI). The name stays `request` because it becomes `_tc.request`, as today.
- `dynamicFields` exists in `data/api/` only (UI has no recorded responses).
- `byProduct` keys are `ProductDatFiles` constants.
- Any other key is a load error (it catches `byproduct`, `requests` ...).
- `_comment` is dropped at every depth before merging.
- `basic.productId` is never written: the step sets it from the product (`TradeApiSteps.setBasicProductId`; the UI flow stores the product itself).

### 5.3 Rows

A row's `id` is copied from the feature as written:

- a Scenario Outline: `TC-TRADE-CREATION-<product_type>-API-002`. It matches every case ID the Outline expands to; the `<...>` part matches the product token. Product differences go into the row's own `byProduct`.
- a plain Scenario: its case ID, e.g. `TC-TRADE-CREATION-API-004`.

A case matched by two rows is an error: one scenario, one row. A row for a single product of an Outline (`TC-TRADE-CREATION-FX_TRF-API-002` next to the Outline row) is therefore not allowed; use the row's `byProduct`.

### 5.4 Merge

Layers, applied in this order, each optional:

1. `defaults` of the event file
2. `byProduct[P]` of the event file
3. the case's row
4. `byProduct[P]` of the row

Applying a layer = apply each shared block of its `use` in order, then its own `request` and `dynamicFields`.

- Objects merge deeply; arrays and scalars replace; `null` deletes the key (`"premiumAmount": null`, `"dynamicFields": null`). The current YAML has no `null`, so this changes no migrated value.
- `dynamicFields` is a flat map of path -> rule; the path is a key, not a nested object.
- A case without a product (API-004) gets layers 1 and 3 only.
- No event file for the case: the case has no data (empty request); that is valid for a feature that needs no data.

Final request of `TC-TRADE-CREATION-FX_PSCRIPT_TRF-API-002`:

```
defaults               trade-basic                  -> basic { counterparty..., ABS_EQF, Buy, premium 10000 USD }
byProduct[FX_PSCRIPT_TRF]                          -> direction Sell, premiumAmount / premiumCurrency removed
row API-002            stepin-partial               -> basic.udf [StepInPartial, 10 AM JAK, 300036957, 2026-06-10]
row byProduct[FX_PSCRIPT_TRF]                      -> notionalCurrency ""
```

The list of applied layers is written to the report with the request (section 8).

### 5.5 UI files

```jsonc
// data/ui/common.json
{ "shared": {
    "trade-basic": { "request": { "basic": {
      "counterpartyFmId": "300036958", "counterpartyName": "10 AM NY", "portfolioId": "ABS_EQF", "direction": "Buy" } } },
    "stepin": { "request": { "stepIn": { "oldCounterpartyName": "10 AM JAK" } } } } }

// data/ui/trade_creation.json
{ "defaults": { "use": ["trade-basic"] },
  "cases": [
    { "id": "TC-TRADE-CREATION-<product_type>-UI-002", "_comment": "StepIn Full",    "use": ["stepin"] },
    { "id": "TC-TRADE-CREATION-<product_type>-UI-003", "_comment": "StepIn Partial", "use": ["stepin"] } ] }

// data/ui/trade_early_termination.json
{ "defaults": { "request": { "earlyTermination": { "direction": "Pay", "amount": "100", "ccy": "USD" } } } }
```

The hook flattens the request into ctx exactly as today: `basic.counterpartyName`, `stepIn.oldCounterpartyName`, `earlyTermination.direction`.

## 6. Setup data

One file per payload in `data/setup/`, named after what it prepares. Referenced by file name without `.json`.

```jsonc
// data/setup/trade-create.json
{
  "_comment": "Trade submitted before a case: common_trade_action.snippet (API), TradeProvisioningSteps (UI). The step sets basic.productId.",
  "request": { "basic": {
    "counterpartyFmId": "300036958", "counterpartyName": "10 AM NY", "portfolioId": "ABS_EQF",
    "direction": "Buy", "premiumAmount": 10000, "premiumCurrency": "USD" } }
}

// data/setup/trade-create-stepin-full.json
{ "extends": "trade-create",
  "request": { "basic": { "udf": [ "... StepInFull udf ..." ] } } }

// data/setup/risk-calc-success-mock.json
{ "_comment": "Answer given to the page for POST /trades/calculate-risk-for-new and /trades/<id>/calculate-risk",
  "response": { "code": 200, "status": "SUCCESS", "msg": "",
    "data": { "calculationTimestamp": "2026-08-21T08:35:21.383923927Z", "pnl": -18726.25346898106, "riskEngine": "Cortex-QR" } } }
```

Keys: `_comment`, `extends` (another setup file, merged under this one with the rules of 5.4), `request`, `response`. The two risk mocks are written out in full; the old template `RESP-TPL-MOCK-DATA-UI-001` only added `code` / `status` / `msg` and an empty `data`.

| Old key (file) | New file | Used by |
|---|---|---|
| `API-SETUP-TRADE-CREATE` (`api/trade_creation.yml`) | `trade-create` | `common_trade_action.snippet`, `TradeProvisioningSteps` |
| `API-SETUP-STEPIN-PARTIAL-TRADE-CREATE` | `trade-create-stepin-partial` | `TradeProvisioningSteps` |
| `API-SETUP-STEPIN-FULL-TRADE-CREATE` | `trade-create-stepin-full` | `TradeProvisioningSteps` |
| `SETUP-USER-PREFERENCE-CONFIG-DEFAULTS` (`ui/user_preference_config.yml`) | `user-preference-defaults` | `E2EScenarioHooks` |
| `UI-SETUP-RISK-CALC-NEW-SUCCESS` (`ui/mock_data.yml`) | `risk-calc-success-mock` | `NewTradeSteps`, `TradeLifecycleEventSteps` (3 steps) |
| `UI-SETUP-RISK-CALC-PARTIAL-SUCCESS` (`ui/mock_data.yml`) | `risk-calc-partial-success-mock` | `TradeLifecycleEventSteps` |
| `API-SETUP-TRADE-CANCELLATION` | `trade-cancellation` | `TradeProvisioningSteps` (5 steps). **Body missing** |
| `UI-SETUP-AMENDMENT` | `trade-amendment` | `TradeProvisioningSteps`. **Body missing** |

The setup trade body and the API case blocks (`trade-basic`, `stepin-*`) hold the same values today. They are kept apart on purpose: changing what an API case sends must not change how a UI case prepares its trade.

## 7. Recorded API responses

### 7.1 Where

`data/api/expected/<event>/<caseId>.json`, read and written in the source tree (`src/test/resources/...`), not in `target/`, so a recording survives `mvn clean` and shows in `git diff`. The directory is found from the classpath location of `data/` (`target/test-classes` -> project root), the way `ScenarioLifecycleHooks` finds `target/`; this works in Genie's forked JVMs whatever their working directory.

### 7.2 The step

`response matches current scenario` (`ApiResponseAssertionSteps`; every API scenario reaches it through `the '<x>' should be '<y>' successfully` or `failed to '<x>' '<y>'`, after the status code check):

```
actual = ctx.helper().response().extract().asString()        // genie-rest, as today
file   = expected/<event>/<caseId>.json
if update mode, or file missing:
    write mask(actual, case.dynamicFields) to file
    if file was missing and not update mode: fail "Expected response recorded to <file>: review it, commit it, run again"
    else: report "[expected:updated] <file>", pass
else:
    JsonAssert.assertJsonEquals(read(file), actual)          // strict, as today
    on failure: JsonUnit's diff + the file path + "intended change? run with OREO_EXPECTED=update"
```

- Update mode: environment variable `OREO_EXPECTED=update` or system property `-Doreo.expected=update`. Both are read: a forked JVM always inherits the environment, a `-D` may not reach it.
- A recording happens only after the status code check passed, so a 500 is never recorded as a positive baseline.
- Parallel runs are safe: a case writes only its own file.
- The step `response matches expected from test data '<name>'` compares strictly with the `response` of setup file `<name>`; it never records.

### 7.3 Masking rules

A rule is the value of a `dynamicFields` entry; the key is a path: keys joined by `.`, `[n]` for one array element, `[*]` for every element (keys containing `.` are not supported; none exist in the current responses).

| Rule | Written to the expected file | What is still checked |
|---|---|---|
| `type` | `${json-unit.any-string}` / `any-number` / `any-boolean` by the actual value's type; `null` stays `null` | presence and type. On an object or array: recording fails ("use type-tree") |
| `type-tree` | the subtree with every leaf replaced as by `type`; keys, array lengths and order kept | the whole structure, every leaf's type |
| `regex:<pattern>` | `${json-unit.regex}<pattern>` | the value matches; recording fails if the actual value does not |
| `ignore` | `${json-unit.ignore}` | nothing; use only when the others cannot work |

- A rule whose path is not in the actual response fails the recording ("rule `<path>` matches nothing in the response of `<case>`"): a typo, or a rule the case should not inherit (remove it for that case with `null`).
- Numbers are copied exactly as received (Jackson with exact `BigDecimal`), so `70000.0` stays `70000.0` and `20150.8410403754144` keeps every digit.
- Output is pretty-printed with a stable layout so that `git diff` shows only real changes.
- An expected file is never edited by hand: to check a field differently, change its rule and record again.

### 7.4 Daily use

| Situation | Run | Result |
|---|---|---|
| Regression | `mvn test` | strict comparison |
| New product or case | `mvn test` | its files are recorded, those scenarios fail once; review the files against the requirement, commit, run again |
| The API changed on purpose | `OREO_EXPECTED=update mvn test ...` | files rewritten; review `git diff`, commit |

The risk of recording: a system bug at the first recording becomes the baseline. That is why a first recording always fails and has to be reviewed.

## 8. Code

All new classes are in `testdata/` and depend only on Jackson, Spring core (classpath scanning) and JsonUnit, so they compile and are unit-tested without Genie.

| Class | Responsibility |
|---|---|
| `CaseId` | parses a case ID (section 4); knows the products from `ProductDatFiles` |
| `JsonLayers` | deep merge with `null` delete; drops `_comment` |
| `TestData` | facade: `forCase(String caseId) -> CaseData`, `setup(String name) -> SetupData`; loads and validates files lazily, once, thread-safe; errors name the file and key |
| `CaseData` | `request()` (merged JSON), `hasRequest()`, `flattenRequest()`, `dynamicFields()`, `layers()` (applied layers, for the report and errors) |
| `SetupData` | `request()`, `response()`, `hasRequest()`, `hasResponse()` |
| `ExpectedResponses` | file location, update mode, read, write |
| `ResponseMasker` | applies the rules of 7.3 |

Changed callers (only the lines that look data up):

| File | Change |
|---|---|
| `ScenarioLifecycleHooks` | `TestData.forCase(tcId)`; sets `_tc.key`, and when the merged request is not empty `_tc.request`, `_tc.request.<top field>` and the flattened leaves, as today; no `_tc.response`; writes the applied layers with the request; a broken data file fails the scenario instead of logging a warning |
| `ApiResponseAssertionSteps` | `response matches current scenario` as in 7.2; `... from test data '<name>'` reads setup |
| `ApiRequestSteps`, `TradeApiSteps` | `from test data '<name>'` reads setup |
| `common_trade_action.snippet` | argument `'API-SETUP-TRADE-CREATE'` -> `'trade-create'` (the step text does not change) |
| `TradeProvisioningSteps` | setup names of section 6; **sets `basic.productId` from the product before submitting**. Today it sends the template's `FX_TRF` with every product's dat file; the API steps already set it. Behaviour change, to confirm on the real system |
| `E2EScenarioHooks`, `NewTradeSteps`, `TradeLifecycleEventSteps` | setup names of section 6 |

Removed at the end: `TestDataLoader`, `TestDataRecord`, the YAML files.

## 9. Migration

Done in steps, each a commit on `feature/testdata-refactor`:

1. **Loader and recording**: the classes of section 8 with unit tests (merge, case ID parsing, row matching, masking, update mode).
2. **Data and equivalence**: write the JSON files of sections 5 and 6. A temporary test loads every old YAML key with the old `TestDataLoader` and its counterpart in the new data (a `TC-...` key: `TestData.forCase`; a setup key: the file of the table in section 6; the templates `REQ-TPL-*` / `RESP-TPL-*` have no counterpart) and compares the requests as JSON. Allowed differences, and only these:
   - `basic.productId` is gone (set by the step);
   - UI `basic.portfolioId` is `ABS_EQF` instead of `CM_OIL_CRU_OPT`.
   The old merged responses (they already carry `json-unit` placeholders) become the initial expected files, so the migration needs no environment and checks exactly what is checked today.
3. **Switch the callers** of section 8.
4. **Offline validation and lookup** (section 10).
5. **Clean up**: remove the YAML, `TestDataLoader`, `TestDataRecord` and the equivalence test; update `oreo-e2e/README.md` and `docs/handover-notes.md`.
6. **First recording on the real system** (user, company machine): `OREO_EXPECTED=update` on the API creation cases; review the diff. This replaces the converted files with real recordings. Fields that are placeholders in the old data without a rule (the warnings of check 5: `tradeType`, `currencyPair`, `rate`, `scbEntity`, `ci`, `cva`, `fva`, `vmc` ...) become exact values; for each, the review decides whether it is exact or dynamic (risk figures such as `cva` / `fva` may change from day to day: then a `type` rule and record again). The recording also answers two open points: whether the responses name the products `FX_CO` / `FX_FSB`, and the nine inferred lines of `FX_PSCRIPT_TRF-API-002/003`.

Verification here: Genie's artifacts are not reachable outside the company network, so only the `testdata/` package and its tests are built and run here (a scratch build with Jackson, Spring core, JsonUnit, JUnit). The changed glue classes are checked by reading; they compile on the company machine.

## 10. Offline validation and lookup

`TestDataValidationTest` (JUnit, no environment; `mvn test -Dtest=TestDataValidationTest`):

1. Every data file parses, has only allowed keys, every `use` and `extends` resolves, no `extends` cycle, every `byProduct` key is a `ProductDatFiles` constant with its dat file present.
2. Every case ID expanded from every feature file (scenario names, Examples column `product_type`) resolves without error, and no case matches two rows.
3. Every row matches at least one case ID; every event file has a feature file of the same name in its channel.
4. Every API case has an expected file; every expected file belongs to a case. (So a product just added to the Examples fails this check until its files are recorded and committed.)
5. Rules and expected files agree (catches a rule changed without recording again). For every rule of a case, its path exists in the expected file and holds: a placeholder for `type`, `regex:`, `ignore`; a placeholder or a tree whose leaves are all placeholders for `type-tree`. Placeholders where no rule exists are listed as warnings: they come from the converted old data, are weaker than a recording, and are the checklist of migration step 6.
6. Every setup name used in `src/main/java` (`TestData.setup("...")`) and in snippets (`from test data '...'`) exists. `trade-cancellation` and `trade-amendment` are listed in the test as known missing until their bodies arrive.

Lookup: `mvn test -Dtest=CaseDataLookup -Doreo.case=TC-TRADE-CREATION-FX_PSCRIPT_TRF-API-002` prints the applied layers, the final request, the `dynamicFields` and the expected file path.

## 11. Maintenance

| Task | What to change |
|---|---|
| New product | `ProductDatFiles` constant + `data/<P>.dat`; the product in each feature's Examples; `byProduct` entries only where its data or dynamic fields differ; run the API cases, review the recorded files, commit |
| New positive case | nothing when it runs on the defaults; otherwise a row with the feature's ID |
| New negative case | a row with the `request` change and `"dynamicFields": null` |
| New event | `data/<channel>/<event>.json` named after the feature file; shared blocks from `common.json` through `use` |
| API response gains a field | `OREO_EXPECTED=update`, review the diff |
| A field turns out dynamic | its rule in the event file (`defaults` or `byProduct`), then record again |
| Change the default counterparty | `api/common.json`, `ui/common.json`, `setup/trade-create*.json` (three places, decoupled on purpose); record API again |
| New setup payload | `data/setup/<what-it-prepares>.json`, referenced by that name |

## 12. Out of scope

- Relative dates: `novationDate` stays `2026-06-10`; changing it changes what the system receives, so it is a separate decision after the migration is green.
- The Playwright side, `data/common.json`, `testdata/Products.java` (kept, as decided).
- Features not transcribed.

## 13. Open items for the user

1. Bodies of `trade-cancellation` (`API-SETUP-TRADE-CANCELLATION`) and `trade-amendment` (`UI-SETUP-AMENDMENT`).
2. Step 6 of the migration (first recording) needs the real system.
3. Confirm the `basic.productId` fix in `TradeProvisioningSteps` (section 8).
