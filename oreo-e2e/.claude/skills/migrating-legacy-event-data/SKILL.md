---
name: migrating-legacy-event-data
description: Use when an oreo-e2e event's cases still take their test data from the old YAML (data/**/*.yml) - "migrate the cancellation data", "move the remaining cases to the new test data", "an event is still in YAML" - or when output of MigrateLegacyData or a failure of LegacyEquivalenceTest is pasted.
---

# Migrating an event's old YAML data (oreo-e2e)

## Overview

`MigrateLegacyData` turns the old YAML of one feature file into the layered event files (`data/<api|ui>/<feature>.json`) and, for API cases, the old responses into expected files. It checks every case through the real loader and writes nothing while its plan has a stop. `LegacyEquivalenceTest` then proves, while the YAML exists, that each case gets the request its old key gave.

Your part: hand over the commands in order, review what the tool wrote, take every proposal and stop to the user, and add nothing the old data does not give. A value, rule or name the old data does not give is a **proposal in the report**, not a file change.

The old YAML exists only on the company machine, and Maven runs only there. This repository is public: no YAML, response, real ID or host goes into it. Give the commands, read the pasted output, and edit only what the review decides. Paths below are relative to the oreo-e2e root. In PowerShell, quote each `-D` argument whole (`"-Doreo.migrate=setup"`).

## Routine

1. **Setup payloads, once, before any feature**, even when the user asks for features only. The features' steps use setup keys (`from test data '<key>'`, `TestData.setup("...")`). This step writes `data/setup/<name>.json` and renames those uses:
   ```bash
   mvn test -Dtest=MigrateLegacyData -Doreo.migrate=setup
   mvn test -Dtest=MigrateLegacyData -Doreo.migrate=setup -Doreo.migrate.write=true
   ```
   Only that run's output shows that setup is done. The files already in `data/setup/` do not show it: some were migrated by hand with creation. `KNOWN_MISSING` in `TestDataValidationTest` lists the setup names **still missing**. If the user has not pasted the setup output, give these commands first. Running them again is safe: an existing file with the same payload is kept, and the output says `0 setup file(s) written`.
2. **Inventory**: `mvn test -Dtest=MigrateLegacyData -Doreo.migrate=all`. It only plans, with one line per feature not migrated yet: `ready`, `stopped`, or `nothing to migrate`.
3. **Per feature, one at a time, one commit each**:
   ```bash
   mvn test -Dtest=MigrateLegacyData -Doreo.migrate=<feature>                           # plan
   mvn test -Dtest=MigrateLegacyData -Doreo.migrate=<feature> -Doreo.migrate.write=true
   #   review (below); the capability for any proposal
   mvn test -Dtest=SyncProductExamples -Doreo.sync=all                                  # must say unchanged
   mvn test -Dtest=CompactExpectedFiles -Doreo.compact=<feature>                        # API features only
   mvn test -Dtest='com.example.module.oreo.testdata.*Test'
   #   commit
   ```
   The last command is the whole package, not `TestDataValidationTest` alone, because it includes `LegacyEquivalenceTest`. On the company machine `newDataGivesWhatTheOldDataGave` must run (not be skipped) and pass. It prints the events not migrated yet.
4. **Done** when `all` prints `0 to migrate, 0 stopped`. Then follow "End of the migration" in the README. Until then every YAML file stays.

## Review (after the write, before the commit)

Ask the user to paste the written event files, not the expected files. Check them against this list:

- **Defaults**: the majority values. Do they make sense for the event?
- **Rows**: each has `_comment` = the scenario name. Check the `null`s: a row clearing a part, `"dynamicFields": null`, and rows marked `no case data in the old YAML`.
- **Shared blocks**: a part equal to a block of `data/<channel>/common.json` (`trade-basic`, `stepin` ...) is proposed as `"use": ["<block>"]` in place of the copy. The tool never writes `use`. The equivalence test proves the merged request stayed the same.
- **YAML comments** worth keeping become `_comment`.
- **Placeholders without a rule**: list every path as an open decision and write no rule. The old templates used `${json-unit...}` for two kinds of value:
  - values that change from run to run: an ID, a date, a version, the task ID. These get a rule.
  - values the template could not know. These become exact values at the first real recording.

  The placeholder's type does not tell the two apart ("any-string, so `type`" is a guess). The user decides. Otherwise the second recording run shows it, as in README "Recorded responses". Until then they are offline warnings.
  A `regex:` rule of another event is never reused; its line names it.
