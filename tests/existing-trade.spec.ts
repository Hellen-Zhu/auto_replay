import { test } from '../framework/fixtures';
import type {
  NovationInputProfile,
  PartialNovationStart,
  TradeAllocationData,
  TradeAmendmentData,
  TradeCancellationData,
  TradeEarlyTerminationData,
  TradeNovationRemainingData,
  TradePartialNovationRemainingData,
  TradePartialTerminationData,
  TradePortfolioReassignmentData,
  TradeStepOutData,
  TradeStepOutPartialData,
} from '../framework/flows';
import { givenTrade, loggedIn, type GivenTradeData } from './support';

// Every case that goes on with a given trade instead of preparing its own in a Given of its own wording (explicit
// user requirement: the PO has often worked on a trade and wants to continue with it; and all of these cases are in
// this one spec, whatever the event). They are an addition to the cases of the events' own specs, not a replacement.
// Where the trade comes from (givenTrade in support.ts), the first that is there:
//   1. the environment variable OREO_TRADE_ID: always wins;
//   2. "tradeId" in the case's row of testdata/existing-trade.json;
//   3. neither: a new trade is created through the API in the state the case starts from.
// With 1 and 2 the trade ID is case data that is entered for every run: the exported case file holds no ID and the
// PO types one in the runner. With 3 the exported case file creates its own trade on every replay.
// The step after the login checks that the trade is in the state the case starts from, so a wrong trade fails
// there and nothing is done to it.
// On a given trade a case cannot be repeated: a run changes the trade's state. No product in the ID or the title,
// since the trade decides it. The values of an event are those of its own spec: a row of the test data lists the
// event's shared block under "use". Every ID names the action the case performs: the maker's event
// (TC-TRADE-<EVENT>-EXISTING-...) or the checker's decision on a pending new trade
// (TC-TRADE-<APPROVE|REJECT>-CREATION-EXISTING-...). There is no checker case on a pending cancellation or amendment
// (user decision): the checker's approve / reject is the same action whatever is pending, and the creation cases
// cover it. The approval and cancellation cases are this repo's own, the others are the event's case with its Given
// replaced.

// The input profile and the start page of the events' own cases (FX_TRF in the feature's Examples)
const profile: NovationInputProfile = 'WITH_TARGET_AMOUNT';
const from: PartialNovationStart = 'portal';

