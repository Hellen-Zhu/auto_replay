---
name: onboarding-product
description: Use when a new OREO product type (e.g. a new FX structured product going live) has to be covered by the UAT replay cases of this project - "we are launching product X", "add product X", "which cases does product X need", "what do I need to give you for X". Also when an existing product turns out not to support an event, or to list one product's coverage and what QA still has to provide.
argument-hint: "<PRODUCT_TYPE>"
---

# Onboarding a product

## Overview

Coverage is a matrix: products (`framework/products.ts`) x capabilities (`create`, `stepInFull`, `stepInPartial` and each of `LIFECYCLE_EVENTS`). Every spec loops `productsWith('<capability>')`, so **a product is one row**: a registry line, its dat file and the values that differ for it. No spec, flow or page changes. Every cell of the row is then a case with the product in its ID (`TC-TRADE-CREATION-<PRODUCT>-UI-001`, `TC-TRADE-CANCELLATION-<PRODUCT>-UI-001`, ...) and its own case file for the PO.

**Nothing is invented**: no capability, data value, dat file or field. A value nobody gave is a gap in the report.

A new lifecycle event (a column) is the `onboarding-lifecycle-event` skill; do that first when both are needed, so the product's row includes the event.

## Ask QA first

One message, a checklist in the user's language. Do not write anything while a **required** item is missing.

1. **required** The product type exactly as typed into the Product ID field and sent as the API's `productId` (e.g. `FX_TRF`). Old names (`FX_CO`, `FX_FSB`) are never used.
2. **required** Its capabilities, yes or no each: `create`, `stepInFull`, `stepInPartial` and every entry of `LIFECYCLE_EVENTS`. Source: the business requirement or the BA, not a guess. A "no" is left out of the registry on purpose.
3. **required** Its default dat file (`testdata/dat/<PRODUCT>/<PRODUCT>.dat`) and any variants the business uses. Without it every run of the product is skipped. Dat files are not committed: they live on QA's machine.
4. **Optional dialog fields**: fields only some products have. Find them: `grep -rn "onlyWhenFilled" framework/flows` (today `novationTargetAmount` of novation remaining, FX_TRF only). Ask whether the product has each one, and its value.
5. **Values that follow from the dat file** (the trade's notional): what a case types (a new or remaining notional that must fit) and what it checks (an expected notional). Find them: the `byProduct` entries in `testdata/trade-*.json` (today partial termination `partialTerminationNewNotional` / `expectedNotional`, partial novation `remainingNotional`). Ask for this product's value of each, or for a decision to stop checking it.
6. Whether its New Trade form or create-trade request needs fields the current products do not have. If yes, that is a code change of its own: report it, do not guess.

## Steps

1. **Registry**: one line in `PRODUCTS` of `framework/products.ts`. All capabilities: `['create', 'stepInFull', 'stepInPartial', ...LIFECYCLE_EVENTS]`; some not supported: filter them out as in the commented example there.
2. **Dat file**: copy what QA gives to `testdata/dat/<PRODUCT>/`; never edit or invent one.
3. **Per-product values** (items 4 and 5): under `defaults.byProduct.<PRODUCT>` of the event's own `testdata/trade-<event>.json`, next to the other products' entries. The merge (common -> shared blocks -> defaults -> row) is shallow, so one spec's `byProduct` stays in one place. `byProduct` is applied by `givenProduct` (event specs) only, not by the creation specs.
4. **An optional field the new product lacks but every product had so far**: move its value from `defaults` into `byProduct` of the products that have it, set `defaults` to `""`, and put the step under `this.ui.onlyWhenFilled(data, '<name>', (value) => ...)` in the flow (example: `novateRemaining` in `framework/flows/trade-novation-remaining.flow.ts`).
5. Nothing else: no spec per product, no product literal or table of products in a spec.

## Verify

Stop at the first failure and report it.

1. `npx tsc -p .`
2. `npx playwright test --list --grep "<PRODUCT>-UI-"`: one title per supported capability (`FX_PSCRIPT-UI-` does not match `FX_PSCRIPT_FSKO`). This list is the coverage matrix.
3. Mock (`npm run mock`): its Product ID dropdown is a fixed list, so the product's UI creation is "not run on mock"; event cases (trade created through the API) work when the dat file name starts with the product. Never edit the mock to make a case pass.
4. Real system, only when `config.local.json` points at it and the dat file is there: `npx playwright test --grep "<PRODUCT>-UI-"`. Every run books real UAT trades: at most three runs per case. Each passing case exports `cases/<spec>/<case ID>.json`.

## Report

In the user's language, from `report-template.md` next to this file: coverage matrix (one row per capability), files, what QA still has to provide, the go-live checklist items still open, the events the PO must not choose this product for, and what is only inferred.

## Go-live checklist (list the open items)

- Every supported capability has a case; every unsupported one is left out on purpose (confirmed by the BA).
- Creation normal, StepIn full and partial where supported, with the default dat file and every variant the business uses (the PO runs a variant by changing the case data `datFile`).
- Each event passed once on the real system with `"riskEngine": "real"`, not only on the mock.
- The approval / reject cases run for one product: the PO runs them for this product by changing the case data `product` and `datFile`.
- One event run on an existing trade (`OREO_TRADE_ID` with `-g "<case ID>"`), as the PO replays on their own trades.
- Values checked against the dat file are given in `byProduct` or deliberately not checked.
- Case files exported again and the package rebuilt (`npm run build:portable`); the PO gets the new package.
- Negative and permission cases are not generated: list the ones the business cares about as proposals, with what is needed to write them.

## Never

Edit `elements/` or `mock-oreo/` by hand; commit a server address, IP, password or real trade ID; write anything but English in the repo. Commit and push as set for this project, after scanning the diff for those; never force-push or merge into main without asking.