- **Portfolio values kept** (any portfolio other than `ABS_EQF`): ask whether each is case data, such as a reassignment target.
- **`basic.productId` removed** (feature and setup reports): only the steps that take the product put it back (`set multi-part form parameter ... for product ...`, the Live trade provisioning). A step that sends the body as it is (`set request body from ...`, `set json request body ...`) then sends none. Find the steps of this feature that send these requests and tell the user which send none. Putting the value back (`byProduct.<P>.request.basic.productId`) is the user's decision. The equivalence test ignores `basic.productId`.
- **Setup**: the names (a different name is a line in `LegacyMigration.SETUP_NAMES`), the renamed uses (file:line), and `KNOWN_MISSING`.
- **Capability proposals**: the user adds the `Capability` constant, the `@capability#` tag and the products' capability by hand. After that, `SyncProductExamples` must say `unchanged` for that Outline. Any other answer means the registry and the old `Examples` disagree, and the user decides.

## Stops: the user decides

Show each stop, with its options and what each option costs. Change nothing for that feature until the user answers. Go on with the other features meanwhile.

| Stop | Options for the user |
|---|---|
| A case ID's event part is not the feature name (`TC-ALLOC-UI-001` in `trade_allocation.feature`) | Rename the feature file, or rename the case IDs **together with their old YAML keys**. If only the IDs change, the tool finds no data: a UI channel then quietly gets none and `all` says `nothing to migrate` |
| An API case without old data | Give it data in the YAML, or remove the case |
| The old loader fails (reference, cycle, duplicate key, invalid JSON, a request that is not an object) | Fix that key in the YAML, on the company machine |
| `data/<channel>/<feature>.json exists` | It was migrated before. Delete the file to migrate again, or leave it |
| `data/api/expected/<feature>/ has n file(s) of its cases already` | Files recorded before the migration. The tool writes the old responses there, so the user deletes them to migrate, or keeps the feature in YAML for now |
| `self-check: ...` | Report it as printed: a value the layers cannot express, or a tool bug. Never write the file by hand instead |
| `... still calls TestDataLoader` | Move that code to `TestData` first |
| Setup: two keys for one name, a bad name, `exists with another payload` | Add a line to `SETUP_NAMES`, or compare the two payloads and keep one |

## Never

- Edit an expected file by hand. It is recorded or compacted.
- Write or rebuild an event file by hand in place of the tool, here or there.
- Invent a value, a rule, a setup name or a capability.
- Delete or edit a YAML file before the end of the migration. Keys are global across files, and the equivalence test reads them. The one exception is the user's own fix of a stop.
- Run Maven outside the company machine.
- Commit company data, a host, an IP or a real trade ID.

## Report

In the user's language, in this order:

1. **Cases**: one line per case ID, `migrated` or `not migrated: <why>`. The why is the stop, or "not run yet".
2. **Files**: what the tool wrote, and what the review changed.
3. **Open decisions**: stops, placeholders without a rule, `use` proposals, portfolio values, setup names, capability proposals.
4. **Commands** for the company machine, the next one first.

## Common mistakes

| Mistake | Instead |
|---|---|
| Features first, setup later or never | Setup once, first |
| `mvn test -Dtest=TestDataValidationTest` as the check | `'com.example.module.oreo.testdata.*Test'`, which includes the equivalence test |
| A rule for each placeholder from its type | List it as an open decision until the user or a recording decides |
| Defaults that repeat `common.json` left as they are | Propose `use` |
| Renaming a case ID without its YAML key | Rename both in one step, or rename the feature file |
| Deleting a feature's YAML once it is migrated | Delete only at the end, when `all` says `0 to migrate, 0 stopped` |
