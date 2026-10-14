---
name: onboarding-product-or-event
description: Use when a new OREO product (a new product type, e.g. a new FX structured product going live) or a new lifecycle event has to be covered by UAT cases in this replay project - "we are launching product X", "add event Y", "which cases does product X need", "what do I need to give you to cover X". Also when a product turns out not to support an event, or to list the coverage of a product or event and what QA still has to provide.
argument-hint: "product <PRODUCT_TYPE> | event <eventName> [E2E project path] [feature file]"
---

# Onboarding a product or a lifecycle event

## Overview

UAT of a product going live means **every capability the product supports has a case that a PO can replay**: creation (normal, StepIn full, StepIn partial) and every lifecycle event. This project is built so that coverage is a matrix: products (`framework/products.ts`) x capabilities, one spec per capability, each spec looping `productsWith('<capability>')`. Onboarding is filling one row of that matrix (a product) or one column (an event), then reporting every cell: generated, skipped and why, or waiting for QA.

**Nothing is invented**: no product type, capability, element name, testid, data value, toast text, status or request. A value nobody gave is a gap in the report, and the run that needs it is left out until it is there: a value the test data leaves empty (`""`) skips the step that uses it when the step is under `ui.onlyWhenFilled`, and otherwise the gap is reported.

Read first: `CLAUDE.md` sections 2, 3, 11, and `docs/handover-notes.md` section 4 for the specs and flows that exist. For an event that the Java E2E project has, the tracing from feature to elements is the `porting-java-e2e-cases` skill: use it for that part and come back here for the matrix.

## Which mode

| The user says | Mode | Changes |
|---|---|---|
| A new product type | **A. Product** (a row) | Registry line, dat file, per-product values. No new spec or flow |
| A new lifecycle event | **B. Event** (a column) | Capability, page / component entries, flow, spec, test data. Every product that supports it is covered by the loop |
| A product does not support an event | **A**, step 1 only | Leave the capability out of the product's list (the commented example in `framework/products.ts`) |
| Both | **B** first, then **A** | The new product's row then includes the new event |

## Before writing anything: what QA has to provide

Ask for everything missing in one message, as a checklist in the user's language. Do not start a mode while an item marked **required** is missing; the others become skips and gaps.

**Mode A, new product**

1. **required** Product type exactly as typed into the Product ID field and sent as the API's `productId` (e.g. `FX_TRF`). An old name used by the E2E project (`FX_CO` = `FX_PSCRIPT`) is noted, never used.
2. **required** Its capabilities: `create`, `stepInFull`, `stepInPartial` and each of `LIFECYCLE_EVENTS`, yes or no each. Source: the product's business requirement or the BA, not a guess. A "no" is as important as a "yes": it is a capability left out, not a missing case.
3. **required** Its default dat file, to go to `testdata/dat/<PRODUCT>/<PRODUCT>.dat`, plus any variant files (the PO chooses among them). Without it every run of the product is skipped (`prepare()`). The repo commits no dat file (only `testdata/dat/README.md`): they are on QA's machine, so locally every product is skipped unless the files were copied in.
4. Fields that the product's dialogs do not have, which the others do (e.g. the novation remaining target amount): for each, the step is under `ui.onlyWhenFilled` and the product gets `""` for its value in `byProduct`. No spec keeps a table per product (user decision: hard to maintain); a difference that is not a missing field is a value in `byProduct` too.
5. Values that follow from the dat file (the trade's notional): both those a case **types** (a new notional, a remaining notional, a target amount must fit the trade's notional) and those it **checks** (an expected notional). Today they are FX_TRF's: `partialTerminationNewNotional` / `expectedNotional`, `remainingNotional` of partial novation, `novationTargetAmount`. Ask for this product's value of each, or for a decision to stop checking it (as was done for the partial novation equation line). They go into `byProduct.<PRODUCT>` (see Mode A step 4).
6. Product-specific page layout, **only if a case reads it**: grep `framework/flows` and `tests/` for the table first (e.g. `TradeDetailPage.scheduleFixings` is used by no case today, so do not ask for it). Element keys only from `elements/` after a sync.
7. Whether the product needs other mandatory fields on the New Trade form or in the create-trade request than the current products: if yes, that is a code change on its own (report it, do not guess the field).

**Mode B, new event**

