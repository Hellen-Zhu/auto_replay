# oreo-e2e Test Data Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the YAML test data of `oreo-e2e/` with layered JSON case data per channel, setup files, and recorded API responses compared strictly.

**Architecture:** New classes in `com.example.module.oreo.testdata` (no Genie dependency) load `data/<channel>/common.json` + `data/<channel>/<event>.json` and merge layers per case ID; `data/setup/<name>.json` holds setup payloads; `ApiResponseAssertionSteps` records or compares `data/api/expected/<event>/<caseId>.json`. Callers switch from `TestDataLoader` to `TestData`; the YAML and the old loader are removed after an equivalence test proves the new data sends the same requests. Last, a variant's expected file may hold only a patch on a base case of the same product (§7.5, Task 8).

**Tech Stack:** as in `oreo-e2e/pom.xml`: Java 21, JUnit 4.13.2, JsonUnit through `net.javacrumbs.jsonunit.JsonAssert` (already used), Jackson and Spring core at the genie BOM's versions (Jackson >= 2.15: the existing code uses `JsonNode.properties()`), jackson-dataformat-yaml (old loader only, until Task 7). No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-16-oreo-e2e-test-data-design.md` (approved 2026-10-16). Section numbers below (§) refer to it.

## Global Constraints

- Repo content in English; the repository is public: no company name, e-mail domain, internal host name, IP, password or real trade / task ID in any file, this plan included. Before every commit, scan the staged diff for them with the pattern kept in the session notes (never written into the repo).
- Branch `feature/testdata-refactor`; never push to `main`; commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Before each task: `rsync -anv --delete --checksum --exclude target --exclude .DS_Store <local oreo-e2e>/ oreo-e2e/` shows no user edits (if it does, stop and ask). After each push: rsync `oreo-e2e/` (excluding `target`, `.DS_Store`) and the changed `docs/` files back to the local folder.
- New `testdata/` classes depend only on Jackson, JsonUnit and the JDK (+ slf4j for logging); no Genie, no Cucumber. Only APIs of the versions in `oreo-e2e/pom.xml` (user, 2026-10-16); no dependency is added.
- **No build or test run on this machine** (user, 2026-10-16). Each task is checked here by reading (imports, signatures, APIs available in those versions); the tests run on the company machine, by the user, with the commands of the two handovers (after Task 6, after Task 7). "Run" steps below are those commands.
- ctx names unchanged: `_tc.key`, `_tc.request`, `_tc.request.<top field>`, flattened leaves (`basic.counterpartyName` ...). Step regexes unchanged.
- `basic.productId` is never in data; the step sets it.
- Cancellation and amendment are out of scope (user, 2026-10-16): `trade-cancellation` and `trade-amendment` get no file.
- Keep `data/common.json` and `testdata/Products.java` untouched.
- Number fidelity needs, on `Json.MAPPER`: `DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS` on and `JsonNodeFeature.STRIP_TRAILING_BIGDECIMAL_ZEROES` off (else `70000.0` becomes `7E+4`).

## Review Focus

1. A product written in a feature before it is added to `ProductDatFiles` (`TC-TRADE-CREATION-FX_NEW-API-001`): a loud "unknown product" error, not a case silently running with no data. Test: `CaseIdTest.unregisteredProductTokenIsAnError` (Task 1).
2. Number fidelity in written expected files: `70000.0` stays `70000.0`, `20150.8410403754144` and `-18726.25346898106` keep every digit, `200` stays an integer. Test: `ResponseMaskerTest.keepsNumbersExactly` (Task 3).
3. A typo in the update switch (`OREO_EXPECTED=updat`, `true`): an error, not a silent comparison. Test: `ExpectedResponsesTest.rejectsUnknownMode` (Task 3).
4. A forked JVM whose working directory is not the project: the expected directory is still found from the classpath. Test: `ProjectPathsTest.resolvesRootFromTestClassesLayout` (Task 3).
5. An expected file checked out with CRLF on Windows still compares equal; written files use LF. Test: `ExpectedResponsesTest.readsCrlfFile` (Task 3).
6. A compaction that meets an error halfway (one base missing) leaves every file as it was, so a review never sees half a compaction. Test: `ExpectedCompactionTest.errorWritesNothing` (Task 8).
7. A second compaction right after the first changes nothing, so review diffs show only real changes. Test: `ExpectedCompactionTest.secondRunChangesNothing` (Task 8).

---

### Task 1: `Json`, `CaseId`, `JsonLayers`

