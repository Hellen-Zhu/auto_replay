// Shared by the specs; not a spec itself.

import fs from 'fs';
import path from 'path';
import { test } from '../framework/fixtures';
import type { Flows, TradeProvisioningData } from '../framework/flows';
import { datFile } from '../framework/products';

/**
 * Skips the case when the dat file it creates its trade from is not there (the product's default one, or the one
 * the case data names), and sets the description shown to the PO
 */
export function prepare(product: string, description: string, file?: string) {
  const dat = datFile(product, file);
  test.skip(!fs.existsSync(path.resolve(__dirname, '..', dat)), `${dat} is missing`);
  test.info().annotations.push({ type: 'description', description });
}

/** What a case that creates its trade for a product chosen in the case data has on top of its other data */
export type ProductData = { product: string; datFile?: string };

/**
 * For a case that is the same for every product: the product is case data ("product" of its test data, with
 * "datFile", the file of testdata/dat/<product>/ the trade is created from), so the PO can run the case for another product
 * or another variant of the product's structure by changing them before the run. Skips the case while the dat file
 * is missing and sets the description; returns the product for the step lines and the flows, and the rest of the
 * data (the dat file included, which the flows read from it).
 */
export function givenProduct<T extends ProductData>(flows: Flows, row: T, description: string) {
  const { product, ...data } = row;
  prepare(product, description, row.datFile);
  return { product: flows.tradeCreation.productAsCaseData(product), data };
}

/** The state a case on an existing trade starts from */
export type TradeState = 'pendingApproval' | 'live' | 'pendingCancellation' | 'pendingAmendment';

/** What the test data of a case on an existing trade may hold on top of the event's values */
export type GivenTradeData = Partial<ProductData> & { tradeId?: string };

/** How a new trade in that state is created through the API; a state without an entry needs the ID of a trade */
const PROVISION: Partial<Record<TradeState, (flows: Flows, product: string, data: TradeProvisioningData) => Promise<string>>> = {
  pendingApproval: (flows, product, data) => flows.tradeProvisioning.provisionPendingTrade(product, data),
  live: (flows, product, data) => flows.tradeProvisioning.provisionLiveTrade(product, data),
};

/** The check that the trade is in that state, in the trade portal */
const CHECK: Record<TradeState, (flows: Flows, tradeId: string) => Promise<void>> = {
  pendingApproval: (flows, tradeId) => flows.trades.expectPendingApproval(tradeId),
  live: (flows, tradeId) => flows.trades.expectLive(tradeId),
  pendingCancellation: (flows, tradeId) => flows.tradeCancellation.expectPendingCheckerApproval(tradeId),
  pendingAmendment: (flows, tradeId) => flows.tradeAmendment.expectPendingCheckerApproval(tradeId),
};

/**
 * The trade a case on an existing trade works on: case data "tradeId". Its value, the first that is there:
 *   1. the environment variable OREO_TRADE_ID: the ID of a trade in the system, for this run;
 *   2. "tradeId" in the case's test data ("" in the committed files: never commit a real trade ID);
 *   3. neither: empty, and the case creates a new trade through the API in the state it starts from, like the
 *      Given of the event's own case (product, dat file and trade type of the shared block "given-trade").
 * The exported case file always has "tradeId" empty and holds the steps that create the trade, which run only while
 * it is empty: the PO enters an ID in the runner to work on that trade, or leaves it empty to get a new one.
 * A state no API request is known for (a pending cancellation, a pending amendment) cannot be created: there the ID
 * is needed, the case is skipped without one and its case file asks the PO for it on every run. A case that may
 * create its trade is skipped while the dat file is missing, also with an ID, since its case file names that file.
 * Sets the description shown to the PO. Returns the rest of the data for the flows, and "ready", which the case
 * calls in its step after the login: it creates the trade when there is none, checks that the trade is in the
 * state the case starts from (a wrong trade fails there and nothing is done to it) and returns the trade ID.
 */
export function givenTrade<T extends GivenTradeData>(flows: Flows, row: T, state: TradeState, description: string) {
  const { tradeId: fromData, ...data } = row;
  const given = (process.env.OREO_TRADE_ID || '').trim() || (fromData || '').trim();
  const ready = (tradeId: string | (() => Promise<string>)) => async () => {
    const id = typeof tradeId === 'string' ? tradeId : await tradeId();
    await CHECK[state](flows, id);
    return id;
  };

  const provision = PROVISION[state];
  if (!provision) {
    // the ID is needed for every run: the case file asks the PO for it
    test.skip(!given, 'No trade ID is given (OREO_TRADE_ID, or "tradeId" in the test data) and a trade in the state this case starts from cannot be created through the API');
    test.info().annotations.push({ type: 'description', description });
    return { data, ready: ready(flows.trades.existingTrade(given)) };
  }
  if (!data.product) throw new Error('A case that creates its trade needs "product" in its test data: list the shared block "given-trade" under "use"');
  // the case file holds the steps that create the trade too: its dat file is needed whether this run creates one or not
  prepare(data.product, description, data.datFile);
  flows.trades.givenTrade(given);
  const product = flows.tradeCreation.productAsCaseData(data.product);
  return { data, ready: ready(() => flows.trades.orCreate(() => provision(flows, product, data as unknown as TradeProvisioningData))) };
}

/**
 * Logs in and waits for the Trades page. A case on an existing trade checks the trade's state next, which opens the
 * trade portal by its address: without the wait that would race the login.
 */
export async function loggedIn(flows: Flows, role: 'maker' | 'checker') {
  await flows.auth.login(role);
  await flows.trades.expectOnTradesPage('And');
}
