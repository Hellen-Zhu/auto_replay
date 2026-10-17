# oreo-e2e Legacy Data Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A test-scope tool that turns the old YAML data of one feature file into the layered JSON files (event files, expected files, setup files), checks them against the old data, and a skill that leads QA through it on the company machine.

**Architecture:** The old loader comes back in test scope as `LegacyData` (an instance with a scan pattern). `Layering` (pure) cuts the cases' requests and rules into defaults, byProduct, rows and row byProduct. `LegacyMigration` builds the plan of a feature or of the setup keys from `LegacyData`, `FeatureFile` / `FeatureCases` and the project's files, checks it with the real `TestDataRepository` on a temporary classpath, and writes it. `MigrateLegacyData` is the command-line shell; `LegacyEquivalenceTest` compares new and old data for every migrated event. All of it is tested on a fixture of real old data from this repository's history.

**Tech Stack:** as in `oreo-e2e/pom.xml` (unchanged since `0be22bc`): Java 21, JUnit 4.13.2, Jackson with its YAML format, Spring core's resource resolver (the last two came with the old loader and are still on the classpath). No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-17-oreo-e2e-legacy-data-migration-design.md` (approved 2026-10-17). § refers to it.

## Global Constraints

- Repo content in English; the repository is public: no company name, e-mail domain, internal host, IP, password or real trade / task ID in any file. Before every push: `bash .superpowers/sdd/2026-10-17-oreo-e2e-legacy-data-migration/check.sh <base>`, a copy of the previous plan's check.sh whose import whitelist also allows `org\.springframework\.core\.io\.` (`LegacyData` imports Spring's resource resolver, as the old loader did).
- Branch `feature/testdata-refactor`; never push to `main`; commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Before each task: the local folder equals HEAD (`git archive HEAD oreo-e2e | tar -x` into a scratch dir, `rsync -ani --checksum --delete --exclude target --exclude .DS_Store` against the local `oreo-e2e/`: no change listed); if not, stop and ask. After each push: rsync `oreo-e2e/` back, and copy each changed `docs/` file after checking that the local copy equals its previous commit's version.
- **No build or test run on this machine** (user ruling). Every "Run" step names the command the user runs on the company machine and its expected result; here the step is checked by reading, and the ledger says so. The per-task gate (`task-done`) is `check.sh <BASE>`.
- All new code in `oreo-e2e/src/test/java/com/example/module/oreo/testdata/`, package-private except the JUnit classes. Nothing under `src/main` changes; glue, snippets, features, data and expected files are untouched (the tool writes them on the company machine only).
- Fixture data only from this repository: the five YAML files of `0be22bc~1` byte for byte, the three feature files of HEAD. No company event data.
- Property names exactly: `oreo.migrate` (`<feature name>` | `setup` | `all`) and `oreo.migrate.write` (`true`); the commands of §2.
- A case's request differs from the old one only as §3.3 says: `basic.productId` removed; in the UI channel `basic.portfolioId` `CM_OIL_CRU_OPT` becomes `ABS_EQF`.
- Paths in reports, `_comment`s and messages use `/`; files are written UTF-8 with `\n` (`Json.pretty` for JSON).
- Plan decisions where the spec leaves a choice (listed for the review):
  1. `LegacyData` parses and writes JSON with `Json.MAPPER`, so a merged old entry keeps its digits (the hand migration kept them); this is its only change of logic.
  2. A setup request also loses `basic.productId` (the existing setup files and the old equivalence check did so; without it the six existing setup files would be "another payload"). §3.7's "in full" means: no `extends`, every other key.
  3. "Used by name" (§3.7) = a Java string literal equal to an old key in a `.java` file under `src/main/java` outside `testdata`, or `from test data '<key>'` on a line of a snippet or feature that does not start with `@`. Check 6's name pattern accepts lower-case names only, so it cannot find the old upper-case keys.
  4. A known rule path (§3.5) matches a placeholder path when equal, `[*]` matching any index; the rule is taken with its own path. Two different known rules for one path give none (listed).
  5. Two old keys ending with `.<case ID>` stop the feature (the old hook took either one).
  6. "Portfolio values kept" lists every leaf whose key contains `portfolio` (case ignored) with a value other than `ABS_EQF`, after §3.3.
  7. `-Doreo.migrate=all` prints one line per feature without its event file (`ready` / `stopped` / `nothing to migrate`) and the totals; the end of §6 is `0 to migrate, 0 stopped`.

## Review Focus

1. Old JSON text that does not parse (a trailing comma, a comment) in one key: that feature stops naming the key and its file; `all` goes on with the next feature. Test: `LegacyMigrationTest.unparsableOldJsonStops` (Task 3).
2. Old keys with a module prefix (`TRADE.TC-...`): found by suffix as the old hook did; two such keys for one case are an error, not a coin toss. Tests: `LegacyDataTest.keyForCaseTriesTheKeyThenAPrefixedKey`, `twoPrefixedKeysForOneCaseAreAnError` (Task 1).
3. Numbers with many digits in a merged old entry (the partial risk mock): kept digit for digit. Test: `LegacyDataTest.mergedEntryKeepsItsDigits` (Task 1).
4. A snippet, feature or Java file with CRLF line ends and a UTF-8 BOM, renamed by the setup step: only the key changes. Test: `LegacySetupMigrationTest.renamingKeepsLineEndsAndBom` (Task 5).
5. A value the layers cannot express (`{}` where the layers below give a non-empty object, an object in one case and a text in another): the self-check stops the feature naming the case; no wrong file is written. Test: `LegacyMigrationTest.inexpressibleValueStops` (Task 3).