**Files:**
- Create: `oreo-e2e/src/main/java/com/example/module/oreo/testdata/Json.java`, `CaseId.java`, `JsonLayers.java`
- Test: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/CaseIdTest.java`, `JsonLayersTest.java`, `JsonTest.java`

**Interfaces:**
- Produces:
  - `Json.MAPPER` (see Global Constraints); `static JsonNode parse(String json)`; `static String compact(JsonNode)`; `static String pretty(JsonNode)`: our own printer, not Jackson's (its layout differs between versions): 2-space indent, `"key": value`, one array element per line, empty `{}` / `[]`, numbers as parsed (`decimalValue().toPlainString()` for decimals), strings escaped by Jackson, `\n` line ends, trailing newline. (Same layout as Python's `json.dumps(indent=2, ensure_ascii=False)`, which Task 4's conversion script relies on.)
  - `record CaseId(String raw, String event, String product, String channel, String number)` (`product` null when absent, `channel` `"API"`/`"UI"`); `static CaseId parse(String raw)`; `String eventFile()` (`TRADE-CREATION` -> `"trade_creation"`); `String channelDir()` (`"api"`/`"ui"`); `boolean matchesRow(String rowId)`; `static void checkRowId(String rowId)`; `static String fromScenarioName(String name)` (replaces `TestDataLoader.tcKeyFromName`: same pattern `\[([^\]]+)\]`, the first bracket text starting with `TC-`, null otherwise).
  - `JsonLayers.merge(ObjectNode base, ObjectNode patch) -> ObjectNode` (new node; objects deep, arrays/scalars replace, `null` deletes); `JsonLayers.withoutComments(JsonNode) -> JsonNode` (drops `_comment` at every depth).

- [ ] **Step 1: Write the tests**

```java
// CaseIdTest
@Test public void parsesOutlineCase() {
    CaseId id = CaseId.parse("TC-TRADE-CREATION-FX_PSCRIPT_TRF-API-002");
    assertEquals("TRADE-CREATION", id.event()); assertEquals("FX_PSCRIPT_TRF", id.product());
    assertEquals("API", id.channel()); assertEquals("002", id.number());
    assertEquals("trade_creation", id.eventFile()); assertEquals("api", id.channelDir());
}
@Test public void parsesCaseWithoutProduct() {
    CaseId id = CaseId.parse("TC-TRADE-CREATION-API-004");
    assertNull(id.product()); assertEquals("TRADE-CREATION", id.event());
}
@Test public void parsesUiEvent() { assertEquals("trade_early_termination", CaseId.parse("TC-TRADE-EARLY-TERMINATION-FX_TRF-UI-001").eventFile()); }
@Test(expected = IllegalArgumentException.class) public void unregisteredProductTokenIsAnError() { CaseId.parse("TC-TRADE-CREATION-FX_NEW-API-001"); }
@Test(expected = IllegalArgumentException.class) public void rejectsMissingChannel() { CaseId.parse("TC-TRADE-CREATION-001"); }
@Test(expected = IllegalArgumentException.class) public void rejectsMissingPrefix() { CaseId.parse("TRADE-CREATION-API-001"); }
@Test public void outlineRowMatchesEveryProduct() {
    String row = "TC-TRADE-CREATION-<product_type>-API-002";
    assertTrue(CaseId.parse("TC-TRADE-CREATION-FX_TRF-API-002").matchesRow(row));
    assertTrue(CaseId.parse("TC-TRADE-CREATION-FX_PSCRIPT_TRF-API-002").matchesRow(row));
    assertFalse(CaseId.parse("TC-TRADE-CREATION-FX_TRF-API-003").matchesRow(row));
    assertFalse(CaseId.parse("TC-TRADE-CREATION-API-002").matchesRow(row));
}
@Test public void plainRowMatchesItsCaseOnly() {
    assertTrue(CaseId.parse("TC-TRADE-CREATION-API-004").matchesRow("TC-TRADE-CREATION-API-004"));
    assertFalse(CaseId.parse("TC-TRADE-CREATION-FX_TRF-API-004").matchesRow("TC-TRADE-CREATION-API-004"));
}
@Test(expected = IllegalArgumentException.class) public void placeholderOnlyAtProductPosition() { CaseId.checkRowId("TC-<event>-FX_TRF-API-001"); }
@Test public void caseIdFromScenarioName() {
    assertEquals("TC-TRADE-CREATION-FX_TRF-API-001", CaseId.fromScenarioName("[TC-TRADE-CREATION-FX_TRF-API-001] Valid FX_TRF trade submission"));
    assertNull(CaseId.fromScenarioName("[ADO-1] no case id"));
}

// JsonLayersTest
@Test public void deepMergesObjects()      // {"basic":{"a":1,"b":2}} + {"basic":{"b":3}} -> {"basic":{"a":1,"b":3}}
@Test public void nullDeletesKey()         // {"basic":{"premiumAmount":10000,"x":1}} + {"basic":{"premiumAmount":null}} -> {"basic":{"x":1}}
@Test public void arraysReplaceWhole()     // {"udf":[1,2]} + {"udf":[3]} -> {"udf":[3]}
@Test public void doesNotMutateInputs()    // base and patch unchanged after merge
@Test public void dropsCommentsAtEveryDepth() // {"_comment":"x","a":{"_comment":"y","b":[{"_comment":"z","c":1}]}} -> {"a":{"b":[{"c":1}]}}

// JsonTest
@Test public void prettyLayout()           // Json.pretty(parse("{\"a\":[1,{\"b\":70000.0}],\"e\":{},\"f\":[]}")) equals "{\n  \"a\": [\n    1,\n    {\n      \"b\": 70000.0\n    }\n  ],\n  \"e\": {},\n  \"f\": []\n}\n"
@Test public void keepsDecimalDigits()     // compact(parse("{\"p\":20150.8410403754144,\"q\":70000.0,\"c\":200}")) equals "{\"p\":20150.8410403754144,\"q\":70000.0,\"c\":200}"
```

- [ ] **Step 2: Implement `Json`, `CaseId`, `JsonLayers`.** `CaseId.parse`: tokens of `raw` after `TC-` split on `-`; last token digits; the one before `API`|`UI`; the token before the channel is the product when it is a `ProductDatFiles` name, an error when it contains `_` otherwise, else part of the event; at least one event token. `matchesRow`: `<...>` -> `([A-Z0-9_]+)`, the rest quoted, full match, the group equal to `product()`. `checkRowId`: a `<...>` token only right before the channel.

- [ ] **Step 3: Check by reading**: every test's expected value follows from the interfaces above; only JDK / Jackson / JUnit 4 imports.

- [ ] **Step 4: Commit**: `git add oreo-e2e/src/main/java/com/example/module/oreo/testdata/{Json,CaseId,JsonLayers}.java oreo-e2e/src/test/java/com/example/module/oreo/testdata/` -> `git commit -m "Add case ID parsing and JSON layer merging for the new test data"`

### Task 2: `TestData`, `CaseData`, `SetupData`

**Files:**
- Create: `testdata/TestDataRepository.java`, `TestData.java`, `CaseData.java`, `SetupData.java` (all under `oreo-e2e/src/main/java/com/example/module/oreo/`)
- Create fixtures: `oreo-e2e/src/test/resources/testdata-fixtures/data/{api,ui,setup}/...`
- Test: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/TestDataRepositoryTest.java`

**Interfaces:**
- Consumes: `CaseId`, `JsonLayers`, `Json` (Task 1).
- Produces:
  - `TestDataRepository(String classpathRoot)` (e.g. `"data/"`); `CaseData forCase(String caseId)`; `SetupData setup(String name)`. Caches parsed files and results (thread-safe). Errors: `IllegalStateException("[TestData] ...")` naming file and key.
  - `TestData.forCase(String) -> CaseData`, `TestData.setup(String) -> SetupData` (static facade over `new TestDataRepository("data/")`).
  - `CaseData`: `CaseId id()`, `String request()` (compact JSON, `"{}"` when nothing), `boolean hasRequest()` (at least one field), `Map<String,String> flattenRequest()` (same output as `TestDataRecord.flattenRequest`: dot paths, `[i]` for arrays, `asText()` leaves), `Map<String,String> dynamicFields()` (insertion-ordered), `List<String> layers()`.
  - `SetupData`: `String name()`, `String request()` / `String response()` (compact JSON or null), `boolean hasRequest()`, `boolean hasResponse()`.
  - Layer labels, exactly: `"<event>.json defaults"`, `"<event>.json byProduct <P>"`, `"row <rowId>"`, `"row <rowId> byProduct <P>"`, each followed by `" (use a, b)"` when the layer uses blocks.