test.describe('Existing trade', () => {
  test('[TC-TRADE-APPROVE-CREATION-EXISTING-UI-001] Checker approves a given new trade that is pending approval', async ({ Given, When, Then, And, flows, testData }) => {
    const given = givenTrade(flows, testData<GivenTradeData>(), 'pendingApproval', 'Checker approves the new trade with the given ID, which must be pending approval; the trade is live afterwards');

    await Given('checker is logged in to the trade portal', () => loggedIn(flows, 'checker'));
    const tradeId = await And('the given trade is pending approval', () => given.ready());
    await When('approves the pending trade from trade portal', () => flows.tradeApproval.approveFromTradePortal(tradeId));
    await Then('the trade is approved successfully', () => flows.tradeApproval.expectApproved());
    await And('the trade is Live', () => flows.tradeApproval.expectLive(tradeId));
  });

  test('[TC-TRADE-REJECT-CREATION-EXISTING-UI-001] Checker rejects a given new trade that is pending approval', async ({ Given, When, Then, And, flows, testData }) => {
    const given = givenTrade(flows, testData<GivenTradeData>(), 'pendingApproval', 'Checker rejects the new trade with the given ID, which must be pending approval; the trade is a draft afterwards');

    await Given('checker is logged in to the trade portal', () => loggedIn(flows, 'checker'));
    const tradeId = await And('the given trade is pending approval', () => given.ready());
    await When('rejects the pending trade from trade portal', () => flows.tradeApproval.rejectFromTradePortal(tradeId));
    await Then('the trade is rejected successfully', () => flows.tradeApproval.expectRejected());
    await And('the trade is reverted to Draft', () => flows.tradeApproval.expectDraft(tradeId));
  });

  test('[TC-TRADE-CANCELLATION-EXISTING-UI-001] Maker cancels a given Live trade', async ({ Given, When, Then, And, flows, testData }) => {
    const given = givenTrade(flows, testData<TradeCancellationData & GivenTradeData>(), 'live', 'Maker cancels the live trade with the given ID; the cancellation is then pending checker approval');

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    const tradeId = await And('the given trade is Live', () => given.ready());
    await When('perform cancellation for the trade from trade portal', () => flows.tradeCancellation.cancelFromTradePortal(tradeId, given.data));
    await Then('the cancellation is submitted successfully', () => flows.tradeCancellation.expectSubmitted());
    await And('the cancellation request is pending checker approval', () => flows.tradeCancellation.expectPendingCheckerApproval(tradeId));
  });

  test('[TC-TRADE-ALLOCATION-EXISTING-UI-001] Given Live trade splits into sub-trades after allocation', async ({ Given, When, Then, And, flows, testData }) => {
    const given = givenTrade(flows, testData<TradeAllocationData & GivenTradeData>(), 'live', 'Maker allocates the live trade with the given ID to the number of subtrades in the case data (2, 3 or 4) from the trade portal and the trade is Dead');

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    const tradeId = await And('the given trade is Live', () => given.ready());
    await When("perform '${param:allocationWays}' way allocation for the trade", () => flows.tradeAllocation.allocate(tradeId, given.data));
    await Then('the allocation is completed successfully', () => flows.tradeAllocation.expectCompleted(given.data));
    await And('the trade is allocated to Dead in the trade details', () => flows.tradeAllocation.expectAllocatedToDead(tradeId));
  });

  test('[TC-TRADE-AMENDMENT-EXISTING-UI-001] Amendment of a given Live trade is pending checker approval after Maker submits it', async ({ Given, When, Then, And, flows, testData }) => {
    const given = givenTrade(flows, testData<TradeAmendmentData & GivenTradeData>(), 'live', 'Maker changes the field named by the case data amendmentField (Counterparty or Risk Portfolio) of the live trade with the given ID in the trade details; the amendment is then pending checker approval');

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    const tradeId = await And('the given trade is Live', () => given.ready());
    await When("perform amendment for '${param:amendmentField}' on the trade", () => flows.tradeAmendment.amend(tradeId, given.data));
    await Then('the amendment is pending checker approval', () => flows.tradeAmendment.expectPendingCheckerApproval(tradeId));
  });

  test('[TC-TRADE-EARLY-TERMINATION-EXISTING-UI-001] should able to perform EarlyTermination event for a given Live trade successfully', async ({ Given, When, Then, And, flows, testData }) => {
    const given = givenTrade(flows, testData<TradeEarlyTerminationData & GivenTradeData>(), 'live', 'Maker terminates the live trade with the given ID early from the trade portal and the trade is Dead with the event status Terminated');

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    const tradeId = await And('the given trade is Live', () => given.ready());
    await When('perform the Early Termination event on the trade', () => flows.tradeEarlyTermination.terminateEarly(tradeId, given.data));
    await Then('the early termination is completed successfully', () => flows.tradeEarlyTermination.expectCompleted());
    await And('the trade is closed as Terminated', () => flows.tradeEarlyTermination.expectClosedAsTerminated(tradeId));
  });

  test('[TC-TRADE-NOVATION-REMAINING-EXISTING-UI-001] should able to perform Novation Remaining event for a given Live trade successfully', async ({ Given, When, Then, And, flows, testData }) => {
    const given = givenTrade(flows, testData<TradeNovationRemainingData & GivenTradeData>(), 'live', 'Maker novates the remaining live trade with the given ID to another counterparty from the trade portal (input profile with a target amount, as for FX_TRF) and the original trade is Dead with the event status Novated');

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    const tradeId = await And('the given trade is Live', () => given.ready());
    await When(`perform the Novation Remaining event on the trade with '${profile}' input profile`, () => flows.tradeNovationRemaining.novateRemaining(tradeId, profile, given.data));
    await Then('the novation remaining is completed successfully', () => flows.tradeNovationRemaining.expectCompleted());
    await And('the original trade is closed as Novated', () => flows.tradeNovationRemaining.expectOriginalClosedAsNovated(tradeId));
  });

  test('[TC-TRADE-PARTIAL-NOVATION-REMAINING-EXISTING-UI-001] should able to perform Partial Novation event for a given Live trade successfully', async ({ Given, When, Then, And, flows, testData }) => {
    const given = givenTrade(flows, testData<TradePartialNovationRemainingData & GivenTradeData>(), 'live', 'Maker novates a part of the live trade with the given ID to another counterparty from the trade portal; the original trade is Live with the remaining notional and a new Live trade holds the rest for the new counterparty. The notionals, the equation line and the original counterparty in the case data are those of the given trade');

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    const tradeId = await And('the given trade is Live', () => given.ready());
    const newTradeId = await When(`perform the Partial Novation Remaining event on the trade from ${from} page`, () => flows.tradePartialNovationRemaining.novatePartially(tradeId, from, given.data));
    await Then('trade is partially novated with remaining notional retained and counterparty transferred', () => flows.tradePartialNovationRemaining.expectPartiallyNovated(tradeId, newTradeId, given.data));
  });

  test('[TC-TRADE-PARTIAL-TERMINATION-EXISTING-UI-001] Updated trade position is reflected accurately for a given Live trade after maker triggers Partial Termination', async ({ Given, When, Then, And, flows, testData }) => {
    const given = givenTrade(flows, testData<TradePartialTerminationData & GivenTradeData>(), 'live', 'Maker reduces the notional of the live trade with the given ID with a partial termination from the trade portal and the trade details show the new notional, the trade still Live');

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    const tradeId = await And('the given trade is Live', () => given.ready());
    await When('perform Partial Termination event on the trade', () => flows.tradePartialTermination.terminatePartially(tradeId, given.data));
    await Then('the partial termination is completed successfully', () => flows.tradePartialTermination.expectCompleted());
    await And('the trade notional reflects the partial termination reduction in trade detail page', () => flows.tradePartialTermination.expectNotionalReduced(tradeId, given.data));
  });

  test('[TC-TRADE-PORTFOLIO-REASSIGNMENT-EXISTING-UI-001] Updated portfolio is displayed for a given Live trade after maker triggers Portfolio Reassignment', async ({ Given, When, Then, And, flows, testData }) => {
    const given = givenTrade(flows, testData<TradePortfolioReassignmentData & GivenTradeData>(), 'live', 'Maker moves the live trade with the given ID to another portfolio from the trade portal; the trade is still Live with the event status Amended and its trade details show the new portfolio');

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    const tradeId = await And('the given trade is Live', () => given.ready());
    await When('perform Portfolio Reassignment event on the trade', () => flows.tradePortfolioReassignment.reassignPortfolio(tradeId, given.data));
    await Then('the portfolio reassignment is completed successfully', () => flows.tradePortfolioReassignment.expectCompleted());
    await And('the trade remains Live and is marked as Amended', () => flows.tradePortfolioReassignment.expectLiveAndAmended(tradeId));
    await And('the trade details show the updated portfolio assignment', () => flows.tradePortfolioReassignment.expectUpdatedPortfolio(tradeId, given.data));
  });

  test('[TC-TRADE-STEP-OUT-FULL-EXISTING-UI-001] should able to perform Step Out Full event for a given Live trade successfully', async ({ Given, When, Then, And, flows, testData }) => {
    const given = givenTrade(flows, testData<TradeStepOutData & GivenTradeData>(), 'live', 'Maker steps out fully of the live trade with the given ID from the trade portal and the trade is Dead with the event status Novated');

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    const tradeId = await And('the given trade is Live', () => given.ready());
    await When('perform the Step Out Full event on the trade', () => flows.tradeStepOut.stepOutFull(tradeId, given.data));
    await Then('the step out full is completed successfully', () => flows.tradeStepOut.expectFullCompleted());
    await And('the original trade is closed as Novated', () => flows.tradeStepOut.expectClosedAsNovated(tradeId));
  });

  test('[TC-TRADE-STEP-OUT-PARTIAL-EXISTING-UI-001] should able to perform Step Out Partial event for a given Live trade successfully', async ({ Given, When, Then, And, flows, testData }) => {
    const given = givenTrade(flows, testData<TradeStepOutPartialData & GivenTradeData>(), 'live', 'Maker steps out of a part of the live trade with the given ID from the trade portal and the trade is still Live, with the event status Novated');

    await Given('maker is logged in to the trade portal', () => loggedIn(flows, 'maker'));
    const tradeId = await And('the given trade is Live', () => given.ready());
    await When('perform the Step Out Partial event on the trade', () => flows.tradeStepOut.stepOutPartial(tradeId, given.data));
    await Then('the step out partial is completed successfully', () => flows.tradeStepOut.expectPartialCompleted());
    await And('the trade remains Live and is marked as Novated', () => flows.tradeStepOut.expectLiveAndNovated(tradeId));
  });
});