---

### Task 1: The old loader in test scope, and the fixture

**Files:**
- Create: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/LegacyData.java`
- Create: fixture `oreo-e2e/src/test/resources/testdata-fixtures/legacy/data/{api/trade_creation,ui/trade_creation,ui/trade_early_termination,ui/mock_data,ui/user_preference_config}.yml`, `.../legacy/features/api/trading/trade_creation.feature`, `.../legacy/features/ui/trading/{trade_creation,trade_early_termination}.feature`
- Test: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/LegacyDataTest.java`

**Interfaces:**
- Produces:
  ```java
  final class LegacyData {
      static final String STANDARD = "classpath:data/**/*.yml";
      static final String FIXTURE = "classpath:testdata-fixtures/legacy/data/**/*.yml";
      record Record(String request, String response) { boolean hasRequest(); boolean hasResponse(); }  // non-blank
      LegacyData(String scanPattern);
      static LegacyData standard();                 // new LegacyData(STANDARD)
      static LegacyData in(Path dataDir);           // dataDir.toUri() (ending with "/") + "**/*.yml"; for tests
      boolean isEmpty();                            // no YAML file matched (a missing root folder is none)
      List<String> keys();                          // files sorted by URL, keys in file order
      String fileOf(String key);                    // below the pattern's root: "ui/user_preference_config.yml"
      Record forKey(String key);                    // AssertionError as the old forKey
      Optional<String> keyForCase(String caseId);   // the key itself, else the one key ending with "." + caseId;
                                                    // two or more: IllegalStateException naming them
  }
  ```
  Loading is lazy (first call); a failure of the old loader (duplicate key, missing reference, cycle, `request: {}` mapping) is its `IllegalStateException`, message prefix `[LegacyData]`.

- [ ] **Step 1: Copy the fixture**

```bash
cd oreo-e2e && F=src/test/resources/testdata-fixtures/legacy
for f in api/trade_creation ui/trade_creation ui/trade_early_termination ui/mock_data ui/user_preference_config; do
  mkdir -p "$F/data/$(dirname $f)" && git show "0be22bc~1:oreo-e2e/src/test/resources/data/$f.yml" > "$F/data/$f.yml"
done
mkdir -p "$F/features/api/trading" "$F/features/ui/trading"
cp src/test/resources/features/api/trading/trade_creation.feature "$F/features/api/trading/"
cp src/test/resources/features/ui/trading/trade_creation.feature src/test/resources/features/ui/trading/trade_early_termination.feature "$F/features/ui/trading/"
```

- [ ] **Step 2: Write the failing tests** (`LegacyDataTest`; `TemporaryFolder` with a helper `yaml(dir, "api/x.yml", text)` for synthetic files read through `LegacyData.in(dir)`)

```java
private static final LegacyData FIXTURE = new LegacyData(LegacyData.FIXTURE);
@Test public void resolvesReferencesAndLocalPatches() {
    assertEquals(Json.parse("{\"earlyTermination\":{\"direction\":\"Pay\",\"amount\":\"100\",\"ccy\":\"USD\"}}"),
            Json.parse(FIXTURE.forKey("TC-TRADE-EARLY-TERMINATION-FX_TRF-UI-001").request()));
    // UI-SETUP-RISK-CALC-NEW-SUCCESS response: code 200, status "SUCCESS", msg "" (template) and data.riskEngine "Cortex-QR" (patch)
}
@Test public void mergedEntryKeepsItsDigits() {
    assertTrue(FIXTURE.forKey("UI-SETUP-RISK-CALC-PARTIAL-SUCCESS").response().contains("20150.8410403754144"));
}
@Test public void listsKeysWithTheirFiles() {
    // keys().size() 47, of which 31 start with "TC-"; fileOf("SETUP-USER-PREFERENCE-CONFIG-DEFAULTS") "ui/user_preference_config.yml";
    // fileOf("TC-TRADE-CREATION-API-006") "api/trade_creation.yml"; isEmpty() false
}
@Test public void keyForCaseTriesTheKeyThenAPrefixedKey() {
    // keys "TRADE.TC-X-API-001", "TC-Y-API-001", "A.TC-Y-API-001": TC-X-API-001 -> "TRADE.TC-X-API-001";
    // TC-Y-API-001 -> "TC-Y-API-001"; TC-Z-API-001 -> Optional.empty()
}
@Test public void twoPrefixedKeysForOneCaseAreAnError() { /* "A.TC-X-API-001", "B.TC-X-API-001": message names both */ }
@Test public void oldLoaderErrorsStay() {
    // one folder each: a key in two files "Duplicate key"; a missing requestRef "references missing requestRef";
    // A -> B -> A "Circular"; "request: {}" as a mapping "is a YAML mapping"
}
@Test public void folderWithoutYamlIsEmpty() { /* LegacyData.in(empty folder): isEmpty(), keys() empty */ }
```

- [ ] **Step 3: Run** `mvn test -Dtest=LegacyDataTest` — Expected: compile failure (`LegacyData` missing). Here: by reading.

- [ ] **Step 4: Implement `LegacyData`** from `git show 0be22bc~1:oreo-e2e/src/main/java/com/example/module/oreo/testdata/TestDataLoader.java` and `TestDataRecord.java`: resolution, validation and messages as they were (prefix `[LegacyData]`); the static store becomes an instance store; the JSON mapper is `Json.MAPPER` (plan decision 1); `TestDataRecord` becomes `Record` (`of`, `flattenRequest` dropped); `tcKeyFromName` dropped. `fileOf`: the resource's URL relative to the URL of the pattern's root folder (the part before the first `*`, resolved by the same resolver).