- [ ] **Step 1: Write fixtures** (small, not the real data): `api/common.json` with shared `base` (`{"request":{"basic":{"a":"1","premium":10}}}`) and `extra` (`{"request":{"basic":{"udf":["x"]}},"dynamicFields":{"msg":"type"}}`); `api/sample_event.json` with `defaults` (`use ["base"]`, `dynamicFields {"data.id":"type"}`), `byProduct.FX_PSCRIPT_TRF` (`request.basic.premium: null`), cases `TC-SAMPLE-EVENT-<product_type>-API-002` (`use ["extra"]`, `byProduct.FX_PSCRIPT_TRF.request.basic.ccy ""`) and `TC-SAMPLE-EVENT-API-004` (`request.basic.a "2"`, `dynamicFields null`); `api/bad_key.json` with `"byproduct": {}`; `api/two_rows.json` with rows `TC-TWO-ROWS-<product_type>-API-001` and `TC-TWO-ROWS-FX_TRF-API-001`; a third row in `api/sample_event.json`, `TC-SAMPLE-EVENT-API-009` with `use ["nope"]`; `ui/ui_event.json` with `defaults.dynamicFields`; `setup/base-setup.json` (`request`), `setup/child-setup.json` (`extends base-setup`, adds a field), `setup/loop-a.json` / `loop-b.json` extending each other.

- [ ] **Step 2: Write the tests**

```java
TestDataRepository repo = new TestDataRepository("testdata-fixtures/data/");
@Test public void caseWithoutRowRunsOnDefaults()      // forCase("TC-SAMPLE-EVENT-FX_TRF-API-001").request() == {"basic":{"a":"1","premium":10}}; dynamicFields == {data.id=type}; layers == ["sample_event.json defaults (use base)"]
@Test public void allLayersInOrder()                   // forCase("TC-SAMPLE-EVENT-FX_PSCRIPT_TRF-API-002").request() == {"basic":{"a":"1","udf":["x"],"ccy":""}}; layers == ["sample_event.json defaults (use base)", "sample_event.json byProduct FX_PSCRIPT_TRF", "row TC-SAMPLE-EVENT-<product_type>-API-002 (use extra)", "row TC-SAMPLE-EVENT-<product_type>-API-002 byProduct FX_PSCRIPT_TRF"]; dynamicFields == {data.id=type, msg=type}
@Test public void caseWithoutProductSkipsByProduct()   // forCase("TC-SAMPLE-EVENT-API-004").request() == {"basic":{"a":"2","premium":10}}; dynamicFields empty
@Test public void missingEventFileMeansNoData()        // forCase("TC-NO-SUCH-EVENT-FX_TRF-UI-001").hasRequest() == false, request() == "{}"
@Test public void flattensLikeTheOldRecord()           // flattenRequest of {"basic":{"a":"1"},"udf":[{"k":"v"}]} == {basic.a=1, udf[0].k=v}
@Test(expected = IllegalStateException.class) public void unknownKeyIsAnError()      // forCase("TC-BAD-KEY-FX_TRF-API-001")
@Test(expected = IllegalStateException.class) public void twoMatchingRowsIsAnError() // forCase("TC-TWO-ROWS-FX_TRF-API-001")
@Test(expected = IllegalStateException.class) public void unknownSharedBlockIsAnError() // a row with use ["nope"] in sample_event.json case TC-SAMPLE-EVENT-API-009
@Test(expected = IllegalStateException.class) public void dynamicFieldsRejectedInUi() // forCase("TC-UI-EVENT-FX_TRF-UI-001")
@Test public void setupExtends()                       // setup("child-setup").request() == base merged with child
@Test(expected = IllegalStateException.class) public void setupCycleIsAnError()      // setup("loop-a")
@Test public void missingSetupNamesTheFolder()         // setup("nope") throws IllegalStateException whose message contains "data/setup/nope.json"
```

Assert JSON equality with `assertEquals(Json.parse(expected), Json.parse(actual))`.

- [ ] **Step 3: Implement** per §5.2 (allowed keys per level; `dynamicFields` rejected under `ui/`), §5.4 (layer order; a layer applies its `use` blocks, then `request` and `dynamicFields`), §6 (`extends`, cycle detection). Files are read with the class loader as `classpathRoot + "<channelDir>/common.json"`, `... "<channelDir>/<eventFile>.json"`, `... "setup/<name>.json"`; `_comment` dropped on load.

- [ ] **Step 4: Check by reading**: each fixture produces the asserted result by the merge order of §5.4.

- [ ] **Step 5: Commit**: `git commit -m "Add the layered JSON case data and setup data loader"`

### Task 3: `ProjectPaths`, `ExpectedResponses`, `ResponseMasker`

**Files:**
- Create: `testdata/ProjectPaths.java`, `ExpectedResponses.java`, `ResponseMasker.java`
- Test: `ProjectPathsTest.java`, `ExpectedResponsesTest.java`, `ResponseMaskerTest.java` (same test package)

**Interfaces:**
- Consumes: `Json`, `CaseId` (Task 1).
- Produces:
  - `ProjectPaths.projectRoot() -> Path`: system property `oreo.project.dir` when set, else `fromClasspathDataDir(Path)` of the class loader's `data` resource; `static Path fromClasspathDataDir(Path dataDir)` expects `<root>/target/test-classes/data` and returns `<root>`, else `IllegalStateException` naming `oreo.project.dir`.
  - `ExpectedResponses(Path expectedRoot)`; `static ExpectedResponses standard()` (root = `projectRoot()/src/test/resources/data/api/expected`); `Path fileFor(CaseId id)` = `<root>/<eventFile>/<raw>.json`; `Optional<String> read(CaseId)`; `void write(CaseId, String json)` (creates directories, UTF-8, LF); `static boolean updateMode()` = `updateMode(System.getenv("OREO_EXPECTED"), System.getProperty("oreo.expected"))`; `static boolean updateMode(String env, String prop)`: either equal to `update` ignoring case -> true; both null/blank -> false; any other value -> `IllegalStateException`.
  - `ResponseMasker.mask(String actualJson, Map<String,String> rules, String caseLabel) -> String` (`Json.pretty` output). Paths: keys joined by `.`, `[n]`, `[*]`.

