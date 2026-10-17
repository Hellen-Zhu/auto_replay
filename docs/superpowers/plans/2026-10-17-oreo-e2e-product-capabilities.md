# oreo-e2e Product Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register each product's capabilities once in `ProductDatFiles` and write every product Outline's `Examples` from that registry, with an offline check that fails while a feature file disagrees.

**Architecture:** A `Capability` enum (names as in `framework/products.ts`) and the capabilities per `ProductDatFiles` constant (main). Test side: one parsed model of a feature file (`FeatureFile`) under both `FeatureCases` and the new `ProductExamples` (plan / write, like `ExpectedCompaction`); the tool `SyncProductExamples` and the check `productExamplesMatchTheRegistry` both run its plan. The 7 Outlines get a `@capability#<name>` tag.

**Tech Stack:** as in `oreo-e2e/pom.xml`: Java 21, JUnit 4.13.2, the JDK only for the new code. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-17-oreo-e2e-product-capabilities-design.md` (approved 2026-10-17). § refers to it.

## Global Constraints

- Repo content in English; the repository is public: no company name, e-mail domain, internal host, IP, password or real trade / task ID in any file. Before every push: `bash <workspace>/check.sh <base>` (copied from the previous plan's workspace; git-ignored).
- Branch `feature/testdata-refactor`; never push to `main`; commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Before each task: the local folder equals HEAD (`git archive HEAD oreo-e2e | tar -x` into a scratch dir, `rsync -ani --checksum` against the local `oreo-e2e/`, no `>f` or `*deleting` line); if not, stop and ask. After each push: rsync `oreo-e2e/` (excluding `target`, `.DS_Store`) and the changed `docs/` files back.
- **No build or test run on this machine** (user ruling). Every "Run" step names the command the user runs on the company machine and its expected result; here the step is checked by reading, and the ledger says so. The per-task gate (`task-done`) is `check.sh <BASE>`.
- New code depends on the JDK only (check.sh's import whitelist: `java.`, `com.example.module.oreo.testdata.`, JUnit).
- Untouched: glue classes, snippets, hooks, data files, expected files, `Products.java`, `data/common.json`, ctx names, step regexes.
- Capability names exactly: `create`, `stepInFull`, `stepInPartial`, `earlyTermination` (§3.1). Tag prefix exactly `@capability#`.
- Tool command exactly `mvn test -Dtest=SyncProductExamples -Doreo.sync=all`.

## Review Focus

1. Tags split over two lines above an Outline, with a blank or comment line between them and the Outline: all belong to the Outline. Test: `FeatureFileTest.tagsOverSeveralLinesBelongToTheNextBlock` (Task 2).
2. A file without a final newline, and a CRLF file: rewriting keeps both. Tests: `FeatureFileTest.rendersBackTheSameText` (Task 2), `ProductExamplesTest.keepsCrlfAndTheRestOfTheFile` (Task 3).
3. A UTF-8 BOM at the start of a feature file (Windows editors): parsed as if absent, written back. Test: `FeatureFileTest.bomIsKept` (Task 2).
4. A table with the right products but hand-made padding: the check fails ("reformatted"), the tool fixes it, a second run changes nothing. Test: `ProductExamplesTest.notesSayWhatChanged` (Task 3).
5. A tag with another letter case (`@capability#Create`): a loud error, not a silently unmanaged Outline. Test: `ProductExamplesTest.unknownTagIsAnError` (Task 3).

---

### Task 1: Capabilities in the registry

