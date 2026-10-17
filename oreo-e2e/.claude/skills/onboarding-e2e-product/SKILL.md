---
name: onboarding-e2e-product
description: Use when a new OREO product type has to be covered by the Java + Cucumber (Genie) cases of oreo-e2e - "add product X to the E2E project", "we are launching X", "which E2E cases does X need", "what do I need to give you for X" - or when a product turns out not to support a scenario there.
---

# Onboarding a product (oreo-e2e)

## Overview

A product is a row, not code. Steps, snippets, the test data hook and the response check already take the product as a parameter, and `expectedBase` (`<product_type>`) already covers every product. Onboarding is: one `ProductDatFiles` constant listing the capabilities the product supports, its dat file, `byProduct` entries only for values that differ, a tool run that writes the product into the `Examples` of the Outlines tagged with those capabilities, and API responses recorded on the real system.

**Nothing is invented**: no capability, data value, dat content, masking rule or command-line flag. A value nobody gave is an open item in the report.

Paths below are relative to the oreo-e2e root.

## 1. Ask QA first

One message, in the user's language. Make no change while a **required** item is open (one exception: item 3). When QA cannot be reached and a required item is open, change nothing: report the questions and the exact change you will make once they answer.

1. **required** The product type exactly as the system knows it: sent as `basic.productId`, typed into the New Trade Product ID field. New names only (`FX_PSCRIPT`, never `FX_CO`).
2. **required** Yes / no for every capability (the constants of `Capability.java`). List them for QA as a table: capability, then the Outlines that carry its tag (case ID, title), from:
   `grep -rn -A1 "@capability#" src/test/resources/features`
   A capability covers all its Outlines, API and UI: a yes for only some of them is a question for the user, not a registry line. The answer comes from the requirement or the BA, not from "like the other products".
3. **required** The dat file: the default one the business uses, a real trade template. A file of a few bytes or test text is not one: ask again. In the public copy (its `.dat` files are one-line placeholders, section 2) the change does not use the file: make it with the placeholder, and keep the real file open in the report; the company copy needs it before any run.
4. Values that may differ for this product. Show QA the current values: the `defaults` of each event file under `src/test/resources/data/api|ui/` whose feature the product joins, and the `shared` blocks those defaults `use` (`api/common.json`, `ui/common.json`). Example: `earlyTermination.amount` must fit the dat file's notional. Not blocking: the product runs on the defaults until QA answers; a wrong default fails the case (the status check runs before any recording).
5. Whether the New Trade form, the trade detail page or the setup trade (`data/setup/trade-create*.json`, one body for every product) needs anything the current products do not have. Yes is a code change of its own: report it, do not guess it.

## 2. Change

| File | Change |
|---|---|
| `src/main/java/com/example/module/oreo/testdata/ProductDatFiles.java` | One constant `<P>("data/<P>.dat", <the capabilities QA confirmed>)`, e.g. `("data/<P>.dat", CREATE, EARLY_TERMINATION)`, inserted before `FX_OPT`, never first (`values()[0]` is the data checks' example product; the order of the constants is the order of the `Examples` rows). Its comment: the product's name as QA gives it, else none |
| `src/test/resources/data/<P>.dat` | If the committed `.dat` files are one-line placeholders (`# Placeholder: copy <P>.dat from the E2E project.`), this is the public copy: write the same line for `<P>`, never the real file, and add `<P>` to the placeholder list in `README.md`. Otherwise copy QA's file byte for byte |
| `byProduct.<P>` of an event file | Only values QA gave that differ from the defaults. `dynamicFields` only after a recording shows them (section 4) |

Then the `Examples`, never by hand: the tool writes the row `| <P> |` into every Outline tagged with one of the product's capabilities, in registry order, and prints one line per Outline (`add <P>`). It writes nothing when a feature file has a problem. Run it where oreo-e2e builds (section 3); elsewhere hand the command over:

```bash
mvn test -Dtest=SyncProductExamples -Doreo.sync=all
```

Leave alone:
- steps, snippets, hooks, `expected/` files, `expectedBase`, `Capability.java` and the `@capability#` tags;
- scenarios without `<product_type>` (negative and permission cases are written for one product);

Coverage QA asks for that no Outline has (a capability no Outline carries, an event without a feature in that channel, a negative case for the product) is a new scenario, not onboarding: list it in the report.

## 3. Offline check

Run Maven only where the user says oreo-e2e builds (the company machine); elsewhere give them the commands. `com.example.module.oreo.testdata` below is the package of `ProductDatFiles`: use the project's own. In PowerShell, quote each `-D` argument whole (`"-Doreo.case=..."`).

```bash
mvn test -Dtest='com.example.module.oreo.testdata.*Test'
```

Expected before the tool runs: `productExamplesMatchTheRegistry` fails with one `add <P>` line per Outline of the product's capabilities. After it, until the recordings: only `everyApiCaseHasItsExpectedFile` fails, one `no expected file` line per new API case. Any other error (a product that is not in `ProductDatFiles`, a `byProduct` without a dat file, a `remove` line) is a mistake in section 2.

```bash
mvn test -Dtest=CaseDataLookup -Doreo.case=TC-TRADE-CREATION-<P>-API-001
```

This prints the merged request the case will send.

## 4. Record the API responses (company machine, real system)

Every run books real UAT trades. The project does not document how to run a subset with Genie: ask the user how they run one feature or case, never invent a `-D` flag. The risk engine mode is `oreo.risk.engine.mode` in `genie.properties`.

1. Run the product's API cases: each records `data/api/expected/<event>/<caseId>.json` and fails once.
2. Run them again. A failure on a value that changed between the two runs (an ID, a date, a version, a generated schedule) is a dynamic field. Add a rule under `byProduct.<P>.dynamicFields` of the event file, shaped like the other products' entries (`type`, `type-tree`, `regex:<pattern>`, `ignore`: README "Recorded responses"). Record again with `OREO_EXPECTED=update`, then run once more: it must pass.
3. Review each recorded file against the requirement: a wrong value recorded is a wrong expectation.
4. Compact, then review `git diff`: the product's variants become patches on its `API-001`. Run section 3 again: green.
   ```bash
   mvn test -Dtest=CompactExpectedFiles -Doreo.compact=<event>
   ```
5. Run the product's UI cases.

## 5. Report

In the user's language:
1. **Coverage**: one line per capability: yes (its Outlines, as case IDs with `<P>`) / no (who confirmed).
2. **Files** created and changed.
3. **Open**: required items still missing, values still on the defaults, recordings pending, anything inferred.
4. **Commands** for the company machine: the tool (section 2), then sections 3 and 4, in order.

## Common mistakes

| Mistake | Instead |
|---|---|
| Every capability "like the other products" | Only the capabilities QA confirmed |
| `Examples` rows typed by hand | The tool writes them; a row the registry does not back fails `productExamplesMatchTheRegistry` |
| A new `Capability` constant or `@capability#` tag for the product | A new scenario: report it |
| A row commented out to skip the product for a while | Take the capability off its constant, then the tool; a comment inside a product table stops the tool |
| QA's real dat file committed to the public copy | The placeholder line |
| `-Dcucumber.filter.name=...`, `-Doreo.risk.engine.mode=...` | Ask how the user runs a subset; the mode is in `genie.properties` |
| `dynamicFields` guessed before a recording | A rule whose path is not in the response fails the recording |
| Expected files written by hand | Record them |
| The product added to negative scenarios | They are written for one product |

## Never

Commit a server address, IP, account, password, company name or real trade / task ID; write anything but English in the repo. Commit and push as set for this project, after scanning the diff for those; never force-push or merge into main without asking.