- [ ] **Step 1: Write the tests**

```java
// ProjectPathsTest
@Test public void resolvesRootFromTestClassesLayout() { Path root = Paths.get("/x/oreo-e2e"); assertEquals(root, ProjectPaths.fromClasspathDataDir(root.resolve("target/test-classes/data"))); }
@Test(expected = IllegalStateException.class) public void rejectsOtherLayouts() { ProjectPaths.fromClasspathDataDir(Paths.get("/x/lib/data")); }

// ExpectedResponsesTest (TemporaryFolder as root)
@Test public void fileForUsesEventFolder()  // fileFor(parse("TC-TRADE-CREATION-FX_TRF-API-001")) == root/trade_creation/TC-TRADE-CREATION-FX_TRF-API-001.json
@Test public void writeThenRead()           // write then read returns the same text; the file has no "\r"
@Test public void readMissingIsEmpty()
@Test public void readsCrlfFile()           // a file written with "\r\n" line ends: JsonAssert.assertJsonEquals(read(...).get(), "{\"a\":1}") passes
@Test public void updateModeSwitch()        // (null,null)->false; ("update",null)->true; (null,"UPDATE")->true; ("",null)->false
@Test(expected = IllegalStateException.class) public void rejectsUnknownMode() { ExpectedResponses.updateMode("updat", null); }

// ResponseMaskerTest
@Test public void typeReplacesLeavesByType()     // {"id":"T1","n":5,"b":true,"z":null} with id,n,b,z -> type : id any-string, n any-number, b any-boolean, z stays null
@Test public void typeTreeKeepsStructure()       // {"s":[{"d":"2026-01-01","v":1.5}]} with s -> type-tree : {"s":[{"d":"${json-unit.any-string}","v":"${json-unit.any-number}"}]}
@Test public void regexChecksTheValue()          // msg "Submitted for checker approval. TaskId: CHK-1" with "regex:Submitted for checker approval\\. TaskId: CHK-.*" -> "${json-unit.regex}Submitted for checker approval\\. TaskId: CHK-.*"
@Test(expected = IllegalStateException.class) public void regexMismatchFails()    // msg "Access denied" with the rule above
@Test public void ignoreWritesIgnore()
@Test public void starPathCoversEveryElement()   // {"a":[{"t":"x"},{"t":"y"}]} with a[*].t -> type : both any-string
@Test(expected = IllegalStateException.class) public void typeOnObjectFails()
@Test(expected = IllegalStateException.class) public void pathMatchingNothingFails()
@Test(expected = IllegalStateException.class) public void unknownRuleFails()       // "maybe"
@Test public void keepsNumbersExactly()          // mask("{\"code\":200,\"n\":70000.0,\"p\":20150.8410403754144,\"q\":-18726.25346898106}", {}, "x") contains "200," "70000.0" "20150.8410403754144" "-18726.25346898106"
@Test public void maskedOutputMatchesTheActual() // JsonAssert.assertJsonEquals(mask(actual, rules, "x"), actual) passes for a response using all four rules
```

- [ ] **Step 2: Implement** the three classes per §7.1-7.3. Error messages name the case label and the path (§7.3 text: `rule <path> matches nothing in the response of <case>`).

- [ ] **Step 3: Check by reading**: placeholders are exactly `${json-unit.any-string}`, `${json-unit.any-number}`, `${json-unit.any-boolean}`, `${json-unit.regex}`, `${json-unit.ignore}`.

- [ ] **Step 4: Commit**: `git commit -m "Add recorded expected responses and masking of dynamic fields"`

### Task 4: Migrated data, converted expected files, equivalence

**Files:**
- Create: `oreo-e2e/src/main/java/com/example/module/oreo/testdata/TradeRequests.java`; test `TradeRequestsTest.java`
- Create data: `oreo-e2e/src/test/resources/data/api/common.json`, `api/trade_creation.json`, `ui/common.json`, `ui/trade_creation.json`, `ui/trade_early_termination.json`, `setup/trade-create.json`, `setup/trade-create-stepin-partial.json`, `setup/trade-create-stepin-full.json`, `setup/user-preference-defaults.json`, `setup/risk-calc-success-mock.json`, `setup/risk-calc-partial-success-mock.json`
- Create: `oreo-e2e/src/test/resources/data/api/expected/trade_creation/<caseId>.json` (15 files)
- Test: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/LegacyEquivalenceTest.java` (removed in Task 7)

**Interfaces:**
- Consumes: `TestData`, `CaseData`, `SetupData` (Task 2), `ExpectedResponses`, `Json` (Tasks 1, 3); the old `TestDataLoader.forKey`.
- Produces: `TradeRequests.withProductId(String requestJson, String productId) -> String` (sets `basic.productId`, creating `basic`; `AssertionError` when the root or `basic` is not an object; same messages as `TradeApiSteps.setBasicProductId`). The data files above, named as in §6.

- [ ] **Step 1: Write the tests**

```java
// TradeRequestsTest
@Test public void setsProductId()        // withProductId("{\"basic\":{\"a\":1}}","FX_TRF") == {"basic":{"a":1,"productId":"FX_TRF"}}
@Test public void createsBasic()          // withProductId("{}","FX_TRF") == {"basic":{"productId":"FX_TRF"}}
@Test public void overridesTemplateValue()// withProductId("{\"basic\":{\"productId\":\"FX_TRF\"}}","FX_PSCRIPT") -> productId FX_PSCRIPT

// LegacyEquivalenceTest: key lists read from the YAML files with YAMLMapper (top-level keys)
@Test public void caseRequestsAreUnchanged()
    // for every TC-* key of data/api/*.yml and data/ui/*.yml:
    //   old = TestDataLoader.forKey(key).request() with basic.productId removed, and for ui files basic.portfolioId "CM_OIL_CRU_OPT" -> "ABS_EQF"
    //   assertEquals(key, Json.parse(old), Json.parse(TestData.forCase(key).request()))
@Test public void setupPayloadsAreUnchanged()
    // pairs: API-SETUP-TRADE-CREATE/trade-create, API-SETUP-STEPIN-PARTIAL-TRADE-CREATE/trade-create-stepin-partial,
    //        API-SETUP-STEPIN-FULL-TRADE-CREATE/trade-create-stepin-full, SETUP-USER-PREFERENCE-CONFIG-DEFAULTS/user-preference-defaults (request),
    //        UI-SETUP-RISK-CALC-NEW-SUCCESS/risk-calc-success-mock, UI-SETUP-RISK-CALC-PARTIAL-SUCCESS/risk-calc-partial-success-mock (response)
    //   requests compared with basic.productId removed from the old one
