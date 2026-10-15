---
name: converting-po-recording
description: Use when a PO or QA sends a recording made with record-session.bat (an evidence/recording_<timestamp>/ folder with result.json, step screenshots and trace.zip) and it should become a replayable case of this project - "turn this recording into a case", "the PO recorded this, can we automate it", "make a case from what the PO did".
argument-hint: "<recording folder>"
---

# Converting a PO recording into a case

## Overview

A recording is a list of clicks and typed values on real data (one trade ID, one account). A case of this project is business steps that create their own trade and take their values from case data. So converting is **finding the business intent of the recording and expressing it with this project's existing flows**, never copying the clicks. Most recordings turn out to be an existing case with other data: then the result is case data, not code.

Read first: `CLAUDE.md` sections 2, 3, 11; for the spec a recording maps to, its row in `docs/handover-notes.md` section 4 (grep the spec's file name there).

**Nothing is invented**: an element without a testid, a text, a request or an outcome the recording does not show is a question for QA, not a guess.

**The recording holds real data**: trade IDs, an account's e-mail, the machine name (`machine` of `result.json`), and in `trace.zip` addresses and session tokens. None of it goes into a file of the repo or into the report: work from the reader's output, which shows a trade ID as `<trade ID>` and what was typed on the login page as `<account>`, and refer to actions by their number. The folder stays where QA put it (`evidence/` is ignored by Git).

## 1. Read the recording

```bash
node .claude/skills/converting-po-recording/read-recording.js <recording folder>
```

One line per action: page path, kind (`click`, `rightClick`, `change` = typed value, `press`), text, role, the testid, its element name in `elements/`, the files under `framework/` that use it, and the specs whose exported case files (`cases/`) use the testid (`(shared)` when most do, e.g. login and search); `(focus only)` marks a click that only put the cursor into the field typed into next. While `elements/` is partial (before the sync on the company machine) most testids show "NOT in elements/": then the case files and a search of `framework/` for the testid string are the way to the code. A recording made before the runner stored actions as data is read back from its descriptions. `--json` gives the same as data.

Also look at:
- `description` (the PO's one-line note) and the **last screenshots** (`step-XX.png`, readable as images): they show the outcome (a toast, a status) and the logged-in user in the top bar, which the actions do not record. A screenshot is taken after its action, one at a time: when the PO acted quickly they lag behind, so `step-NN` may show a later screen than action NN; the last one always shows the final screen.
- `trace.zip` only when a request is needed (a new event's confirm): unzip it into the scratchpad, read the network entries for method, path and response shape. Never copy a header, token or address out of it.

## 2. Cut it into business steps

Drop the noise first: `(focus only)` clicks, clicks without testid and text, Enter in the trade search box (the flows' search does not need it), a dropdown opened and closed without a choice, actions repeated after a mistake (keep the last), anything after the outcome.

Then map what is left, in order. These are the patterns of this project's pages; check each against the code (`usedIn` of the reader, then the flow that calls that page operation):

| Recording | Business step | Code |
|---|---|---|
| `/login`: e-mail, password, Sign in | `<role> is logged in to the trade portal` | `flows.auth.login('<role>')`. The role: from the top bar of a screenshot, confirmed by QA; never put the e-mail into code or data |
| `/trades`: search a trade ID, right-click its row | the trade the event works on | `Given a Live '<product>' trade exists in the blotter` = `flows.trades.orCreate(() => flows.tradeProvisioning.provisionLiveTrade(product, data))`. The ID is dropped; the product is read from the blotter screenshot or asked |
| the Cancellation `menuitem`, reason, comments, Confirm & Save | `perform cancellation for the trade from trade portal` | `flows.tradeCancellation.cancelFromTradePortal(tradeId, data)`: `cancelReason`, `cancelComments` (its own confirmation dialog, not the dynamic action dialog) |
| another `menuitem` of the row's action menu, its dialog, Confirm | the event's When | the key of `TradesPage.rowActions` with that element (`lifecycle: true`), opened by `flows.lifecycleEvent.openAction`, and the flow of that event (`framework/flows/trade-<event>.flow.ts`); each typed or chosen value is a case data key of its `...Data` type |
| `/trade/new` | creation | `flows.tradeCreation.create...` with the values as `TradeCreationData` |
| `/trade/<id>` and its buttons | an action on the trade details | `flows.tradeAmendment` and the `TradeDetailPage` tables |
| checker's Approve / Reject | the checker's decision | the approval / reject cases (`tests/trade-approval-reject.spec.ts`) |

## 3. Decide what it is

Compare the steps with the closest existing case: its spec, its flow, and its merged test data (`testdata/common.json` `shared` block -> `defaults` of `testdata/<spec>.json` -> `byProduct.<PRODUCT>`).

| What the recording is | Result |
|---|---|
| **A. The same as an existing case, same data** | No change. Name the case file the PO can replay |
| **B. An existing case with other values** (another reason, comments, counterparty, number of ways, field to amend) | **No new case** (a variation in data is never a case of its own). List the case data the PO changes in the runner for that case, value by value. Only if QA wants it as the new default: change `defaults` (or `byProduct.<PRODUCT>`) of the spec's test data |
| **C. An existing event done another way** (an extra field, another order, another entry point) | A change of the event's flow: a field only some runs have under `ui.onlyWhenFilled` or `ui.onlyWhen`; another entry point as its own flow method. Ask QA first whether it replaces the current way or is a variant |
| **D. An event this project does not have** (a `menuitem` not in `rowActions`, an unknown dialog) | Hand over to the `onboarding-lifecycle-event` skill with its inputs filled in from the recording: entry testid and label, the dialog's fields with testids in order and the values typed, the request from the trace, the outcome from the screenshots |
| **E. Not convertible** | Report it: a second login in one recording (a case logs in once: split it, the other role's part becomes the API `Given`), a new tab or a download, an action whose element has no testid (only a text: QA has to give the testid or the element name), an outcome nobody can see in the screenshots |

A recording can hold several of these (a creation and then an event): treat each part on its own; each is its own case.

**The case file** for A and B is the one of the product the PO worked on: `cases/<spec>/<case ID>.json` with the product in the ID (`TC-TRADE-CANCELLATION-FX_TRF-UI-001.json`). When it is missing, or older than the last change of its spec, QA runs the spec to export it again before the PO uses it; say so, and do not name an older file with another ID.

**The trade**: the recorded trade ID is never used (that trade has been changed by the event). In the runner the PO chooses a new trade (the case creates one) or an existing trade of theirs (they type its ID there).

## 4. Write what is needed

Only for C (and D through the onboarding skill). The project's rules apply as for any case: steps read like the feature lines, flows call only page / component / API operations, locators are `element('<name>')` from `elements/` or `{ testId: '...' }` with the testid the recording shows (never a made-up name), values only in `testdata/`, the product from the loop, one case per product.

The **outcome** (the `Then`): reuse the event's `expect...` methods. A new one needs its text or status from the screenshots, marked "seen in the recording, to confirm" in the report until a run on the real system passes.

## 5. Verify

For B: open the case file named for the PO and check that each value to change is one of its `params` (a value that is not there cannot be changed in the runner: then it is C).

Testids marked "mock testid" in the header of `mock-oreo/server.js` are guesses of the mock: a recording on the real system that shows one confirms (or corrects) it. List them in the report; never confirm one from a recording made on the mock.

For C:
1. `npx tsc -p .`
2. `npx playwright test tests/<spec> --list`
3. A run on the mock when it has the page, on the real system otherwise (at most three runs per case: every run books real trades). The exported case file replaces the old one.

## 6. Report

In the user's language. Actions by their number, values as the reader shows them: no trade ID, e-mail, address or machine name.

1. **What it is**: A to E, in one sentence, and the case it maps to.
2. **Step by step**: recording action numbers -> business step -> flow (existing or new); the dropped actions and why.
3. **For B**: the case file, then two lists: the values the PO changes in the runner (`name: recorded value (now: current value)`), and the values that are already the same. `tradeId` is never in them: say "new trade, or the PO's own existing trade in the runner".
4. **Files** created and changed (none for A and B).
5. **QA has to confirm**: the role of the account, the product, a text or status taken from a screenshot, a testid that is missing, a mock testid the recording confirms or contradicts.
6. **Not convertible** parts, with what would be needed.

## Never

Copy a trade ID, an e-mail, an address, a token or anything from `trace.zip` into the repo or the report; turn clicks into a case one to one; write a case per recording when the data is the only difference; edit `elements/` or `mock-oreo/` by hand; write anything but English in the repo. Commit only files under this project and push as set for it, after scanning the diff for those; never force-push or merge into main without asking.