**Files:**
- Create: `oreo-e2e/src/main/java/com/example/module/oreo/testdata/Capability.java`
- Modify: `oreo-e2e/src/main/java/com/example/module/oreo/testdata/ProductDatFiles.java`
- Test: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/CapabilityTest.java`, `ProductDatFilesTest.java`

**Interfaces:**
- Produces: `enum Capability { CREATE("create"), STEP_IN_FULL("stepInFull"), STEP_IN_PARTIAL("stepInPartial"), EARLY_TERMINATION("earlyTermination") }` with `public static final String TAG_PREFIX = "@capability#"`, `String tagName()`, `static Capability fromTagName(String name)`; `ProductDatFiles.capabilities(): Set<Capability>` (unmodifiable), `static ProductDatFiles.with(Capability): List<ProductDatFiles>` (registry order).

- [ ] **Step 1: Write the failing tests**

```java
// CapabilityTest
@Test public void tagNamesFollowThePlaywrightRegistry() {
    assertEquals(List.of("create", "stepInFull", "stepInPartial", "earlyTermination"),
            Arrays.stream(Capability.values()).map(Capability::tagName).toList());
}
@Test public void fromTagNameFindsEachConstant() {
    for (Capability c : Capability.values()) assertEquals(c, Capability.fromTagName(c.tagName()));
}
@Test public void unknownTagNameListsTheKnownNames() {
    // IllegalArgumentException; message contains "'Create' is not a capability" and "create, stepInFull, stepInPartial, earlyTermination"
}
// ProductDatFilesTest
@Test public void withKeepsRegistryOrder() {
    assertEquals(List.of(FX_TRF, FX_PSCRIPT, FX_PSCRIPT_FSKO, FX_PSCRIPT_TRF), ProductDatFiles.with(Capability.CREATE));
}
@Test public void everyCapabilityHasTheFourProductsToday() { /* with(c) is those four for each c */ }
@Test public void fxOptSupportsNothing() { assertTrue(FX_OPT.capabilities().isEmpty()); }
@Test(expected = UnsupportedOperationException.class) public void capabilitiesAreUnmodifiable() {
    FX_TRF.capabilities().add(Capability.CREATE);
}
@Test public void fxTrfStaysFirst() { assertEquals(FX_TRF, ProductDatFiles.values()[0]); }
```

- [ ] **Step 2: Run** `mvn test -Dtest='CapabilityTest,ProductDatFilesTest'` — Expected: compile failure (`Capability`, `with`, `capabilities` missing). Here: by reading.

- [ ] **Step 3: Implement** `Capability` (§3.1) and, in `ProductDatFiles`, the constructor `(String classpathPath, Capability... capabilities)` storing an unmodifiable `EnumSet` (empty for none), the four products with all four capabilities, `FX_OPT` with none (§3.2), `capabilities()`, `with(...)`. Rewrite the class comment's "Adding a new product type" as: the dat file under `src/test/resources/data/`; the constant with its capabilities (order = `Examples` order, never first); `mvn test -Dtest=SyncProductExamples -Doreo.sync=all`; review `git diff`. Keep every constant's own comment and `path()`.

- [ ] **Step 4: Run** the same command — Expected: 8 tests pass. Here: by reading.

- [ ] **Step 5: Commit** `Add capabilities to the product registry`.

### Task 2: One parsed model of a feature file

**Files:**
- Create: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/FeatureFile.java`
- Modify: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/FeatureCases.java` (built on `FeatureFile`)
- Test: `FeatureFileTest.java` (new); `FeatureCasesTest.java` unchanged and still passing

**Interfaces:**
- Produces (package-private, test side):
  ```java
  final class FeatureFile {
      enum Kind { FEATURE, BACKGROUND, RULE, SCENARIO, OUTLINE }
      record Table(List<String> tags, int headerLine, int lastLine, String indent,
                   List<String> header, List<List<String>> rows) {
          List<String> column(String name);   // that column's values, empty when absent
      }
      record Block(Kind kind, List<String> tags, int line, String rowId, List<Table> examples) {}
      static FeatureFile read(Path file);     // UTF-8; UncheckedIOException "[FeatureFile] cannot read <file>"
      static FeatureFile parse(Path file, String text);
      Path file(); List<String> lines(); List<Block> blocks();
      String render(List<String> lines);      // BOM, line separator and final newline as read
  }
  ```

- [ ] **Step 1: Write the failing tests** (`FeatureFileTest`, texts inline as in `FeatureCasesTest`)

```java
@Test public void readsBlocksTagsAndExamples() {
    // "@api\nFeature: X\n\n  @ADO#positive @capability#create\n  Scenario Outline: [TC-X-<product_type>-API-001] t\n"
    // + "    Given s\n\n    @ex\n    Examples:\n      | product_type |\n      | FX_TRF       |\n"
    // blocks: FEATURE tags [@api]; OUTLINE line 4, tags [@ADO#positive, @capability#create],
    // rowId "TC-X-<product_type>-API-001"; one table: tags [@ex], headerLine 9, lastLine 10, indent "      ",
    // header [product_type], column("product_type") [FX_TRF], column("other") []
}
@Test public void tagsOverSeveralLinesBelongToTheNextBlock() {
    // "  @a\n  @b @c\n\n  # note\n  Scenario: [TC-X-API-002] t\n" -> SCENARIO tags [@a, @b, @c]
}
@Test public void docStringLinesAreNotTagsOrTables() {
    // a step with """ ... @x ... | y | ... """ -> no tags, no table from inside it
}
@Test public void rendersBackTheSameText() {
    // for each of LF with final newline, LF without, CRLF with, CRLF without:
    // assertEquals(text, f.render(f.lines()))
}
@Test public void bomIsKept() {
    // "﻿@api\nFeature: X\n": FEATURE tags [@api]; render(lines()) starts with "﻿"
}
```

- [ ] **Step 2: Run** `mvn test -Dtest='FeatureFileTest,FeatureCasesTest'` — Expected: compile failure (`FeatureFile` missing). Here: by reading.

- [ ] **Step 3: Implement `FeatureFile`.** Line separator: CRLF if the text (BOM stripped) contains `\r\n`, else LF; `lines()` split on `\r?\n`, without the empty last element of a final newline. Walk the lines by `strip()`: blank or `#` lines keep pending tags; a `"""` or ```` ``` ```` line toggles a doc string whose lines are skipped; an `@` line adds its whitespace-separated `@` tokens to the pending tags; `Feature:`, `Background:`, `Rule:`, `Scenario Outline:` / `Scenario Template:` (OUTLINE), `Scenario:` / `Example:` (SCENARIO) start a block that takes the pending tags (`rowId` = `CaseId.fromScenarioName(line)` for SCENARIO and OUTLINE, else null); `Examples:` / `Scenarios:` (tested before `Example:`) starts a table of the current block, taking the pending tags; the contiguous `|` lines after it are the header and rows (cells trimmed as `FeatureCases.cells` does today); any other line ends a table.

