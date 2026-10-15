---
name: onboarding-lifecycle-event
description: Use when a new OREO lifecycle event (an action on a live trade, e.g. a new entry of the trade's action menu or of the trade details) has to be covered by UAT replay cases for every product that supports it - "add event Y", "we need cases for Y", "what do I need to give you to cover Y". Also when an existing event's dialog or outcome changed.
argument-hint: "<eventName>"
---

# Onboarding a lifecycle event

## Overview

Coverage is a matrix: products (`framework/products.ts`) x capabilities. **An event is one column**: a capability, the page / component entries it needs, a flow, test data and one spec that loops `productsWith('<event>')`, so every product that supports it gets a case with the product in its ID (`TC-TRADE-<EVENT>-<PRODUCT>-UI-001`) and its own case file for the PO.

Build it from this project's code only: the ten existing events are the templates. **Nothing is invented**: no element name, testid, label, toast text, status, request or mocked response. A step whose fact nobody gave is left out and reported.

A new product (a row) is the `onboarding-product` skill.

## Pick the closest existing event as the template

| The new event | Template (flow + spec) |
|---|---|
| Started from the row's action menu, a dialog, no checker | `trade-step-out.flow.ts`, `tests/trade-step-out-full.spec.ts` |
| Same, with a field only some products have | `trade-novation-remaining.flow.ts` (`onlyWhenFilled`) |
| Same, with its own risk calculation | `trade-partial-novation-remaining.flow.ts` (`RiskCalculation.forPartialNovation`) |
| A variable number of rows in the dialog | `trade-allocation.flow.ts` (`onlyWhen` on `allocationWays`) |
| Ends pending a checker | `trade-cancellation.flow.ts` |
| On the trade details page | `trade-amendment.flow.ts` |

## Ask QA first

One message, a checklist in the user's language. Do not write anything while a **required** item is missing. A recording made with `record-session.bat` while doing the event by hand is a good source: its report lists every click and value with the element's `data-testid`, in order.

1. **required** Where the maker starts it: the row action menu or the trade details (and the button), the entry's label, its element name in `elements/` or its `data-testid`.
2. **required** The dialog: every field and control in order, each with its element name or `data-testid`, its kind (text, combobox, select, number of rows...) and the test data value that goes in.
3. **required** What the confirmation waits for: the normal risk calculation (`RiskCalculation.forTrade`), another request (method and path, from the browser's Network tab), or none. For `"riskEngine": "mock"`, a real response of a risk request: a wrong mocked shape breaks the page.
4. **required** The outcome: toast title and / or message text, the blotter status and event status afterwards, anything checked in the trade details.
5. **required** Whether a checker has to approve it: then the maker's case ends at "pending checker approval" (a case logs in once).
6. **required** The products that support it.
7. Per-product differences: fields only some products have, values that follow from the dat file (a notional).
8. The title, if the business has one (otherwise follow the existing events'). The case ID is `TC-TRADE-<EVENT>-${forProduct}-UI-001`.

## Steps

Bottom-up, reusing before writing. Search `framework/` for an entry before adding one.

1. **Capability**: the event (camelCase) in `LIFECYCLE_EVENTS` of `framework/products.ts`. Products written with `...LIFECYCLE_EVENTS` get it at once; for one that does not support it, filter it out (the commented example there).
2. **Page / component entries** (locators only, atomic operations):
   - the action: `TradesPage.rowActions` (`lifecycle: true`) or a button of `TradeDetailPage.buttons`;
   - dialog fields: `DynamicAction.fields` (text, typed with `typeField`) or the dialog's own component;
   - texts: `Toast.message` / `Toast.title`, a new status in `TradesPage.eventStatus`;
   - a new request: in `RiskCalculation` (`framework/risk-engine.ts`) with its real mocked answer.

   A locator is `element('<name>')` when `elements/` has the name, otherwise `{ testId: '<data-testid>' }` (never an invented name).
3. **Flow** `framework/flows/trade-<event>.flow.ts`: `<verb>(tradeId, data)` = `lifecycleEvent.openAction(...)` -> one substep per thing the PO would recognize (`this.ui.And('I ...', ...)`) -> `lifecycleEvent.submit(tradeId)` or the event's own confirm. The action method never asserts its outcome: `expect...` methods do, called by the spec's `Then`. Data through `const p = this.params(data)`. A field only some products have: `this.ui.onlyWhenFilled(data, '<name>', (value) => ...)`. Export its `...Data` type and register it in `framework/flows/index.ts`.
4. **Test data** `testdata/trade-<event>.json`: `"use": ["given-trade"]`, the event's values in `"defaults"` with `"tradeId": ""`, per-product values in `defaults.byProduct.<PRODUCT>`. Nothing into `testdata/common.json`.
5. **Spec** `tests/trade-<event>.spec.ts`, the shape of `tests/trade-step-out-full.spec.ts`:
   - the per-product note comment;
   - `for (const forProduct of productsWith('<event>'))`;
   - title `[TC-TRADE-<EVENT>-${forProduct}-UI-001] <title naming a ${forProduct} trade>`;
   - `givenProduct(flows, testData<...>(), '<one sentence for the PO>', forProduct)`, `givenTrade(flows, data)`;
   - `Given ... flows.trades.orCreate(() => flows.tradeProvisioning.provisionLiveTrade(product, data))`, `maker is logged in to the trade portal`, the `When`, the `Then`s.
6. **Docs**: the spec's row in `docs/handover-notes.md` section 4, the capability list in its `framework/products.ts` row, and section 10 for what was not run; the README's case table.

## Verify

Stop at the first failure and report it.

1. `npx tsc -p .`
2. `npm run sync:elements` with no path and `OREO_E2E_DIR` unset (check only): no element name the new code uses may be undefined.
3. `npx playwright test tests/trade-<event>.spec.ts --list`: one title per supported product. This list is the coverage matrix.
4. Mock (`npm run mock`): only if its header in `mock-oreo/server.js` lists the event; otherwise "not run on mock". Never edit the mock to make a case pass.
5. Real system, only when `config.local.json` points at it and the dat files are there: `npx playwright test tests/trade-<event>.spec.ts`. Every run books real UAT trades: at most three runs per case. Fix only what the code got wrong (a missing `inner`, a wrong entry role); never loosen a check. Each passing case exports its case file.

## Report

In the user's language, from `report-template.md` next to this file: coverage matrix (one row per product), the trace (step line -> flow -> substeps -> locators), files, what QA still has to provide, the go-live checklist items still open, and what is only inferred.

## Go-live checklist (list the open items)

- Every product that supports the event has a case; the others are filtered out of the registry on purpose.
- Passed once on the real system with `"riskEngine": "real"`, not only on the mock.
- With a checker: the pending item appears for the checker (the approve / reject cases cover the decision).
- One run on an existing trade (`OREO_TRADE_ID` with `-g "<case ID>"`).
- Data variations are case data, not cases; the PO knows which value to change.
- Case files exported again and the package rebuilt (`npm run build:portable`) if `core/` changed.
- Negative cases (wrong trade state, field validation, permissions) are not generated: list the ones the business cares about as proposals, with what is needed to write them.

## Never

Edit `elements/` or `mock-oreo/` by hand; call `page` directly or put a locator in a flow; write a spec per product, a product literal or a data literal in a spec; commit a server address, IP, password or real trade ID; write anything but English in the repo. Commit and push as set for this project, after scanning the diff for those; never force-push or merge into main without asking.