- [ ] **Step 5: Run** the same command — Expected: 7 tests pass. Here: by reading.

- [ ] **Step 6: Commit** `Bring the old YAML loader back in test scope for the migration`.

### Task 2: Layering

**Files:**
- Create: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/Layering.java`
- Test: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/LayeringTest.java`

**Interfaces:**
- Produces:
  ```java
  final class Layering {
      /** product null: a case without one; value: the request, or the rules as a flat object; hasData: the old YAML had data. */
      record Case(String caseId, String rowId, String product, ObjectNode value, boolean hasData) {}
      /** Maps are LinkedHashMap: byProduct and rowByProduct's inner maps in productOrder, rows in order of first case;
       *  empty layers are absent. A row or rowByProduct value is an ObjectNode patch, or NullNode (clear) with clearWhenEmpty. */
      record Layers(ObjectNode defaults, Map<String, ObjectNode> byProduct, Map<String, JsonNode> rows,
                    Map<String, Map<String, JsonNode>> rowByProduct) {
          ObjectNode merged(Case c);   // JsonLayers.merge of defaults, byProduct, row, rowByProduct; NullNode resets to {}
      }
      static Layers layer(List<Case> cases, List<String> productOrder, boolean clearWhenEmpty);
  }
  ```

- [ ] **Step 1: Write the failing tests** (`LayeringTest`; values as JSON text; every test also asserts `layers.merged(c).equals(c.value())` for every case through a helper `assertMergesBack`; rows `R1`..; scenarios have no product)

```java
@Test public void majorityGoesToDefaults()      { /* R1 {a:1,b:1}, R2 {a:1,b:2}, R3 {a:1}: defaults {a:1}; rows R1 {b:1}, R2 {b:2} */ }
@Test public void halfIsNotAMajority()          { /* R1 {a:1}, R2 {a:2}: defaults {}; rows R1 {a:1}, R2 {a:2} */ }
@Test public void absenceWinsWritesNothing()    { /* R1 {a:1}, R2 {}, R3 {}: defaults {}; rows R1 {a:1} */ }
@Test public void productMajorityGoesToByProduct() {
    // rows R1..R3 each with FX_TRF {d:"Buy",p:10}; FX_PSCRIPT_TRF {d:"Sell"} in R1, R2 and {d:"Buy"} in R3:
    // defaults {d:"Buy"}; byProduct {FX_TRF:{p:10}, FX_PSCRIPT_TRF:{d:"Sell"}} in that order; rows {R3:{d:"Buy"}}; rowByProduct {}
}
@Test public void byProductNullsAKeyMostOfItsCasesLack() {
    // FX_TRF {p:1} in R1..R3, FX_PSCRIPT_TRF {} in R1, R2: defaults {p:1}; byProduct {FX_PSCRIPT_TRF:{p:null}}; rows {}
}
@Test public void missingObjectIsOneNull() {
    // R1..R3 {s:{x:1,y:2}}, R4 {t:1}: defaults {s:{x:1,y:2}}; rows {R4:{t:1,s:null}}; merged(R4) has no "s"
}
@Test public void outlineRowAndItsByProduct() {
    // row R: FX_TRF {a:1,c:5}, FX_PSCRIPT {a:1,c:5,e:1}; rows Q, Q2: both products {a:1}:
    // defaults {a:1}; byProduct {}; rows {R:{c:5}}; rowByProduct {R:{FX_PSCRIPT:{e:1}}}
}
@Test public void caseWithoutDataDoesNotVoteAndNullsEachTopLevelKey() {
    // R1 {a:1}, R2 hasData false {}: defaults {a:1}; rows {R2:{a:null}}
}
@Test public void emptyRulesClearAll() {
    // clearWhenEmpty: R1..R3 {"msg":"regex:x"}, R4 {}: defaults {"msg":"regex:x"}; rows {R4: NullNode}
}
@Test public void keysKeepFirstAppearanceOrder() { /* R1, R2 {b:1,a:1}: Json.pretty(defaults) "{\n  \"b\": 1,\n  \"a\": 1\n}\n" */ }
@Test public void arraysAreReplacedWhole()       { /* R1, R2 {a:[1,2]}, R3 {a:[1]}: defaults {a:[1,2]}; rows {R3:{a:[1]}} */ }
```

- [ ] **Step 2: Run** `mvn test -Dtest=LayeringTest` — Expected: compile failure. Here: by reading.

- [ ] **Step 3: Implement `Layering.layer`** (§3.4; "voting cases" = those with `hasData`):

```
leaves(v)      (path, value) of every non-object value and every empty object, depth first, document order
at(v, path)    the value there; OBJECT for a non-empty object; ABSENT when missing
vote(cs, ps)   per path, the at() value (equal JSON) held by more than half of cs, if any; OBJECT / ABSENT winners write nothing
diff(b, v)     keys of v: missing in b -> v's; both non-empty objects -> diff of them, left out when empty;
               unequal -> v's. Keys of b missing in v -> null (one null for a whole missing object)
1 defaults     winners of vote(voting cases, their leaf paths in order of first appearance)
2 byProduct[P] diff(defaults, target): target = defaults with the winners of vote(P's voting cases, their leaf paths and
               defaults') that differ from at(defaults) set or removed, then each object path more than half of P's
               voting cases lack removed
3 row          base(c) = merge(defaults, byProduct[c.product]); the entries (path, v) of diff(base(c), c.value) over the
               row's cases (a null is an entry at its own path) that every case of the row holds (null: ABSENT there)
4 rowByProduct diff(merge(base(c), row), c.value) of the row's case of product P
5 clear        clearWhenEmpty, c.value empty, merge(base(c), row) not: NullNode as the row when every case of the row is
               such a case, else as its rowByProduct
```