- [ ] **Step 4: Rebuild `FeatureCases.load`** on `FeatureFile.read`: each SCENARIO / OUTLINE block with a `rowId`; an OUTLINE whose `rowId` contains `<product_type>` expands over `column("product_type")` of every table, with today's error messages (`has no Examples column product_type to expand`, `has a placeholder other than`). Remove the old line walk and its `Scenario` class.

- [ ] **Step 5: Run** the same command — Expected: 5 + 3 tests pass. Here: by reading, `FeatureCasesTest` traced through the new code.

- [ ] **Step 6: Commit** `Parse feature files once for case IDs and tables`.

### Task 3: The sync tool and its check

**Files:**
- Create: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/ProductExamples.java`, `SyncProductExamples.java`
- Modify: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/TestDataValidationTest.java` (new check, §6)
- Test: `ProductExamplesTest.java`

**Interfaces:**
- Consumes: `FeatureFile` (Task 2), `Capability`, `ProductDatFiles.with` (Task 1).
- Produces:
  ```java
  final class ProductExamples {
      record Entry(String file, String rowId, Capability capability, List<String> before, List<String> after,
                   List<String> oldLines, List<String> newLines) {
          boolean changed();   // !oldLines.equals(newLines)
          String note();       // "unchanged" | "add A, B" / "remove C" / "add A, remove C" | "reordered" | "reformatted"
      }
      record Plan(List<Entry> entries, Map<Path, String> rewrites, List<String> errors, List<String> warnings) {}
      static Plan plan(Path featuresRoot, Function<Capability, List<String>> productsOf);
      static List<String> registryProducts(Capability c);   // ProductDatFiles.with(c) names
      static void write(Plan plan);   // errors: IllegalStateException "[ProductExamples] nothing written, <n> problem(s):\n  ..."
  }
  ```
  `file` in entries and messages is the path relative to `featuresRoot` with `/` (`ui/trading/trade_creation.feature`).

- [ ] **Step 1: Write the failing tests** (`ProductExamplesTest`, TemporaryFolder, features under `api/trading/` and `ui/trading/`, `productsOf` from a `Map<Capability, List<String>>`)

