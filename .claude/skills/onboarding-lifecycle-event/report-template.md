# Lifecycle event onboarding report template

Fill in and post in the conversation, in the user's language. Keep every row: an empty cell is a question for QA.

## 1. Coverage matrix: `<event>`

| Product | Case ID | Status | Note |
|---|---|---|---|
| FX_PSCRIPT | `TC-TRADE-<EVENT>-FX_PSCRIPT-UI-001` | ... | |
| FX_TRF | `TC-TRADE-<EVENT>-FX_TRF-UI-001` | ... | optional field typed (`byProduct`) |
| FX_PSCRIPT_FSKO | - | not supported | filtered out of the registry (confirmed by ...) |

Status is one of: `passed on real`, `passed on mock`, `listed, not run (why)`, `skipped (the missing value)`, `not supported (left out of the registry)`, `failing (the error)`.

## 2. Trace

| Step line | Flow method | Substeps | Locators |
|---|---|---|---|
| `When perform ... on the '<product>' trade` | `flows.trade<Event>.<verb>` (new) | `I choose ... from the action menu`, `I type ...`, `I confirm the event` | `trade_portal.row_action_<...>`, `{ testId: '...' }` |

## 3. Files

- Created: ...
- Changed: ...

## 4. QA has to provide

| What | Where it goes | Unblocks |
|---|---|---|
| Toast message text | `Toast.message.<event>Completed` | the `Then` step |
| `data-testid` of field ... | `DynamicAction.fields` / the dialog component | the `When` step |

## 5. Go-live checklist (open items)

- [ ] ...

## 6. To verify on the real system

- ...