- [ ] **Step 4: Run** the same command — Expected: 11 tests pass. Here: by reading, each test traced through steps 1-5.

- [ ] **Step 5: Commit** `Cut old case data into defaults, byProduct and rows`.

### Task 3: The plan of a feature: requests, event file, self-check, stops

**Files:**
- Create: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/LegacyMigration.java`
- Modify: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/FeatureCases.java` (`cases(FeatureFile, String)` package-private)
- Test: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/LegacyMigrationTest.java`

**Interfaces:**
- Consumes: `LegacyData` (Task 1), `Layering` (Task 2), `FeatureFile`, `FeatureCases.cases`, `CaseId`, `TestDataRepository`, `JsonLayers`, `Json`, `ProductDatFiles`, `Capability.TAG_PREFIX`, `ProjectPaths`.
- Produces:
  ```java
  final class LegacyMigration {
      static final String NO_DATA = "no case data in the old YAML";
      record Sources(LegacyData legacy, Path project) {
          static Sources standard();     // LegacyData.standard(), ProjectPaths.projectRoot()
          Path resources();              // project/src/test/resources
          Path features();               // resources()/features
          Path data();                   // resources()/data
      }
      record Channel(String dir, String featureFile, ObjectNode eventFile, Map<String, String> expected,
                     List<String> caseLines, List<String> orphans, List<String> placeholdersWithoutRule,
                     List<String> portfolios) {}
      // dir "api" | "ui"; featureFile "features/ui/trading/x.feature"; eventFile null: none written;
      // expected: case ID -> file text (Task 4); caseLines "<case ID>: <CaseData.layers() joined by ", ">"
      record Plan(String name, List<Channel> channels, List<String> capabilities, List<String> stops) {
          boolean stopped();
          List<String> files();          // what write() creates, relative to resources(): "data/ui/x.json", ...
          String report();
      }
      static Plan plan(Sources sources, String name);
      static void write(Sources sources, Plan plan);   // stopped, or a target file exists: IllegalStateException, nothing written
      static List<String> featureNames(Sources sources);
      static <T> T withClasspath(Path root, Supplier<T> action);  // context class loader = URLClassLoader([root], null)
  }
  ```

- [ ] **Step 1: Write the failing tests** (`LegacyMigrationTest`; helper `project()` = a `TemporaryFolder` with the fixture features under `src/test/resources/features`, empty `data/api`, `data/ui`, `src/main/java`; `FIXTURE` as in Task 1; synthetic cases through `LegacyData.in(dir)` and feature texts written by the test)

```java
@Test public void earlyTerminationGetsDefaultsOnly() {
    // plan(.., "trade_early_termination"): no stop, one channel "ui"; Json.pretty(eventFile) is exactly
    // {"_comment": "features/ui/trading/trade_early_termination.feature",
    //  "defaults": {"request": {"earlyTermination": {"direction": "Pay", "amount": "100", "ccy": "USD"}}}} in that key order
}
@Test public void uiCreationRequestsAreLayered() {
    // ui eventFile: defaults.request {"basic":{"portfolioId":"ABS_EQF","counterpartyFmId":"300036958","counterpartyName":"10 AM NY",
    //   "direction":"Buy"},"stepIn":{"oldCounterpartyName":"10 AM JAK"}};
    // cases [{"id":"TC-TRADE-CREATION-<product_type>-UI-001","_comment":"Should be able to create a <product_type> Trade","request":{"stepIn":null}}]
}
@Test public void apiCreationRequestsAreLayered() {
    // api eventFile: byProduct.FX_PSCRIPT_TRF.request {"basic":{"direction":"Sell","premiumAmount":null,"premiumCurrency":null}};
    // ids of the rows carrying a request: API-002, API-003, API-004, API-005 (row IDs as in the feature);
    // row API-003 request.basic.direction "Buy"; row API-002 byProduct.FX_PSCRIPT_TRF.request {"basic":{"notionalCurrency":""}}
}
@Test public void everyFixtureCasePassesTheSelfCheck() { /* both plans: no stop; caseLines 15 (api) + 12 (ui), 4 (early termination) */ }
@Test public void writtenFilesLoadThroughTheRealLoader() {
    // write both; withClasspath(resources): new TestDataRepository("data/").forCase("TC-TRADE-CREATION-FX_PSCRIPT_TRF-API-002")
    // request equals the fixture's old request without basic.productId; forCase("TC-TRADE-CREATION-FX_TRF-UI-001") request has no "stepIn"
}
@Test public void anExistingEventFileStops()     { /* after write, plan again: stop contains "data/ui/trade_early_termination.json exists" */ }
@Test public void caseIdOfAnotherEventStops()    { /* trade_allocation.feature with [TC-ALLOC-UI-001]: stop contains "TC-ALLOC-UI-001", "alloc.json", "trade_allocation" */ }
@Test public void oldLoaderFailureStops()        { /* a missing requestRef: stop contains "references missing requestRef"; plan returns */ }
@Test public void unparsableOldJsonStops()       { /* request "{\"a\": 1,}": stop names the key and "ui/trade_x.yml"; plan returns */ }
@Test public void mainCodeCallingTheOldLoaderStops() { /* src/main/java/x/Steps.java, line 3 TestDataLoader.forKey("K"): stop contains "x/Steps.java:3" */ }
@Test public void twoPrefixedKeysStop()          { /* "A.TC-TRADE-X-UI-001", "B.TC-TRADE-X-UI-001": stop names both */ }
@Test public void inexpressibleValueStops()      { /* UI R1..R3 {s:{a:1}}, R4 {s:{}}: stop names R4's case and "self-check"; files() empty */ }
@Test public void uiCaseWithoutOldDataKeepsHavingNone() {
    // trade_x.feature, scenarios UI-001 (old data {a:{b:1}}) and UI-002 (none): row UI-002 {"_comment":"<name>; no case data in the old YAML",
    // "request":{"a":null}}; no stop; after write, the real loader gives UI-002 no request
}
@Test public void uiFeatureWithoutOldDataGetsNoEventFile() { /* no stop; ui channel eventFile null; files() empty */ }
@Test public void orphansAreListed()             { /* old TC-TRADE-X-UI-009 not in the feature: orphans ["TC-TRADE-X-UI-009 (ui/trade_x.yml)"] */ }
@Test public void uiPortfolioIsReplacedAndOthersListed() {
    // UI case CM_OIL_CRU_OPT -> ABS_EQF in the request, not listed; a UI case "PF_B": stays, listed "TC-...: basic.portfolioId = PF_B";
    // an API case with CM_OIL_CRU_OPT: stays, listed
}
@Test public void untaggedOutlineGetsACapabilityProposal() {
    // trade_partial_termination.feature, Outline without tag, Examples FX_TRF, FX_PSCRIPT: capabilities has one line containing
    // "@capability#partialTermination" and "FX_TRF, FX_PSCRIPT"; the tagged fixture Outlines give none
}
@Test public void featureNamesAreThoseWithoutTheirEventFile() { /* fixture: [trade_creation, trade_early_termination]; after writing ET: [trade_creation] */ }
```

- [ ] **Step 2: Run** `mvn test -Dtest=LegacyMigrationTest` — Expected: compile failure. Here: by reading.

- [ ] **Step 3: Implement `plan`** for requests, in this order; each problem becomes a `stops` line and `plan` returns (no exception):
  1. `src/main/java/**/*.java` lines matching `\bTestDataLoader\s*\.`: stop 6, `<path below src/main/java>:<line>`.
  2. The feature files `features/{api,ui}/**/<name>.feature`: none, or two in one channel, is a stop. Per channel `FeatureCases.cases(FeatureFile.read(f), dir)`; an exception is a stop with its message.
  3. Stop 1: `CaseId.parse(id).eventFile()` is not `name` (the message names the case, its event file and the feature, and says the user decides: rename the feature or the IDs). Stop 4: `data/<dir>/<name>.json` exists.
  4. Old data: `legacy.keyForCase(id)`; any `IllegalStateException` of `LegacyData` is stop 3 with its message. The request text goes through `Json.parse`; a failure is a stop naming the key and `legacy.fileOf(key)`.
  5. Request = §3.3; `portfolios` per plan decision 6, `<case ID>: <path> = <value>`. `orphans`: old keys whose `CaseId` (after the last `.`) has event `name` and this channel and matches no case, `<key> (<file>)`.
  6. A UI channel none of whose cases has data: `eventFile` null. Else `Layering.layer(cases, ProductDatFiles names in order, false)` (rules: Task 4).
  7. Event file, keys in this order and empty parts left out: `_comment` (`featureFile`), `defaults` {`request`, `dynamicFields`, `expectedBase`}, `byProduct` {P: {`request`, `dynamicFields`}}, `cases` [{`id`, `_comment`, `request`, `dynamicFields`, `byProduct`}]. A row exists for a row ID with a row or rowByProduct layer, in feature order; its `_comment` is the scenario line's text after `]`, trimmed, plus `"; " + NO_DATA` when the row nulls a case without data; such a nulling rowByProduct entry gets `_comment` `NO_DATA`.
  8. Self-check (§3.8): the event file into a temporary folder `data/<dir>/<name>.json`; for each case `withClasspath(tmp, () -> new TestDataRepository("data/").forCase(id))`: an empty target request means `!hasRequest()`, else `Json.parse(request())` equals it; `dynamicFields()` equals the target rules. A difference is stop 5: case, layers, both values. `caseLines` from the same `CaseData`. The folder is deleted.
  9. `capabilities` (§3.9): each Outline whose row ID has `<product_type>` and that has no tag starting with `Capability.TAG_PREFIX`: `<featureFile> <row ID>: @capability#<camel> on <products, ", ">: add the Capability constant, the tag and the products' capability by hand; SyncProductExamples must then say unchanged`. `<camel>`: the name without a leading `trade_`, words split on `_`, the first as it is, the others capitalized.