@Test public void expectedFilesAreTheOldResponses()
    // for every TC-* key of data/api/*.yml: Json.parse(old response) equals Json.parse(ExpectedResponses.standard().read(CaseId.parse(key)).get())
```

- [ ] **Step 2: Implement `TradeRequests`; write the data files** with the content of §5.1, §5.5, §6 (values copied from the YAML; risk mocks in full; no `productId`; `defaults.dynamicFields` and `byProduct.*.dynamicFields` exactly as listed in §5.1; rows API-004..006 with `"dynamicFields": null`).

- [ ] **Step 3: Convert the old responses** with a script outside the repo (scratchpad; a file generator, not a test run): read the YAML with numbers as `Decimal`, resolve `responseRef` exactly like the old `TestDataLoader` (objects deep-merged, arrays and scalars replace, a `null` patch keeps the base), write each API `TC-*` key's response to `data/api/expected/trade_creation/<key>.json` in the `Json.pretty` layout -> 15 files. The equivalence test (`expectedFilesAreTheOldResponses`) is what proves them on the company machine.

- [ ] **Step 4: Check by reading**: each case row and setup file against its YAML entry (§5.1, §5.5, §6); a difference other than the two allowed ones is fixed in the data, never in the comparison.

- [ ] **Step 5: Commit** data, expected files, `TradeRequests` and tests: `git commit -m "Migrate the creation and early termination data to layered JSON"`

### Task 5: Switch the callers

**Files (all under `oreo-e2e/src/main/`):**
- Modify: `java/.../glue/hooks/ScenarioLifecycleHooks.java` (`injectTestDataIntoContext`)
- Modify: `java/.../glue/api/ApiResponseAssertionSteps.java`, `ApiRequestSteps.java` (`requestBodyFromTestData`), `TradeApiSteps.java` (`setMultiPartFormParameterFromTestData`, `setBasicProductId`)
- Modify: `java/.../glue/ui/TradeProvisioningSteps.java`, `NewTradeSteps.java:67`, `TradeLifecycleEventSteps.java:60,122,161`, `java/.../glue/hooks/E2EScenarioHooks.java:19`
- Modify: `resources/snippet/api/common_trade_action.snippet:4`

**Interfaces:**
- Consumes: `TestData`, `CaseData`, `SetupData`, `CaseId`, `ExpectedResponses`, `ResponseMasker`, `TradeRequests`.
- Produces: no new API; behaviour of §7.2 and §8.

- [ ] **Step 1: Hook.** `CaseId.fromScenarioName(scenario.getName())` instead of `TestDataLoader.tcKeyFromName`; `TestData.forCase(tcId)` (exceptions propagate: the scenario fails); always `_tc.key`; `write("[test-data:layers] " + String.join(" -> ", layers))`; when `hasRequest()`: `_tc.request`, the `[test-data:request]` write, `_tc.request.<top field>`, flattened leaves, as now; no `_tc.response`; drop the `TestDataRecord` import.
- [ ] **Step 2: `ApiResponseAssertionSteps`.** `responseMatchesCurrentScenario` per §7.2: missing `_tc.key` -> `AssertionError("[ApiResponseAssertionSteps] No [TC-...] case ID in the scenario name")`; record message `"Expected response recorded to " + file + ": review it against the requirement, commit it, run again."`; on a compare failure rethrow with `"\nExpected file: " + file + "\nIf the change is intended, run again with OREO_EXPECTED=update and review the diff."`; `ctx.write("[expected:recorded] " + file + "\n" + masked)` after a write. `expectedResponseFromTestData(key)` -> `TestData.setup(key)`; remove `expectedResponseFromCurrentScenario`.
- [ ] **Step 3: `ApiRequestSteps`, `TradeApiSteps`.** `TestDataLoader.forKey(key)` -> `TestData.setup(key)` (messages: `"Setup data '" + key + "' has no request."`); `setBasicProductId` delegates to `TradeRequests.withProductId`.
- [ ] **Step 4: UI steps and hooks.** Setup names: `API-SETUP-TRADE-CREATE` -> `trade-create`, `API-SETUP-STEPIN-FULL-TRADE-CREATE` -> `trade-create-stepin-full`, `API-SETUP-STEPIN-PARTIAL-TRADE-CREATE` -> `trade-create-stepin-partial`, `API-SETUP-TRADE-CANCELLATION` -> `trade-cancellation`, `UI-SETUP-AMENDMENT` -> `trade-amendment`, `UI-SETUP-RISK-CALC-NEW-SUCCESS` -> `risk-calc-success-mock`, `UI-SETUP-RISK-CALC-PARTIAL-SUCCESS` -> `risk-calc-partial-success-mock`, `SETUP-USER-PREFERENCE-CONFIG-DEFAULTS` -> `user-preference-defaults`. `TradeProvisioningSteps.submitTrade`: `TradeRequests.withProductId(TestData.setup(name).request(), datFile.name())`.
- [ ] **Step 5: Snippet.** `common_trade_action.snippet` line 4: `'API-SETUP-TRADE-CREATE'` -> `'trade-create'`.
- [ ] **Step 6: Check by reading** (no Genie here): `grep -rn "TestDataLoader\|TestDataRecord\|_tc.response" oreo-e2e/src/main` prints only `testdata/TestDataLoader.java` and `testdata/TestDataRecord.java`; `grep -rn "API-SETUP\|UI-SETUP\|SETUP-USER" oreo-e2e/src/main` prints nothing; every changed import resolves to a class of Tasks 1-4.
- [ ] **Step 7: Commit**: `git commit -m "Read test data, setup data and expected responses through the new loader"`

### Task 6: Offline validation and lookup

**Files:**
- Test: `oreo-e2e/src/test/java/com/example/module/oreo/testdata/FeatureCases.java`, `TestDataValidationTest.java`, `CaseDataLookup.java`, `FeatureCasesTest.java`

**Interfaces:**
- Consumes: everything above; `ProjectPaths.projectRoot()` (for `src/main/java`, `src/main/resources/snippet`).
- Produces: `record FeatureCase(String caseId, String rowId, String channelDir, String featureName)`; `static List<FeatureCase> FeatureCases.load(Path featuresRoot)` (`featuresRoot/<channelDir>/**/*.feature`; `rowId` = the bracket text as written; an Outline with `<product_type>` expands over every `Examples` table's `product_type` column; `featureName` = file name without `.feature`).

- [ ] **Step 1: Write the tests**

```java
// FeatureCasesTest (inline feature text in a TemporaryFolder)
@Test public void expandsOutlineOverEveryExamplesTable()  // 2 Examples tables, 3 products -> 3 cases, rowId "TC-X-<product_type>-API-001"
@Test public void plainScenarioIsOneCase()
@Test public void ignoresScenarioWithoutCaseId()