```java
@Test public void writesRowsFromTheRegistry() {
    // file: "@api\nFeature: X\n\n  @ADO#positive @capability#create\n  Scenario Outline: [TC-X-<product_type>-API-001] t\n"
    //   + "    Given s\n\n    Examples:\n      | product_type |\n      | FX_PSCRIPT   |\n      | FX_TRF       |\n"
    // registry CREATE -> [FX_TRF, FX_PSCRIPT, FX_PSCRIPT_TRF]; write(plan(...)); the file is exactly the same text
    // with the table "      | product_type   |\n      | FX_TRF         |\n      | FX_PSCRIPT     |\n      | FX_PSCRIPT_TRF |\n";
    // the entry's note is "add FX_PSCRIPT_TRF"
}
@Test public void keepsCrlfAndTheRestOfTheFile() { /* the same file in CRLF: output has "\r\n" between all lines, no bare "\n" */ }
@Test public void secondRunChangesNothing() { /* after write: plan again -> rewrites empty, every note "unchanged" */ }
@Test public void notesSayWhatChanged() {
    // rows [FX_PSCRIPT, FX_TRF], registry [FX_TRF, FX_PSCRIPT] -> "reordered";
    // rows "| FX_TRF |" (other padding), registry [FX_TRF] -> "reformatted"; registry [FX_TRF] on rows [FX_TRF, FX_OPT] -> "remove FX_OPT"
}
@Test public void errorWritesNothing() { /* two files, one Outline without a tag: write throws, both files byte-identical */ }
@Test public void missingTagIsAnError() { /* "has no @capability# tag" */ }
@Test public void twoTagsAreAnError() { /* "2 @capability# tags" */ }
@Test public void unknownTagIsAnError() { /* @capability#Create -> "is not a capability", "create, stepInFull" */ }
@Test public void misplacedTagIsAnError() {
    // on the Feature, on a plain Scenario, on an Examples block, on an Outline without <product_type>:
    // each "only an Outline with <product_type> carries one"
}
@Test public void tableOtherThanOneProductColumnIsAnError() {
    // two Examples tables; a column besides product_type; no Examples -> "Examples must be one table with the single column product_type"
}
@Test public void capabilityWithoutProductIsAnError() { /* registry STEP_IN_FULL -> [] : "no product has capability stepInFull" */ }
@Test public void scenarioWithoutProductTypeIsLeftAlone() { /* a plain Scenario without tag: no entry, no error */ }
@Test public void unusedCapabilityIsAWarning() { /* only create tagged: warnings contain "capability stepInFull: no Outline tests it" */ }
```

- [ ] **Step 2: Run** `mvn test -Dtest=ProductExamplesTest` — Expected: compile failure. Here: by reading.

- [ ] **Step 3: Implement `ProductExamples.plan`.** Files: `.feature` under `featuresRoot/api` and `featuresRoot/ui`, sorted. Per block, with `caps` = its tags starting with `Capability.TAG_PREFIX`:
  - every such tag on a table of any block, and every one on a block that is not an OUTLINE whose `rowId` contains `<product_type>`: `<file>: @capability#x on <the Feature | the Scenario <rowId or "at line N"> | an Examples block of <rowId> | the Outline <rowId> without <product_type> | the Background / Rule at line N>: only an Outline with <product_type> carries one`;
  - managed Outline: no tag `<file>: <rowId> has no @capability# tag; known: create, stepInFull, stepInPartial, earlyTermination`; two or more `<file>: <rowId> has <n> @capability# tags: <tags>`; unknown name `<file>: <rowId>: ` + the `fromTagName` message; not exactly one table whose header is `[product_type]` `<file>: <rowId>: Examples must be one table with the single column product_type`; `productsOf` empty `<file>: <rowId>: no product has capability <name> (ProductDatFiles)`;
  - else an `Entry`: `before` = the table's column, `after` = `productsOf(cap)`, `oldLines` = lines `headerLine..lastLine`, `newLines` = header and rows formatted `indent + "| " + value padded to the widest of "product_type" and the products + " |"`.

  `rewrites`: for each file with a changed entry, its lines with the tables replaced (last table first, so line numbers hold), rendered by `FeatureFile.render`. `warnings`: `capability <name>: no Outline tests it` for each `Capability` no entry has. `note()`: `unchanged` when lines are equal; else `add ...` / `remove ...` (registry order, `", "` between products, `", "` between the two parts) when the sets differ; else `reordered` when the order differs; else `reformatted`.

