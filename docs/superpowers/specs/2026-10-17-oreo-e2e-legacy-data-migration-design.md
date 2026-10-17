# oreo-e2e: migrating the remaining events' test data

Status: draft for the user's review, 2026-10-17.
Scope: `oreo-e2e/` (Java + Cucumber) only. Builds on `2026-10-16-oreo-e2e-test-data-design.md` (the mechanism, "the
test data design" below) and `2026-10-17-oreo-e2e-product-capabilities-design.md` (capability tags).

## 1. Goal and constraints

- The user: the remaining events' API and UI cases move to the new test data mechanism, quickly ("剩余的 event 的
  api/ui 的 case 都采用这种新的机制 ... 快速转化"). Done already: creation (API, UI), early termination (UI).
- The old YAML of those events exists only on the company machine, so the migration runs there, one feature file at a
  time. This repository gets the tool, the check and the skill; no event data of the company is committed here.
- No local build ("不在本机验证，按照我给的 pom 文件的版本来"): the code is checked by reading here, its unit tests run first
  on the company machine. No new dependency: the old loader's YAML parser came with the same `pom.xml`, unchanged
  since.
- The result is what a hand migration gives (sections 5 and 6 of the test data design): the same files and layering
  rules, and every case's request unchanged except the two allowed differences of that migration: `basic.productId`
  is dropped (the step sets it), a UI `basic.portfolioId` `CM_OIL_CRU_OPT` becomes `ABS_EQF`.
- Nothing is invented: a value, rule or name the old data does not give is a proposal in the report, decided in the
  review.

## 2. Overview

| Part | What | Where |
|---|---|---|
| `MigrateLegacyData` | plans, checks and writes the data of one feature file | `src/test/java/.../testdata/` |
| `LegacyEquivalenceTest` | the new data gives what the old data gave, for every migrated event | same |
| skill `migrating-legacy-event-data` | the routine, the review checklist, the report | `oreo-e2e/.claude/skills/` |

The old loader comes back for the time of the migration, in test scope only (`LegacyData`: `TestDataLoader` and
`TestDataRecord` as they were before commit `0be22bc`, logic unchanged), so glue code cannot use it again. The YAML
files stay in `data/` until the last event is migrated: their keys are global, and a case may reference a template in
another event's file.

The routine:

```bash
# once, first: the setup payloads (3.7)
mvn test -Dtest=MigrateLegacyData -Doreo.migrate=setup -Doreo.migrate.write=true

# per feature file
mvn test -Dtest=MigrateLegacyData -Doreo.migrate=trade_cancellation                          # plan only
mvn test -Dtest=MigrateLegacyData -Doreo.migrate=trade_cancellation -Doreo.migrate.write=true
#   review the event files; add the capability (3.9)
mvn test -Dtest=SyncProductExamples -Doreo.sync=all
mvn test -Dtest=CompactExpectedFiles -Doreo.compact=trade_cancellation                        # API only
mvn test -Dtest='com.example.module.oreo.testdata.*Test'                                       # offline checks + equivalence
#   commit
```

Without `-Doreo.migrate.write=true` nothing is written. `-Doreo.migrate=all` plans every feature file that has no event
file yet: the inventory before starting (which convert as they are, which need a decision first).

## 3. The tool

### 3.1 Input

`-Doreo.migrate=<name>`: `features/api/**/<name>.feature` and `features/ui/**/<name>.feature` (one or both). Per
channel:

- the cases: the case IDs of the feature (`FeatureCases`: Outlines expanded over their `product_type` column);
- their old data: the record the old hook found (`getByTcId`: the key itself, else a key ending with `.<case ID>`),
  resolved by `LegacyData` (references and local patches);
- orphans: old keys of the same event and channel that no case of the feature matches; listed, not migrated.

A UI channel none of whose cases has old data gets no event file (valid for a feature that needs no data); for the API
channel see 3.2.2.

### 3.2 Stop conditions

The feature is not migrated, nothing of it is written, the report says why:

1. A case ID's event part is not `<name>` (e.g. `TC-ALLOC-UI-001` in `trade_allocation.feature`): the new mechanism
   finds the event file by the case ID, so the feature file or the IDs are renamed first. User's decision.
2. An API case without old data: it would have no expected file (check 4).
3. The old loader fails (missing reference, cycle, duplicate key).
4. Its event file exists already (migrated before; delete it to migrate again).
5. The self-check (3.8) finds a difference.
6. A file under `src/main/java` still calls `TestDataLoader`.

### 3.3 The request of a case

The old request with `basic.productId` removed and, in the UI channel, `basic.portfolioId` `CM_OIL_CRU_OPT` replaced
by `ABS_EQF`. Any other portfolio value stays and is listed (a portfolio reassignment's target is case data).

### 3.4 Layering

The requests are cut into leaves: a path of object keys to a value; arrays and empty objects are values (the layers
replace them whole). Then, in this order:

1. `defaults`: a leaf whose value (or absence) is held by more than half of the channel's cases with data. When
   absence wins, nothing is written.
2. `byProduct[P]`: a leaf whose value is held by more than half of product P's cases and differs from what step 1
   gives them.
3. The row (`id` as written in the feature: the Outline's ID with `<product_type>`, or the scenario's case ID): a leaf
   whose value all of the row's cases hold and at least one of them does not get from steps 1-2.
4. The row's `byProduct[P]`: what is still different for the case of product P.

A difference is the case's value, or `null` where the case lacks the key; one `null` on an object when the case lacks
the whole object. A UI case without old data gets a row that sets each top-level key of its layered request to
`null`, with `"_comment": "no case data in the old YAML"`, so that it keeps having none.

Rows only for cases with a difference, in feature order, each with `"_comment"` = the scenario's name after its ID;
`byProduct` entries in registry order. No `use`: replacing a part with a shared block of `common.json` is a review
step, which the equivalence test checks.

### 3.5 `dynamicFields` (API)

The old responses carry `json-unit` placeholders. In the creation migration some became rules (values that change from
run to run: IDs, dates, the task ID) and the others did not (values the old template could not know: they become exact
values at the first real recording; check 5 warns about them meanwhile). The tool cannot tell them apart, so a
placeholder gets a rule only when:

- it is a regex: `regex:<pattern>`;
- the same path has a rule in an event file migrated before: that rule.

Every other placeholder path is listed in the report, once per path with its products. The rules are placed like the
request (3.4); a case left without rules where the layers give some gets `"dynamicFields": null`.

### 3.6 Expected files and base (API)

Each API case's old response is written in full to `data/api/expected/<name>/<caseId>.json`, the way a recording
writes it. When the feature has two or more product Outlines, `defaults.expectedBase` is the first one's row ID (as
`TC-TRADE-CREATION-<product_type>-API-001` in creation); `CompactExpectedFiles` then turns the variants into patches.

### 3.7 Setup payloads (`-Doreo.migrate=setup`, once)

A setup key is an old key of the name table below, or an old key used by name where check 6 looks
(`TestData.setup("...")`, the provisioning helpers' arguments, `from test data '...'` in snippets and features), or in
an old call `TestDataLoader.forKey("...")`. Other keys that are not cases are templates: they live on only through the
cases that reference them. For every setup key:

- its name: the name table `LegacyMigration.SETUP_NAMES`, which starts as the table of the test data design
  (section 6: `API-SETUP-TRADE-CANCELLATION` -> `trade-cancellation`, `UI-SETUP-AMENDMENT` -> `trade-amendment` ...);
  otherwise the key lower-cased without its `API-SETUP-`, `UI-SETUP-` or `SETUP-` prefix. Another name for a key is a
  line added to the table, so that the tool and the equivalence test always pair the same key and file;
- its file `data/setup/<name>.json` with the resolved `request` and / or `response` in full (no `extends`; the review
  may add one). A file that exists already with the same payload is kept; with another payload it is a stop;
- every quoted use of the old key in those places becomes the new name.

`KNOWN_MISSING` of `TestDataValidationTest` is emptied of the names now written.

### 3.8 Self-check and report

Before writing, the tool merges every case's layers (`JsonLayers`, in the loader's order) and compares the request and
the rules with 3.3 and 3.5, and each expected file with the old response (as JSON). Any difference stops the feature.

The report, in the plan and after writing: per channel the event file, the leaves per layer, one line per case (its
layers), the orphans, the placeholder paths without a rule, the portfolio values kept, the setup names and replaced
references (file:line), the capability proposal (3.9) and the stop reasons.

### 3.9 Capability proposal

For each product Outline without a `@capability#` tag: the proposed name (the feature name without `trade_`, in
camelCase: `trade_partial_termination` -> `partialTermination`, which is the Playwright `framework/products.ts` name)
and the products of its `Examples`. The tool does not edit the feature, `Capability` or `ProductDatFiles`: the tag, the
constant and the capability on those products are added by hand in the review; `SyncProductExamples` must then say
`unchanged` for that Outline (otherwise the registry and the old `Examples` disagree: decide).

## 4. Equivalence test

`LegacyEquivalenceTest` (the check removed in `0be22bc`, generalized) runs with the offline tests while YAML files
exist (skipped with a message when none):

- every old case key whose event has an event file in its channel: the request of `TestData.forCase` equals the old one
  after 3.3; numbers are compared as doubles (the old loader rounded merged entries);
- every case of such an event without old data: no request;
- every old key that is not a case and whose name (3.7: the table, else the rule) has a file in `data/setup/`: the
  payload equals. This also checks an `extends` added in the review.

Events without an event file are listed as not migrated. Expected files are not compared here: the tool checks them
when it writes them (3.8), and after a real recording they differ on purpose.

## 5. The skill

`oreo-e2e/.claude/skills/migrating-legacy-event-data/SKILL.md`, in the style of `onboarding-e2e-product`:

- when to use: an event still in YAML, "migrate the cancellation data", "move the remaining cases to the new test
  data";
- the routine of section 2;
- the review checklist: the defaults make sense, rows and their comments, the `null`s, a part equal to a shared block
  becomes `use`, YAML comments worth keeping become `_comment`, the placeholder paths, the portfolio values, the setup
  names;
- the stop conditions and what the user decides for each;
- never: edit an expected file by hand, invent a value or a rule, delete a YAML file before the end;
- the report: one line per case (`migrated` / `not migrated: why`), the files written, the open decisions.

Checked like the onboarding skills: a subagent applies it to the fixture of section 7 and its report is compared with
the expected one.

## 6. End of the migration

When every feature has its event file and `-Doreo.migrate=all` lists nothing: remove the YAML files, the classes of
section 7, their fixtures and the skill; update `oreo-e2e/README.md` (maintenance table) and `docs/handover-notes.md`.
Then the first real recording of the migrated API events (`OREO_EXPECTED=update`, compact, review), as step 6 of the
test data design.

## 7. Code and tests

Package `com.example.module.oreo.testdata` in `src/test/java` (next to `FeatureCases` and `FeatureFile`, which it uses):

| Class | Responsibility |
|---|---|
| `LegacyData` | the old loader, logic unchanged |
| `Layering` | 3.4 on leaves: pure, no files |
| `LegacyMigration` | the plan of one feature or of the setup keys (3.1-3.9), and its writing |
| `MigrateLegacyData` | the tool: properties, report, write on request; skipped without `oreo.migrate` |
| `LegacyEquivalenceTest` | section 4 |

Unit tests:

- `LayeringTest`: synthetic cases for each step of 3.4 and for 3.5 (majority, byProduct, row, row byProduct, `null`
  on a key and on an object, `"dynamicFields": null`).
- `LegacyMigrationTest` on a fixture of real old data (`testdata-fixtures/legacy/`: the YAML of creation, early
  termination and the risk mocks from before `0be22bc`, with their two feature files): no stop; every case's layered
  request equals the old one; early termination gets `defaults` only; `FX_PSCRIPT_TRF` gets `direction` `Sell` and
  the `premium*` keys removed in `byProduct`; the setup keys get the names of the design's table; the regex
  placeholder of `msg` becomes a rule.

These tests are the first thing to run on the company machine.

## 8. Decisions for the review

1. A placeholder gets a rule only as in 3.5; the others stay check 5 warnings until the first real recording.
2. A case ID whose event part is not the feature's name stops that feature (3.2.1).
3. The YAML stays until the end; the equivalence test covers requests and setup payloads, not expected files.
4. A UI case without old data keeps having none (a `null` row); an API case without old data stops the feature.
5. Only the portfolio `CM_OIL_CRU_OPT` is replaced; other portfolio values are listed.
6. The setup payloads first, in one step, named by one table in the code (the design's table, plus a line for any
   other name), else by the rule of 3.7.

Out of scope: the Playwright side; relative dates; the real recording itself (section 6).