- [ ] **Step 4: Implement `write`** (the planned files, `Json.pretty`; nothing when stopped or when any target exists), **`featureNames`** (sorted base names of the feature files that lack their event file in a channel they are in), **`report`** (§3.8 in this order: per channel the event file, the number of leaves per layer, the case lines, orphans, placeholders without a rule, portfolio values; then capability proposals and stops; the last line `Plan only: nothing written.` until written) and **`withClasspath`** (restores the previous loader in `finally`).

- [ ] **Step 5: Run** the same command — Expected: 18 tests pass. Here: by reading, `apiCreationRequestsAreLayered` traced against the fixture.

- [ ] **Step 6: Commit** `Plan, check and write the request data of a feature from the old YAML`.

### Task 4: API responses: rules, expected files, base

**Files:**
- Modify: `LegacyMigration.java`, `LegacyMigrationTest.java`

**Interfaces:**
- Consumes: Task 3's `Plan` / `Channel` (fills `expected`, `placeholdersWithoutRule`, the `dynamicFields` and `expectedBase` parts); `ExpectedResponses(Path)`, `ExpectedResponses.write(CaseId, String)`.

- [ ] **Step 1: Write the failing tests**

```java
@Test public void regexPlaceholderBecomesARule() {
    // pattern = the fixture's old FX_TRF-API-001 response msg without its "${json-unit.regex}" prefix:
    // api defaults.dynamicFields {"msg": "regex:" + pattern}; byProduct.FX_PSCRIPT_TRF.dynamicFields {"msg": null};
    // rows API-004, API-005, API-006 have "dynamicFields": null (API-006 nothing else)
}
@Test public void otherPlaceholdersAreListed()  { /* one placeholdersWithoutRule line starts with "data.trade.id "; no rule has that path */ }
@Test public void knownRulePathIsReused() {
    // data/api/trade_cancellation.json {"defaults":{"dynamicFields":{"data.trade.id":"type"}}}:
    // creation defaults.dynamicFields has "data.trade.id": "type"; no listed line for data.trade.id
}
@Test public void knownRuleWithAnyIndexMatches()  { /* known "data.items[*].id": "type"; placeholders at data.items[0].id, [1].id: that one rule */ }
@Test public void conflictingKnownRulesGiveNone() { /* two event files, same path, "type" and "ignore": no rule, listed with both */ }
@Test public void expectedFilesAreTheOldResponses() {
    // 15 entries, each Json.parse equal to its old response; after write: data/api/expected/trade_creation/<case ID>.json, 15 files
}
@Test public void expectedBaseIsTheFirstProductOutline() {
    // creation: defaults.expectedBase "TC-TRADE-CREATION-<product_type>-API-001"; a feature with one product Outline: none
}
@Test public void apiCaseWithoutOldDataStops()     { /* API-001 with data, API-002 without: stop names API-002 and "expected file" */ }
```