1. **required** The source: the E2E project's feature file (then trace it with `porting-java-e2e-cases`), or, without one, all of the following from QA, each with its element key as in `elements/`:
   - where the maker starts it (row action menu of the trade portal, or trade details -> More actions), the entry's element key and label;
   - the dialog's fields and controls in order, with element keys, and which test data value goes into each;
   - the request the confirmation waits for (the normal risk calculation, a special one like the partial novation's, or none) and, for `"riskEngine": "mock"`, a real response of it (see `framework/risk-engine.ts`: a wrong mocked shape breaks the page);
   - the outcome: toast title or message text, the blotter status and event status afterwards, and anything checked in the trade details;
   - whether a checker has to approve it (then the maker's case ends at "pending checker approval": a case logs in once).
2. **required** The products that support it (mode A item 2 for this event only).
3. Test data values, the E2E project's request template names if there are any, and per-product values (dat-dependent amounts, Examples columns).
4. The case ID (`TC-TRADE-<EVENT>-UI-001` unless the feature has one) and the title.

## Mode A: a new product

1. **Registry.** One line in `PRODUCTS` of `framework/products.ts`. All capabilities: `['create', 'stepInFull', 'stepInPartial', ...LIFECYCLE_EVENTS]`. Some not supported: filter them out of the list as in the commented example there, so the line stays readable as "all events except ...".
2. **Dat file** at `testdata/dat/<PRODUCT>/<PRODUCT>.dat` (variants next to it). Never edit or invent one: copy what QA gives. The mock accepts only a file whose name starts with the product.
3. **Missing fields.** For each field of item 4, `"<field>": ""` under `byProduct.<PRODUCT>`; if the step that types it is not under `ui.onlyWhenFilled` yet, put it there (in the flow).
4. **Test data.** `byProduct.<PRODUCT>` for each dat-dependent value given, in the `defaults` of the spec's own `testdata/<spec>.json`, as one `byProduct` object for all products of that spec. The merge of common -> shared blocks -> defaults -> row is **shallow** (`framework/data.ts`): a `byProduct` at a later level replaces an earlier one entirely, so never split one spec's `byProduct` across levels. `byProduct` is applied by `givenProduct` only (the event specs and creation `-UI-004`), not by the per-product creation tests `-UI-001..003`, which take `testData()` as it is. Nothing else changes: the product's own values come from the same shared blocks.
5. **Page tables** keyed by product (item 6) only with element keys that exist.
6. Nothing in `tests/` loops by hand, no copy of a spec per product, no table of products and no product literal in a spec.

## Mode B: a new lifecycle event

Bottom-up, reusing before writing (the closest existing event is the template: `trade-step-out.flow.ts` and `tests/trade-step-out-full.spec.ts` for a dialog started from the row's action menu; `trade-cancellation` for one that waits for a checker; `trade-amendment` for one on the trade details).

1. **Capability**: the event's name (camelCase, as the row action) in `LIFECYCLE_EVENTS` of `framework/products.ts`. Products written with `...LIFECYCLE_EVENTS` get it at once; check each product with a filtered list and add or leave it out as QA said.
2. **Page / component entries**: the row action in `TradesPage.rowActions` (with `lifecycle: true`), new dialog fields in `DynamicAction.fields`, the toast text in `Toast.message` / `Toast.title`, a new event status in `TradesPage.eventStatus`, a new risk calculation in `RiskCalculation` with its real mocked answer. Only names that are in `elements/`.
3. **Flow** `framework/flows/trade-<event>.flow.ts`: `<verb>(tradeId, data)` = `lifecycleEvent.openAction` -> substeps that fill the dialog -> `lifecycleEvent.submit` (or the event's own confirm); `expect...` methods for the outcome, which the action method never asserts. Its `...Data` interface next to it. Register it in `framework/flows/index.ts` and export the type.
4. **Test data**: a shared block in `testdata/common.json` named after the event, and `testdata/trade-<event>.json` with `"use": ["given-trade", "<event>"]` and `"defaults": { "tradeId": "" }`.
5. **Spec** `tests/trade-<event>.spec.ts`, the same shape as `tests/trade-step-out-full.spec.ts`: the NOTE comment, `for (const forProduct of productsWith('<event>'))`, title `[<case ID>] <title> ${productTag(forProduct)}`, `givenProduct(..., forProduct)` with a one-sentence description for the PO, `givenTrade(flows, data)`, `Given ... flows.trades.orCreate(() => flows.tradeProvisioning.provisionLiveTrade(product, data))`, `maker is logged in to the trade portal`, the When, the Thens. A field only some products have goes under `ui.onlyWhenFilled` in the flow, its value empty in `byProduct` for the others; no table of products in the spec.
6. **Docs**: the spec's row in `docs/handover-notes.md` section 4, the capability list in the `framework/products.ts` row, and section 10 for what was not run.

## Verify

In this order; stop at the first failure and report it.

1. `npx tsc -p .`
2. `npm run sync:elements` with `OREO_E2E_DIR` unset (then it only checks; with a path or that variable it syncs and rewrites `elements/`): no element name the new code uses may be undefined.
3. Mode A: `npx playwright test --list --grep "(@product:|CREATION-)<PRODUCT>\b"`. The event runs carry the tag `@product:<PRODUCT>`, the creation tests only have the product in their case ID; `\b` keeps `FX_PSCRIPT` from also matching `FX_PSCRIPT_FSKO`. Mode B: `npx playwright test tests/trade-<event>.spec.ts --list`. The titles are the coverage matrix of step "Report".
4. On the mock (`npm run mock`, mock config, `OREO_ELEMENTS_DIR` for elements the partial files lack) only what the mock implements: its header in `mock-oreo/server.js` says which pages and events. Its Product ID dropdown has a fixed list of products, so a new product's creation in the browser is "not run on mock"; a trade created through the API works when the dat file name starts with the product. Never edit the mock to make a case pass.
5. On the real system, only when `config.local.json` points at it and the dat file is there: the same `--grep` without `--list`, or the event's spec. Every run books real UAT trades: at most three runs per case. A case file is exported only from the run for the test data's product.

## Report

In the conversation, in the user's language. Use `report-template.md` next to this file. It has, in this order:

1. **Coverage matrix**: one row per capability of the product (mode A) or per product (mode B): case ID, status `passed on real` / `passed on mock` / `listed, not run (why)` / `skipped (the missing value)` / `not supported (left out of the registry)`. Mode A also lists the cases that are not per product (approval / reject, creation `-UI-004`): the PO runs them for the new product by changing the case data `product` (and `datFile`).
2. **Files** created and changed.
3. **QA has to provide**: every gap from "Before writing anything", each with where it goes (file and key) and what it unblocks.
4. **QA checklist before go-live**: the items below that are not done yet.
5. **For the PO**: the events the product does not support. The runner does not know the capabilities, so the PO must be told not to choose this product in those cases.
6. **To verify on the real system**: everything inferred.

### QA checklist before a product or event goes live

What a QA lead checks beyond "the cases are written"; the report lists the open ones.

- Every capability the product supports has a run, and every one it does not support is left out of the registry on purpose (confirmed by the BA), not forgotten.
- Creation: normal, StepIn full and partial where supported, the default dat file and each variant the business uses (the PO runs variants through `[TC-TRADE-CREATION-UI-004]` by changing `product` and `datFile`; its committed data row is FX_TRF).
- Each event: passed once on the real system with `"riskEngine": "real"`, not only on the mock.
- Events that need a checker: the maker's case ends at pending; the checker's decision is covered by the approval / reject cases (one product), so check that the event's pending item appears for the checker.
- A run on an existing trade (`OREO_TRADE_ID` with `--grep @product:<PRODUCT>`) for at least one event, since that is how the PO replays on their own trades.
- Data variations are case data, not cases (direction, number of ways, amendment field): the PO knows which case data to change.
- Values checked against the dat file are either given per product (`byProduct`) or deliberately not checked.
- The case files are exported again and the portable package rebuilt (`npm run build:portable`) after any change in `core/`; the PO gets the new package.
- Negative and permission cases (a checker cannot approve their own trade, a field validation, an event offered for a trade in the wrong state) are not generated by this skill: list the ones the business cares about as proposals, each with what is needed (the error text, the element) before it can be written.

## Stop and report, do not work around

- A **required** input is missing: ask, do not start.
- An element key not in `elements/`, a toast text, a status, a request or a mocked response nobody showed: leave that step out of the code and skip the run that needs it; never guess a name or a text.
- A product needs a new field on the New Trade form or in the create-trade request: report it as a change of its own.
- Never edit `elements/` or `mock-oreo/` by hand, never write a spec per product, never put a product literal, a table of products or a data literal into a spec, never commit a server address, an IP, a password or a real trade ID, everything in the repo in English. Commit and push only when the user asks.