// TestDataValidationTest: one @Test per check of §10, on the real data
@Test public void dataFilesAreWellFormed()                 // §10.1: every data/api|ui/*.json and data/setup/*.json loads; byProduct keys are ProductDatFiles with their dat file present
@Test public void everyFeatureCaseResolves()               // §10.2: TestData.forCase for every FeatureCase; CaseId.eventFile() equals featureName
@Test public void everyRowAndEventFileHasAFeature()        // §10.3
@Test public void everyApiCaseHasItsExpectedFile()         // §10.4, both directions
@Test public void rulesAgreeWithExpectedFiles()            // §10.5; prints warnings, fails on errors
@Test public void everyUsedSetupNameExists()               // §10.6; KNOWN_MISSING = Set.of("trade-cancellation", "trade-amendment") with a comment: not covered for now (user, 2026-10-16)

// CaseDataLookup
@Test public void printCase()  // Assume oreo.case is set; prints layers, Json.pretty(request), dynamicFields, expected file path and whether it exists
```

- [ ] **Step 2: Implement** `FeatureCases` and the checks. Setup names used in code: regex `TestData\.setup\("([^"]+)"\)` over `src/main/java/**/*.java`, `from test data '([^']+)'` over `src/main/resources/snippet/**/*.snippet`.
- [ ] **Step 3: Commit**: `git commit -m "Add offline validation of the test data and a case data lookup"`; push; sync back.

- [ ] **Step 4: Handover 1 (user, company machine)**:
  1. `mvn test -Dtest='com.example.module.oreo.testdata.*Test'` -> all PASS; `TestDataValidationTest` prints the warnings of §10.5 (converted placeholders), no errors.
  2. `mvn test -Dtest=CaseDataLookup -Doreo.case=TC-TRADE-CREATION-FX_PSCRIPT_TRF-API-002` -> the four layers of §5.4; request with `direction` `Sell`, `notionalCurrency` `""`, the StepInPartial `udf`, no `premiumAmount`.
  3. `mvn compile` -> the glue of Task 5 compiles.
  4. If step 1 reports "No tests to run", the JUnit Platform runs without the vintage engine: see Task 7 Step 3.
  The user's results come back here; failures are fixed before Task 7.

### Task 7: Remove the YAML and the old loader, update docs

**Files:**
- Delete: `oreo-e2e/src/test/resources/data/api/trade_creation.yml`, `data/ui/trade_creation.yml`, `data/ui/trade_early_termination.yml`, `data/ui/mock_data.yml`, `data/ui/user_preference_config.yml`; `testdata/TestDataLoader.java`, `testdata/TestDataRecord.java`; `LegacyEquivalenceTest.java`
- Modify: `oreo-e2e/README.md` (layout, a "Test data" section: files, merge order, recording and `OREO_EXPECTED=update`, validation and lookup commands, the JUnit 4 note below); `docs/handover-notes.md` (section 4 paragraph on `oreo-e2e/`); spec status line -> `implemented on feature/testdata-refactor, first recording pending`

- [ ] **Step 1: Delete** the files above.
- [ ] **Step 2: Check**: `grep -rn "TestDataLoader\|TestDataRecord\|\.yml" oreo-e2e/src` prints nothing.
- [ ] **Step 3: Docs.** README note: the offline tests are JUnit 4; if `mvn test -Dtest=TestDataValidationTest` reports no tests on the company machine (JUnit Platform without the vintage engine), add `org.junit.vintage:junit-vintage-engine` in test scope.
- [ ] **Step 4: Commit and push**: `git commit -m "Remove the YAML test data and the old loader"`; `git push origin feature/testdata-refactor`; sync back to the local folder.

- [ ] **Step 5: Handover 2 (user, company machine)**: `mvn test -Dtest='com.example.module.oreo.testdata.*Test'` and `mvn compile` -> PASS. Then the first recording (spec §9 step 6).

### Task 8: Base and patch expected files

Added on 2026-10-16 with spec §7.5 (approved by the user). Runs after Task 7. It changes no expected file, so the recordings the user made on the company machine merge without conflict; the first compaction runs there (Step 12).

**Files:**
- Create: `oreo-e2e/src/main/java/com/example/module/oreo/testdata/JsonPatch.java`, `ExpectedCompaction.java`
- Modify: `testdata/TestDataRepository.java` (key `expectedBase`), `testdata/CaseData.java`, `testdata/ExpectedResponses.java`, `glue/api/ApiResponseAssertionSteps.java` (`responseMatchesCurrentScenario`)
- Modify data: `oreo-e2e/src/test/resources/data/api/trade_creation.json` (`defaults.expectedBase`); fixtures `testdata-fixtures/data/api/sample_event.json`; create fixtures `testdata-fixtures/data/api/bad_base.json`, `testdata-fixtures/data/ui/ui_base.json`
- Test: create `JsonPatchTest.java`, `ExpectedCompactionTest.java`, `CompactExpectedFiles.java` (the tool); modify `TestDataRepositoryTest.java`, `ExpectedResponsesTest.java`, `TestDataValidationTest.java`, `CaseDataLookup.java` (all in `oreo-e2e/src/test/java/com/example/module/oreo/testdata/`)
- Docs: `oreo-e2e/README.md` ("Test data" section of Task 7), `docs/handover-notes.md` (the `oreo-e2e/` paragraph), spec status line