- [ ] **Step 2: Run** `mvn test -Dtest=LegacyMigrationTest` — Expected: the 8 new tests fail (no rules, no expected files). Here: by reading.

- [ ] **Step 3: Implement.** Stop 2: an API case without old data or with a record without response. Placeholders: string values starting with `${json-unit.`, path rendered as `ResponseMasker` paths (`.` keys, `[n]`). A rule (§3.5): `regex:` + the text after `${json-unit.regex}`; else plan decision 4 on every `dynamicFields` object (defaults, byProduct, rows, rows' byProduct) of `data/api/*.json` except `common.json`; else a `placeholdersWithoutRule` line `<path> (<placeholder>): <products, or case IDs without product>`, once per path. Rules are layered with `Layering.layer(.., true)` and checked in step 8 of Task 3. `expected`: `Json.pretty(Json.parse(old response))`, compared with the old response as JSON in the self-check; written with `new ExpectedResponses(data().resolve("api/expected")).write`. `expectedBase` (§3.6): with two or more product Outlines, the first one's row ID.

- [ ] **Step 4: Run** the same command — Expected: 26 tests pass. Here: by reading.

- [ ] **Step 5: Commit** `Migrate API responses: rules from regex and known paths, expected files, base`.

### Task 5: Setup payloads

**Files:**
- Modify: `LegacyMigration.java`
- Test: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/LegacySetupMigrationTest.java`

**Interfaces:**
- Produces (in `LegacyMigration`):
  ```java
  static final Map<String, String> SETUP_NAMES;   // the 8 lines of the test data design's section 6 table, in its order
  static String setupName(String oldKey);         // the table, else lower case without "API-SETUP-" | "UI-SETUP-" | "SETUP-"
  record SetupFile(String key, String name, String text) {}       // text null: an existing file with the same payload is kept
  record Rename(String file, int line, String oldKey, String name) {}
  record SetupPlan(List<SetupFile> files, List<Rename> renames, Map<Path, String> rewrites,
                   List<String> knownMissing, List<String> portfolios, List<String> stops) {
      boolean stopped(); String report();
  }
  static SetupPlan planSetup(Sources sources);
  static void writeSetup(Sources sources, SetupPlan plan);   // stopped: IllegalStateException, nothing written
  ```

- [ ] **Step 1: Write the failing tests** (a project as in Task 3 plus `src/main/resources/snippet/` and a stub `src/test/java/com/example/module/oreo/testdata/TestDataValidationTest.java` holding the line `    private static final Set<String> KNOWN_MISSING = Set.of("trade-cancellation", "trade-amendment");`)

```java
@Test public void setupNamesFollowTheTable() {
    // SETUP_NAMES.size() 8; "API-SETUP-TRADE-CANCELLATION" -> "trade-cancellation"; "UI-SETUP-AMENDMENT" -> "trade-amendment";
    // "API-SETUP-FOO-BAR" -> "foo-bar"; "SETUP-X" -> "x"
}
@Test public void fixtureWritesSixFiles() {
    // empty data/setup: names {trade-create, trade-create-stepin-partial, trade-create-stepin-full, user-preference-defaults,
    // risk-calc-success-mock, risk-calc-partial-success-mock}; trade-create request has no basic.productId; no stop
}
@Test public void fixtureKeepsTheHandMigratedFiles() {
    // the six files of this repository's data/setup copied in (two with "extends"): all six kept (text null), no stop
}
@Test public void anotherPayloadStops()   { /* trade-create.json with portfolioId "PF_B": stop names "data/setup/trade-create.json" */ }
@Test public void usesAreRenamed() {
    // snippet "  Given build ... from test data 'API-SETUP-TRADE-CREATE' for product '$1'"; Java
    // submitTradeAsPendingApproval("a", "b", "API-SETUP-STEPIN-FULL-TRADE-CREATE", p); feature line
    // "    And ... from test data 'UI-SETUP-RISK-CALC-NEW-SUCCESS'" and a tag line "@x from test data 'API-SETUP-TRADE-CREATE'":
    // after writeSetup the three names are new, the tag line is unchanged; renames has 3 entries with file and line
}
@Test public void renamingKeepsLineEndsAndBom() { /* the snippet with a BOM and CRLF: bytes start EF BB BF, "\r\n" between all lines, only the name changed */ }
@Test public void aKeyUsedByNameIsASetupKey()   { /* old "UI-SETUP-FOO" used in Java -> foo.json; an unused "REQ-TPL-X" -> nothing */ }
@Test public void twoKeysForOneNameStop()       { /* "API-SETUP-FOO" and "UI-SETUP-FOO", both used: stop names both and "foo" */ }
@Test public void knownMissingLosesTheWrittenNames() { /* old API-SETUP-TRADE-CANCELLATION: the stub line becomes Set.of("trade-amendment") */ }
@Test public void secondRunChangesNothing()     { /* plan + write twice: second plan all kept, no renames, no rewrites, no stop */ }
```

- [ ] **Step 2: Run** `mvn test -Dtest=LegacySetupMigrationTest` — Expected: compile failure. Here: by reading.

- [ ] **Step 3: Implement `planSetup`** (§3.7). Setup keys: old keys that are not case keys (the part after the last `.` does not start with `TC-`) and are in `SETUP_NAMES` or used by name (plan decision 3). A name not matching `[a-z0-9][a-z0-9-]*`, two keys with one name, a record with neither request nor response, a payload that is not JSON: stops. Payload: request (plan decision 2) and / or response. An existing `data/setup/<name>.json` is read with `withClasspath(resources(), () -> new TestDataRepository("data/").setup(name))`: same parts and equal JSON → kept, else a stop. New file: `{"_comment": "Migrated from <key> (<file>) by MigrateLegacyData", "request": ..., "response": ...}`. `rewrites`: each file's whole text with `"<key>"` (Java) or `from test data '<key>'` (snippet, feature; not on `@` lines) replaced, decoded and encoded as UTF-8 so a BOM and CRLF stay. `knownMissing`: the names of the `KNOWN_MISSING` line minus those written or kept; that line rewritten (`Set.of()` when empty); line not found: a stop. `portfolios`: plan decision 6 over the payloads.

- [ ] **Step 4: Run** the same command — Expected: 10 tests pass. Here: by reading.

- [ ] **Step 5: Commit** `Migrate the setup payloads and rename their uses`.

### Task 6: The tool and the equivalence test

**Files:**
- Create: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/MigrateLegacyData.java`, `LegacyEquivalenceTest.java`
- Test: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/MigrateLegacyDataTest.java`; `LegacyEquivalenceTest` tests itself on the fixture

**Interfaces:**
- Consumes: `LegacyMigration` (Tasks 3-5), `FeatureCases.load`, `CaseId`, `TestDataRepository`.
- Produces:
  ```java
  public class MigrateLegacyData {
      @Test public void migrate();                                        // Assume oreo.migrate set; run(Sources.standard(), ..)
      static String run(LegacyMigration.Sources sources, String scope, boolean write);  // the printed text; AssertionError on a stop
  }
  public class LegacyEquivalenceTest {
      static List<String> differences(LegacyData legacy, Path resources, List<String> notMigrated);
  }
  ```

- [ ] **Step 1: Write the failing tests**

```java
// MigrateLegacyDataTest (fixture project as in Task 3)
@Test public void plansWithoutWriting()   { /* run(.., "trade_early_termination", false): contains "Plan only"; data/ui has no file */ }
@Test public void writesOnRequest()       { /* true: data/ui/trade_early_termination.json exists; text contains "Written" */ }
@Test public void stoppedPlanWritesNothing() { /* data/ui/trade_creation.json exists, run "trade_creation" true: AssertionError "Nothing written"; no data/api file */ }
@Test public void allOnlyPlans()          { /* run(.., "all", true): AssertionError "-Doreo.migrate=all only plans" */ }
@Test public void allListsEveryFeature()  { /* "trade_creation: ready", "trade_early_termination: ready", "2 to migrate, 0 stopped, 0 with nothing to migrate" */ }
@Test public void setupScope()            { /* run(.., "setup", true): six files; second run's text contains "0 setup file(s) written" */ }
@Test public void unknownFeatureStops()   { /* "trade_nothing": AssertionError containing "trade_nothing.feature" */ }
// LegacyEquivalenceTest
@Test public void newDataGivesWhatTheOldDataGave() { /* standard; Assume.assumeFalse("no YAML file under data/: nothing to compare", isEmpty) */ }
@Test public void migratedFixtureIsEquivalent()    { /* setup + both features written: differences empty, notMigrated empty */ }
@Test public void aChangedCaseValueIsNamed()       { /* amount "100" -> "200" in data/ui/trade_early_termination.json: 4 lines, one per ET case */ }
@Test public void aChangedSetupPayloadIsNamed()    { /* data/setup/trade-create.json changed: a line containing "API-SETUP-TRADE-CREATE -> trade-create" */ }
@Test public void eventsWithoutEventFileAreNotMigrated() { /* only ET written: notMigrated contains "trade_creation (api)", "trade_creation (ui)" */ }
```

- [ ] **Step 2: Run** `mvn test -Dtest='MigrateLegacyDataTest,LegacyEquivalenceTest'` — Expected: compile failure. Here: by reading.

- [ ] **Step 3: Implement `MigrateLegacyData`** on the model of `CompactExpectedFiles`: `Assume` message `set -Doreo.migrate=<feature name>|setup|all`; write = `"true".equals(System.getProperty("oreo.migrate.write"))`; `legacy.isEmpty()`: `AssertionError("no YAML file under data/: nothing to migrate")`. `setup` and `<name>`: the report; on a stop `AssertionError("Nothing written, <n> stop(s):\n  ...")`; else `Plan only: add -Doreo.migrate.write=true to write.` or, written, `Written: <files>` and `<n> setup file(s) written, <m> use(s) renamed` for setup, `Next: review, capability, SyncProductExamples, CompactExpectedFiles (API), offline tests` for a feature. `all` (plan decision 7): with write an `AssertionError("-Doreo.migrate=all only plans; migrate one feature at a time")`; else per `featureNames` a line `<name>: ready (<files>)` | `<name>: stopped: <first stop> (+<n> more)` | `<name>: nothing to migrate`, then `<a> to migrate, <b> stopped, <c> with nothing to migrate`; never fails.

- [ ] **Step 4: Implement `LegacyEquivalenceTest.differences`** (§4) inside `withClasspath(resources, ..)` with one `new TestDataRepository("data/")`: old keys whose part after the last `.` starts with `TC-` and parses as a `CaseId`, whose `data/<channel>/<event>.json` exists under `resources`: request equal to the old one after §3.3 (both via doubles, as the old test's `viaDouble`), or no request when the old record has none; `FeatureCases.load(resources/features)` cases of such events without old data: no request; old non-case keys whose `setupName` has `data/setup/<name>.json`: same parts, each equal via doubles (request after plan decision 2), line `<key> -> <name>: ...`. Other events: `notMigrated` `<event> (<channel>)`, distinct, printed by the standard test. The standard test: `differences(LegacyData.standard(), ProjectPaths.projectRoot().resolve("src/test/resources"), ..)`, fails on any line.

- [ ] **Step 5: Run** the same command — Expected: 11 pass, `newDataGivesWhatTheOldDataGave` skipped (no YAML in this repository). Here: by reading.

- [ ] **Step 6: Commit** `Add the migration tool and the old-versus-new equivalence check`.

### Task 7: Skill and docs

**Files:**
- Create: `oreo-e2e/.claude/skills/migrating-legacy-event-data/SKILL.md`
- Modify: `oreo-e2e/README.md`, `docs/handover-notes.md`, the spec's status line

- [ ] **Step 1: Baseline (writing-skills RED).** Workspace `skill-test/`: a copy of `oreo-e2e` at HEAD, and two tool reports written by hand in the format of Task 3 Step 4: (a) `trade_allocation` stopped by stop 1 (`TC-ALLOC-UI-001`); (b) `trade_creation` ready, with placeholder paths without rule and the UI defaults equal to the shared blocks `trade-basic` + `stepin`. A subagent without the skill gets: "Migrate the allocation and creation data with MigrateLegacyData; here are the tool's outputs; the company machine runs the commands". Record what it does with the stop, the placeholders, the YAML files, the expected files and the commands.
- [ ] **Step 2: Write the skill** (§5, in the style of `onboarding-e2e-product`): description with the triggers of §5 only; the routine of §2 (setup first, then per feature: plan, write, review, capability, `SyncProductExamples`, `CompactExpectedFiles` for API, offline tests, commit; `all` for the inventory, `0 to migrate, 0 stopped` before §6); the review checklist of §5; per stop what the user decides; the nevers of §5; the report (one line per case `migrated` / `not migrated: <why>`, files written, open decisions); this repository has no company data, the commands run on the company machine.
- [ ] **Step 3: Test the skill (GREEN):** the same scenario with the skill. Expected: stop 1 handed to the user, nothing renamed; placeholders listed as open decisions, no rule written; no YAML deleted; no expected file edited; the commands in the routine's order; `use` of `trade-basic` / `stepin` proposed for the UI defaults; the report in the skill's form. Close every loophole the runs show, re-run until it passes.
- [ ] **Step 4: Docs.** README: Layout lines for `LegacyData`, `Layering`, `LegacyMigration`, `MigrateLegacyData`, `LegacyEquivalenceTest` and the skill; Commands: the routine of §2; Maintenance: "An event still in YAML" (the skill) and "End of the migration" (§6). Handover notes: one sentence in the oreo-e2e test data paragraph. Spec status: `implemented, to verify on the company machine`.
- [ ] **Step 5: Commit** `Add the migration skill and document the routine`.

## Handover (company machine)

```bash
mvn test -Dtest='com.example.module.oreo.testdata.*Test'
```

The new tests pass and `LegacyEquivalenceTest.newDataGivesWhatTheOldDataGave` is skipped (no YAML yet). Then copy the remaining events' YAML into `src/test/resources/data/`, run `mvn test -Dtest=MigrateLegacyData -Doreo.migrate=all`, and follow the skill: setup first, then one feature at a time.