- [ ] **Step 4: Implement `write`** (UTF-8 bytes of each rewrite; nothing when `errors` is not empty) and **`SyncProductExamples`** on the model of `CompactExpectedFiles`: `Assume` that `oreo.sync` is set (`"set -Doreo.sync=all"`); a value other than `all` fails (`"-Doreo.sync=<v>: the only value is all"`); plan `ProjectPaths.projectRoot().resolve("src/test/resources/features")` with `ProductExamples::registryProducts`; errors -> `AssertionError("Nothing written, <n> problem(s):\n  ...")`; else write, print `<file> <rowId>: <note>` per entry, the warnings as `[warn] ...`, and `<n> Outline(s) rewritten: review git diff, then commit.`

- [ ] **Step 5: Add `productExamplesMatchTheRegistry`** to `TestDataValidationTest` under a `// ── 10.8 ──` header: plan as the tool does; errors, then one error per changed entry `<file> <rowId>: <note>; run mvn test -Dtest=SyncProductExamples -Doreo.sync=all`; warnings printed as `expectedFilesAreCompacted` prints its own; `failOn(errors)`.

- [ ] **Step 6: Run** `mvn test -Dtest=ProductExamplesTest` — Expected: 13 tests pass. Here: by reading.

- [ ] **Step 7: Commit** `Write product Outlines' Examples from the registry, and check them`.

### Task 4: Tag the Outlines

**Files:**
- Modify: `oreo-e2e/src/test/resources/features/api/trading/trade_creation.feature`, `features/ui/trading/trade_creation.feature`, `features/ui/trading/trade_early_termination.feature`

- [ ] **Step 1:** Append the capability tag to the tag line above each Outline (§3.1 table): API-001 `create`, API-002 `stepInPartial`, API-003 `stepInFull`, UI-001 `create`, UI-002 `stepInFull`, UI-003 `stepInPartial`, early termination UI-001 `earlyTermination`.
- [ ] **Step 2:** Put each table's rows in registry order (`FX_TRF`, `FX_PSCRIPT`, `FX_PSCRIPT_FSKO`, `FX_PSCRIPT_TRF`), padding unchanged (width 15).
- [ ] **Step 3: Verify** with an offline Python model of `ProductExamples.plan` in the workspace (not a substitute for the Java run): every Outline `unchanged`, no error, no warning. On the company machine: `mvn test -Dtest=SyncProductExamples -Doreo.sync=all` prints `unchanged` 7 times and `git status` stays clean.
- [ ] **Step 4: Commit** `Tag the product Outlines with their capability`.

### Task 5: Skill and docs

**Files:**
- Modify: `oreo-e2e/.claude/skills/onboarding-e2e-product/SKILL.md`, `oreo-e2e/README.md`, `docs/handover-notes.md`, the spec's status line

- [ ] **Step 1: Skill.** QA answers yes / no per `Capability` (list each with the Outlines that carry its tag: `grep -rn "@capability#" src/test/resources/features`), not per Outline; section 2 becomes: the `ProductDatFiles` constant with its capabilities, the dat file (or placeholder), `byProduct` where values differ, then the tool (run on the company machine; here give the command) — no hand edit of `Examples`. A capability the product needs that no Outline has is a new scenario (report). Offline check expectations: before the tool runs, `productExamplesMatchTheRegistry` lists `add <P>` per Outline; after it, only `everyApiCaseHasItsExpectedFile` until the recordings.
- [ ] **Step 2: Test the skill** (writing-skills: an edit is tested): one subagent on a fresh copy with the request of the earlier GREEN run A (FX_PSCRIPT_DCD, creation and early termination, a dummy dat file). Expected: one registry line naming the capabilities QA confirmed, no hand edit of `Examples`, the tool command handed over, the dummy dat file questioned, the placeholder line written.
- [ ] **Step 3: README** ("Test data"): a "Products and capabilities" subsection (registry, tag, tool, check); Layout lines for `Capability`, `FeatureFile`, `ProductExamples`, `SyncProductExamples`; the tool under Commands; Maintenance: "New product" (constant with capabilities, dat file, tool) and "New event" (a `Capability` constant named as in the Playwright project's registry, the tag on its Outlines, the products' lists). **Handover notes**: one sentence in the oreo-e2e test data paragraph. **Spec** status: implemented, to verify on the company machine.
- [ ] **Step 4: Commit** `Document the product registry and update the onboarding skill`.

## Handover (company machine)

```bash
mvn test -Dtest='com.example.module.oreo.testdata.*Test'
mvn test -Dtest=SyncProductExamples -Doreo.sync=all
```

The first passes (the new check included); the second prints `unchanged` for all 7 Outlines and leaves `git status` clean.