**Interfaces:**
- Consumes: `Json`, `CaseId` (Task 1); `TestDataRepository`, `TestData`, `CaseData` (Task 2); `ExpectedResponses` (Task 3); the checks of Task 6.
- Produces:
  - `JsonPatch.diff(JsonNode base, JsonNode target) -> ArrayNode`: the ops of §7.5 step 3; order: the keys of `base` in its order (`remove`, or recurse), then the keys only `target` has, in its order (`add`). `JsonPatch.apply(JsonNode base, JsonNode ops, String label) -> JsonNode`: a new tree, `base` untouched; errors `IllegalStateException("[JsonPatch] " + label + ": op " + i + " (" + op + " " + path + ") ...")`.
  - `CaseData.expectedBase() -> String`: the resolved base case ID; `null` when there is none (no value, `null`, `<...>` on a case without product, or the case itself).
  - `ExpectedResponses`: `static boolean isPatch(JsonNode)` (an object whose keys are exactly `_base` and `_patch`); `record Resolved(String json, Path file, String base)` (`json` = `Json.pretty` of the full form; `base` null for a full file) with `String describe()` = `file.toString()`, or `file + " (patch on " + base + ")"`; `Optional<Resolved> resolve(CaseId id)` (empty only when the case's own file is absent); `List<String> events()` (folder names under the root, sorted; empty when the root does not exist); `List<CaseId> cases(String eventFile)` (the folder's `*.json` names without `.json`, sorted, through `CaseId.parse`).
  - `ExpectedCompaction`: `record Entry(CaseId id, String before, String after, String note)` with `boolean changed()` (`!before.equals(after)`); `record Plan(String eventFile, List<Entry> entries, List<String> errors)`; `static Plan plan(ExpectedResponses files, String eventFile, Function<CaseId, String> declaredBase)`; `static void write(ExpectedResponses files, Plan plan)`: `IllegalStateException` listing every error when `errors` is not empty, nothing written; else writes the changed entries. `note` is exactly `"full (no base)"`, `"patch on <B>, <n> ops"` or `"full (patch not shorter)"`.
  - `CompactExpectedFiles` (test class, the tool of §7.5): `mvn test -Dtest=CompactExpectedFiles -Doreo.compact=<event>|all`.

- [ ] **Step 1: Write the tests**

```java
// JsonPatchTest
@Test public void identicalTreesGiveNoOps()          // diff({"a":1,"u":[1]}, the same) == []
@Test public void replacesAChangedLeaf()             // {"a":{"b":1}} -> {"a":{"b":2}} == [{"op":"replace","path":"/a/b","value":2}]
@Test public void removesThenAddsKeys()              // {"a":1,"b":2} -> {"a":1,"c":3} == [{"op":"remove","path":"/b"},{"op":"add","path":"/c","value":3}]
@Test public void sameLengthArraysByIndex()          // {"u":[{"k":"x","v":"1"},{"k":"y","v":"2"}]} -> second v "3" == [{"op":"replace","path":"/u/1/v","value":"3"}]
@Test public void otherLengthArraysReplacedWhole()   // {"u":[1,2]} -> {"u":[1,2,3]} == [{"op":"replace","path":"/u","value":[1,2,3]}]
@Test public void typeChangeIsAReplace()             // {"i":{"x":1}} -> {"i":"${json-unit.ignore}"} == [{"op":"replace","path":"/i","value":"${json-unit.ignore}"}]
@Test public void escapesPointerTokens()             // a key "a/b~c" gives path "/a~1b~0c"; apply finds the key again
@Test public void numbersCompareExactly()            // {"n":70000.0} -> {"n":70000.00}: one replace; Json.compact of the applied tree contains "70000.00"
@Test public void applyGivesTheTargetBack()          // nested objects, arrays, null, decimals: assertEquals(target, JsonPatch.apply(base, JsonPatch.diff(base, target), "x"))
@Test public void applyLeavesTheBaseUntouched()
@Test public void addOnAnExistingKeyFails()          // IllegalStateException whose message contains "x: op 0 (add /a)"
@Test public void replaceOnAMissingKeyFails()
@Test public void removeOnAMissingKeyFails()
@Test public void indexOutOfRangeFails()             // replace /u/5 on {"u":[1]}
@Test public void unknownOpFails()                   // {"op":"move","path":"/a"}

// ExpectedResponsesTest, added (TemporaryFolder root, folder trade_creation)
@Test public void resolvesAFullFile()                // json() parses to the file's content; base() null; describe() == the file path
@Test public void resolvesAPatchOnItsBase()          // base {"a":1,"b":2}; variant {"_base":"<base id>","_patch":[{"op":"replace","path":"/b","value":3}]} -> json() parses to {"a":1,"b":3}; describe() ends with "(patch on <base id>)"
@Test public void patchOnAMissingBaseFails()         // IllegalStateException whose message contains the base's file path
@Test public void patchOnAPatchFails()               // message contains "is itself a patch"
@Test public void patchOnAnotherEventFails()         // _base "TC-OTHER-EVENT-FX_TRF-API-001"
@Test public void malformedPatchFails()              // {"_base":1,"_patch":[]}
@Test public void isPatchNeedsExactlyTheTwoKeys()    // {"_base":"x","_patch":[]} true; the same with a third key false; {"code":200} false
@Test public void listsEventsAndCases()              // events() == ["trade_creation"]; cases("trade_creation") sorted by name

// ExpectedCompactionTest (TemporaryFolder root, folder sample_event; declared bases from a Map: 002 and 003 -> 001)
// files: 001 an object of about ten fields; 002 = 001 with one leaf changed; 003 a small object sharing nothing with 001; TC-SAMPLE-EVENT-API-004 {"code":400}
@Test public void variantBecomesAPatch()             // after plan + write: 002 is {"_base":"TC-SAMPLE-EVENT-FX_TRF-API-001","_patch":[one replace]}, note "patch on TC-SAMPLE-EVENT-FX_TRF-API-001, 1 ops"; 001 and 004 not changed, note "full (no base)"
@Test public void keepsFullWhenThePatchIsNotShorter() // 003 not changed, note "full (patch not shorter)"
@Test public void caseWithoutBaseExpandsAPatch()     // 002 on disk as a patch, declared base null -> 002 written in its full form
@Test public void patchFollowsANewBase()             // 002 on disk as a patch on 001, declared base 005 (below) -> 002's _base is 005, resolve(002).json() unchanged
@Test public void secondRunChangesNothing()          // a plan right after write: no entry changed()
@Test public void errorWritesNothing()               // 001's file deleted: errors name TC-SAMPLE-EVENT-FX_TRF-API-001; write throws IllegalStateException; 002 and 003 byte-identical to before
@Test public void chainedBaseIsAnError()             // 001 declares base 004 while 002 builds on 001: an error naming TC-SAMPLE-EVENT-FX_TRF-API-001 "declares a base of its own"
@Test public void dataErrorIsListed()                // declaredBase throws for 004: an error containing "TC-SAMPLE-EVENT-API-004" and the exception's message

// TestDataRepositoryTest, added (fixture sample_event.json: defaults "expectedBase": "TC-SAMPLE-EVENT-<product_type>-API-001"; row API-002 byProduct FX_PSCRIPT_TRF "expectedBase": null)
@Test public void expectedBaseFollowsTheProduct()    // forCase("TC-SAMPLE-EVENT-FX_TRF-API-002").expectedBase() == "TC-SAMPLE-EVENT-FX_TRF-API-001"
@Test public void baseCaseHasNoBase()                // forCase("TC-SAMPLE-EVENT-FX_TRF-API-001").expectedBase() == null
@Test public void caseWithoutProductHasNoBase()      // forCase("TC-SAMPLE-EVENT-API-004").expectedBase() == null
@Test public void nullRemovesTheBase()               // forCase("TC-SAMPLE-EVENT-FX_PSCRIPT_TRF-API-002").expectedBase() == null
@Test(expected = IllegalStateException.class) public void baseInAnotherEventIsAnError()  // api/bad_base.json: defaults "expectedBase": "TC-OTHER-EVENT-<product_type>-API-001"; forCase("TC-BAD-BASE-FX_TRF-API-002")
@Test(expected = IllegalStateException.class) public void expectedBaseRejectedInUi()     // ui/ui_base.json: defaults "expectedBase": "TC-UI-BASE-<product_type>-UI-001"; forCase("TC-UI-BASE-FX_TRF-UI-002")
```

