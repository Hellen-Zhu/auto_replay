# oreo-e2e: products and their capabilities in one place

Status: design approved by the user on 2026-10-17 (the three recommendations: registry in `ProductDatFiles`, a tag on
each Outline, capability names as in `framework/products.ts`). Branch: `feature/testdata-refactor`, after the test data
refactor (`2026-10-16-oreo-e2e-test-data-design.md`), whose `FeatureCases` and `TestDataValidationTest` this builds on.

## 1. Problem

A product's coverage is the set of Scenario Outlines whose `Examples` table lists it. Today every Outline with
`<product_type>` carries its own hand-written list, so:

- a new product is one row in each of 7 Outlines (3 API, 4 UI), more with every event that is added;
- what a product supports is nowhere stated: it is the presence or absence of rows across the feature files;
- a forgotten row cannot be detected, since nothing tells an omission from a product that does not support the
  scenario.

The Playwright side already has one registry (`framework/products.ts`: product -> capabilities, and every spec loops
`productsWith('<capability>')`). Cucumber cannot loop: an Outline's `Examples` are static text in the feature file.

## 2. Approach

One registry says which product supports which capability. Each Outline with `<product_type>` says, by a tag, which
capability it tests. A tool writes every such Outline's `Examples` from the registry, and an offline check fails while
a feature file disagrees with it. The feature files stay plain, static Cucumber: case IDs, the ADO tags, the recorded
responses and Genie's run are unchanged.

Onboarding a product becomes: its line in the registry, its dat file, one run of the tool, a review of the diff, then
the product's API responses recorded on the company machine (README "Recorded responses").

Rejected:

- One scenario looping over the products in a step: the products lose their case IDs, so the recorded responses, ADO
  and the report per case break.
- Every product in every `Examples`, unsupported ones skipped by a hook: each Outline is still edited, and the report
  fills with skipped scenarios.
- Feature files generated at run time, or a Cucumber plugin: depends on Genie's internals, which cannot be built or
  checked outside the company network.

## 3. Registry

### 3.1 Capabilities

`com.example.module.oreo.testdata.Capability`, an enum. A capability is a scenario that not every product supports;
a variation in data only (a product that is always Sell) is not a capability but a `byProduct` value.

Names follow `framework/products.ts`: each constant carries the name used there, which is also its tag.

| Constant | Name / tag | Outlines today |
|---|---|---|
| `CREATE` | `create` | `TC-TRADE-CREATION-<product_type>-API-001`, `-UI-001` |
| `STEP_IN_FULL` | `stepInFull` | `TC-TRADE-CREATION-<product_type>-API-003`, `-UI-002` |
| `STEP_IN_PARTIAL` | `stepInPartial` | `TC-TRADE-CREATION-<product_type>-API-002`, `-UI-003` |
| `EARLY_TERMINATION` | `earlyTermination` | `TC-TRADE-EARLY-TERMINATION-<product_type>-UI-001` |

A constant is added when the first Outline that needs it is, under the name `framework/products.ts` gives that event
(`cancellation`, `amendment`, `partialTermination` ...). API and UI share the constants: what a product supports does
not depend on the channel.

```java
public enum Capability {
    CREATE("create"), STEP_IN_FULL("stepInFull"), STEP_IN_PARTIAL("stepInPartial"), EARLY_TERMINATION("earlyTermination");
    public String tagName();                          // "stepInFull"
    public static Capability fromTagName(String name); // IllegalArgumentException listing the known names
}
```

### 3.2 Products

`ProductDatFiles` keeps its name, its constants, their order and `path()` (the steps and `CaseId` use them as they
are) and gains each product's capabilities, listed explicitly:

