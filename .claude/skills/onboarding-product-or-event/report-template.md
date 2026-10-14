# Onboarding report template

Fill in and post in the conversation, in the user's language. Keep every row: an empty cell is a question for QA.

## 1. Coverage matrix

Mode A (product `<PRODUCT>`): one row per capability. Mode B (event `<event>`): one row per product.

| Capability / product | Case ID | Status | Note |
|---|---|---|---|
| create | `TC-TRADE-CREATION-<PRODUCT>-UI-001` | listed, not run | dat file missing |
| stepInFull | `TC-TRADE-CREATION-<PRODUCT>-UI-002` | ... | |
| stepInPartial | `TC-TRADE-CREATION-<PRODUCT>-UI-003` | ... | |
| cancellation | `TC-TRADE-CANCELLATION-UI-001 @product:<PRODUCT>` | ... | |
| novationRemaining | `TC-TRADE-NOVATION-REMAINING-UI-001 @product:<PRODUCT>` | ... | target amount: typed / left out (`byProduct`) |
| stepOutFull | - | not supported | left out of the registry (confirmed by ...) |
| approval / reject | `TC-TRADE-APPROVE-CREATION-UI-001` ... | not per product | PO changes `product` / `datFile` |

Status is one of: `passed on real`, `passed on mock`, `listed, not run (why)`, `skipped (the missing value)`, `not supported (left out of the registry)`, `failing (the error)`.

## 2. Files

- Created: ...
- Changed: ...

## 3. QA has to provide

| What | Where it goes | Unblocks |
|---|---|---|
| Default dat file | `testdata/dat/<PRODUCT>/<PRODUCT>.dat` | every run of the product |
| Whether the novation remaining dialog has a target amount | `defaults.byProduct.<PRODUCT>.novationTargetAmount = ""` in `testdata/trade-novation-remaining.json` if not | that run |
| New and expected notional of partial termination | `defaults.byProduct.<PRODUCT>` in `testdata/trade-partial-termination.json` | that run |

## 4. QA checklist before go-live (open items)

- [ ] ...

## 5. For the PO

- Events `<PRODUCT>` does not support (do not choose it there): ...

## 6. To verify on the real system

- ...