The existing assertions of `TestDataRepositoryTest` stay as they are: the two new fixture keys change no request, rule or layer label.

For `patchFollowsANewBase` a fifth file `TC-SAMPLE-EVENT-FX_TRF-API-005`, a near copy of 002's full form, is added with no declared base.

- [ ] **Step 2: `JsonPatch`** per §7.5 (the op rules and step 3). JSON Pointer per RFC 6901, escaping in both directions; array indexes only on arrays; equality by `JsonNode.equals` (so `70000.0` and `70000.00` differ).

- [ ] **Step 3: `expectedBase`** in `TestDataRepository`: allowed keys of §5.2 (api only; under `ui/` a load error like `dynamicFields`), layered as a scalar (§5.4: a later layer replaces it, `null` removes it); resolution of §7.5: `<...>` replaced by the product, none on a case without product, none when equal to the case; `CaseId.parse` of the result must give the same `eventFile()` and channel `API`, else `IllegalStateException` naming the file and the layer. `CaseData` gets the resolved value through its package-private constructor.

- [ ] **Step 4: `ExpectedResponses`**: `isPatch`, `resolve`, `events`, `cases`. Error texts: `"[ExpectedResponses] " + file + " builds on " + base + ", which has no file " + baseFile`; `"... builds on " + base + ", which is itself a patch: run CompactExpectedFiles"`; `"... builds on " + base + ", a case of another event"`; `"... is not a patch file: _base must be text and _patch an array"`. The `apply` label is the file name.

- [ ] **Step 5: `ExpectedCompaction`** per §7.5 steps 1-5: resolve every file of the event before deciding anything; a base's full form comes from that step, never from a file written in the same run; an exception of `declaredBase` goes into `errors` with the case ID; the size rule compares `Json.pretty(patchFile).length()` with `Json.pretty(fullForm).length()` (patch written only when strictly shorter).

- [ ] **Step 6: `ApiResponseAssertionSteps.responseMatchesCurrentScenario`**: in update mode the file is not read; otherwise `resolve(id)`; empty -> record as now; compare `JsonAssert.assertJsonEquals(resolved.json(), actual)`; on failure `e.getMessage() + "\nExpected file: " + resolved.describe() + "\nIf the change is intended, run again with OREO_EXPECTED=update, compact with mvn test -Dtest=CompactExpectedFiles -Doreo.compact=" + id.eventFile() + ", and review the diff."`

- [ ] **Step 7: Checks and tools.** `TestDataValidationTest.rulesAgreeWithExpectedFiles` reads `resolve(id).json()`. New `@Test public void expectedFilesAreCompacted()` (§10.7): `ExpectedCompaction.plan` for every `events()` with `id -> TestData.forCase(id.raw()).expectedBase()`; errors -> fail, listing them; changed entries -> printed `"[warn] " + file + ": " + note + ": run CompactExpectedFiles"`. `CaseDataLookup` also prints `expectedBase` and the resolved expected (`describe()`, then `json()`; `not recorded` when absent). `CompactExpectedFiles.compact()`: `Assume` that `oreo.compact` is set; `all` -> every `events()`, else that event (not among `events()` -> `AssertionError` naming the known ones); plans every event first and writes only when no plan has errors (else one `AssertionError` with all of them); prints `<file name>: <note>`, with ` (unchanged)` for an entry that did not change.

- [ ] **Step 8: Data.** `data/api/trade_creation.json`: `defaults.expectedBase` = `"TC-TRADE-CREATION-<product_type>-API-001"`, and its `_comment` says that variants are compared as patches on the product's API-001. The expected files are not touched (see the task's header).

- [ ] **Step 9: Docs.** README "Test data": base and patch, the compaction command, its place in the daily use of §7.4; `docs/handover-notes.md`: one sentence; spec status line -> `implemented on feature/testdata-refactor; first compaction pending`.

- [ ] **Step 10: Check by reading**: every test's expected value follows from §7.5 and the Interfaces above; only JDK / Jackson / JUnit 4 imports in `testdata/`; `grep -n "\.read(id)" oreo-e2e/src/main/java/com/example/module/oreo/glue/api/ApiResponseAssertionSteps.java` prints nothing.

- [ ] **Step 11: Commit and push**: `git commit -m "Compare variant responses as patches on a base case of the same product"`; `git push origin feature/testdata-refactor`; sync back to the local folder.

- [ ] **Step 12: Handover 3 (user, company machine)**, on the real recordings:
  1. `mvn test -Dtest='com.example.module.oreo.testdata.*Test'` -> PASS; check 7 warns for the `-002` / `-003` files (not compacted yet).
  2. `mvn test -Dtest=CompactExpectedFiles -Doreo.compact=trade_creation` -> one line per file: the `-001` files and `API-004..006` `full (no base)`; the `-002` / `-003` files `patch on ...-API-001, <n> ops`, or `full (patch not shorter)`.
  3. Step 1 again -> no check 7 warning. Review `git diff` (the variant files become patches), scan it for what must not be public, commit.
  4. The API creation cases against the real system -> PASS: a patch compares the same as the full file it replaced.