```java
FX_TRF("data/FX_TRF.dat", CREATE, STEP_IN_FULL, STEP_IN_PARTIAL, EARLY_TERMINATION),
FX_PSCRIPT("data/FX_PSCRIPT.dat", CREATE, STEP_IN_FULL, STEP_IN_PARTIAL, EARLY_TERMINATION),
FX_PSCRIPT_FSKO("data/FX_PSCRIPT_FSKO.dat", CREATE, STEP_IN_FULL, STEP_IN_PARTIAL, EARLY_TERMINATION),
FX_PSCRIPT_TRF("data/FX_PSCRIPT_TRF.dat", CREATE, STEP_IN_FULL, STEP_IN_PARTIAL, EARLY_TERMINATION),
FX_OPT("data/fx-opt.dat");   // registered, supports nothing yet: in no Examples (as today)

public Set<Capability> capabilities();                    // unmodifiable
public static List<ProductDatFiles> with(Capability c);   // registry order
```

- No "all capabilities" shortcut: a new capability is a business question per product, so adding one changes no
  product's list by itself (the tool then reports an Outline whose capability no product has, section 5.2).
- The order of the constants is the order of the `Examples` rows. `FX_TRF` stays first (`values()[0]` is the data
  checks' example product).
- The class comment "Adding a new product type" is rewritten: the dat file, the constant with its capabilities, the
  tool, the review; its outdated step "add a new `@When` step in `NewTradeSteps`" goes.

The initial capabilities are what the feature files cover today: the four products in all seven Outlines, `FX_OPT` in
none. The first run of the tool therefore changes only the order of rows in some Outlines.

## 4. Feature files

- Each Scenario Outline whose case ID contains `<product_type>` has exactly one tag `@capability#<name>` among the tags
  directly above it (on any of its tag lines), next to its other tags:
  ```gherkin
  @ADO#positive @ADO#regression @capability#stepInPartial
  Scenario Outline: [TC-TRADE-CREATION-<product_type>-API-002] Valid <product_type> Step In Partial trade ...
  ```
- Its `Examples` is one table with the single column `product_type`, one row per product of
  `ProductDatFiles.with(capability)` in registry order. The tool writes it; nobody edits it by hand.
- Scenarios without `<product_type>` (the negative and permission cases, written for one product) carry no
  capability tag and are not touched.

## 5. The tool: `SyncProductExamples`

```bash
mvn test -Dtest=SyncProductExamples -Doreo.sync=all
```

A test-side tool like `CompactExpectedFiles`: skipped (`Assume`) without `oreo.sync`; a value other than `all` fails,
naming `all`. It plans every feature file under `features/api` and `features/ui` first and writes only when the whole
plan has no error.

### 5.1 What it writes

For each Outline with `<product_type>`: the header and rows of its `Examples` table, replaced by the header and one
row per product of its capability. Nothing else in the file changes:

- the table keeps its indentation (that of its first line);
- every cell is padded to the widest value of the column (`product_type` or the longest product), as the existing
  tables are: `| FX_PSCRIPT_FSKO |`;
- the file's line separator (LF or CRLF) and its final newline are kept; files are read and written as UTF-8;
- a file whose text does not change is not rewritten, so a second run changes nothing.

It prints one line per Outline: `<feature file> <row ID>: <note>`, the note being `unchanged`, `add FX_X`,
`remove FX_Y` (or both, `add FX_X, remove FX_Y`), `reordered` or `reformatted` (same products, other padding).

### 5.2 What stops it (nothing is written)

- an Outline with `<product_type>` and no capability tag, or with two;
- a capability tag whose name is not a `Capability` (the message lists the known names);
- a capability tag on a Feature, a plain Scenario, an `Examples` block, or an Outline without `<product_type>`;
- an Outline with no `Examples`, with several `Examples` tables, or with a column other than `product_type`;
- a capability that no product has (an Outline would have no rows).

### 5.3 Shared parsing

`FeatureCases` and the tool read feature files the same way. The parsing moves into one test-side model of a feature
file (its scenarios with their tags, name line, outline flag and `Examples` tables with their line positions);
`FeatureCases` builds its case list from it, the tool its plan. `FeatureCasesTest` keeps passing unchanged.

## 6. Offline check

New in `TestDataValidationTest` (check 8 of section 10 of the test data design): `productExamplesMatchTheRegistry` plans the tool
without writing.

- Any error of 5.2 fails the check.
- A planned change fails the check too, one line per Outline (`<file> <row ID>: <note>` as in 5.1), ending with the
  tool's command. A difference is a coverage difference: the run would test a product
  the registry says does not support the scenario, or skip one it says does. (The compaction check only warns: a file
  that is not compacted still checks the same thing.)
- A `Capability` that no Outline carries is printed as a warning (`[warn] capability X: no Outline tests it`); it is
  not an error, since a product may be registered ahead of an event's Outline.

## 7. Code

| File | Change |
|---|---|
| `src/main/.../testdata/Capability.java` | new (3.1) |
| `src/main/.../testdata/ProductDatFiles.java` | capabilities, `capabilities()`, `with(...)`, class comment (3.2) |
| `src/test/.../testdata/FeatureFile.java` | new: the parsed feature file (5.3) |
| `src/test/.../testdata/FeatureCases.java` | built on `FeatureFile` |
| `src/test/.../testdata/ProductExamples.java` | new: `plan(featuresRoot)` / `write(plan)` with records `Entry` and `Plan`, as `ExpectedCompaction` |
| `src/test/.../testdata/SyncProductExamples.java` | new: the tool (5) |
| `src/test/.../testdata/TestDataValidationTest.java` | `productExamplesMatchTheRegistry` (6) |
| tests | `CapabilityTest`, `ProductDatFilesTest` (`with` order, unmodifiable set), `FeatureFileTest`, `ProductExamplesTest` (every error of 5.2, padding, CRLF kept, idempotence, nothing written on error), feature texts written to a `TemporaryFolder` as `FeatureCasesTest` does |
| the 7 Outlines | their capability tag; rows in registry order (written by the tool, checked by reading the plan here) |
| `.claude/skills/onboarding-e2e-product/SKILL.md` | QA answers per capability; the change is the registry line, the dat file, the tool |
| `README.md`, `docs/handover-notes.md` | "Products and capabilities" in "Test data"; the Maintenance rows "New product" and "New event"; the tool under Commands |

No glue class, snippet, hook, data file or expected file changes.

## 8. Migration

Each step a commit on `feature/testdata-refactor`:

1. `Capability`, the capabilities in `ProductDatFiles`, their tests.
2. `FeatureFile`, `FeatureCases` on top of it.
3. `ProductExamples`, `SyncProductExamples`, the check, their tests and fixtures.
4. The tags on the 7 Outlines and the rows in registry order (the plan of step 3 applied by hand here, since nothing
   runs on this machine; the tool's first run on the company machine must then report every Outline `unchanged`).
5. Skill, README, handover notes.

## 9. Verification

Nothing of oreo-e2e is built or run on this machine (user ruling): the code is written against `oreo-e2e/pom.xml`
and checked by reading; tests are written first and their failures and passes are argued by reading. On the company
machine:

```bash
mvn test -Dtest='com.example.module.oreo.testdata.*Test'
mvn test -Dtest=SyncProductExamples -Doreo.sync=all
```

The first must pass; the second must print `unchanged` for all 7 Outlines and leave `git status` clean.

## 10. Not in scope

- A run-time guard in the hook (a scenario whose product lacks the tagged capability): the offline check runs with
  `mvn test` and catches it first.
- `Examples` with columns other than `product_type`, or several tables per Outline: an error until needed.
- A check that this registry agrees with `framework/products.ts`: separate projects; only the names are shared.
- Renaming `ProductDatFiles`, and `Products.java` (no caller; kept as decided).

## 11. Inferred, to confirm on the company machine

- Genie accepts a tag it does not know (`@capability#...`): inferred from the free tags already in use (`@playwright`,
  `@api`, `@test`, `@ADO#...`).
- Feature files checked out with CRLF keep CRLF after the tool (5.1).
