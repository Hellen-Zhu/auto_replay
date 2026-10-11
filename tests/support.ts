// Shared by the specs; not a spec itself.

import fs from 'fs';
import path from 'path';
import { test } from '../framework/fixtures';
import type { Flows } from '../framework/flows';
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
 * "datFile", the file of data/<product>/ the trade is created from), so the PO can run the case for another product
 * or another variant of the product's structure by changing them before the run. Skips the case while the dat file
 * is missing and sets the description; returns the product for the step lines and the flows, and the rest of the
 * data (the dat file included, which the flows read from it).
 */
export function givenProduct<T extends ProductData>(flows: Flows, row: T, description: string) {
  const { product, ...data } = row;
  prepare(product, description, row.datFile);
  return { product: flows.tradeCreation.productAsCaseData(product), data };
}

/**
 * The ID of the existing trade a case works on. It is not test data of the repo: QA gives it for a run in the
 * environment variable OREO_TRADE_ID, and the PO types it in the runner. Without it the case is skipped.
 */
export function givenTradeId(description: string): string {
  const tradeId = (process.env.OREO_TRADE_ID || '').trim();
  test.skip(!tradeId, 'OREO_TRADE_ID is not set: the ID of an existing trade in the state the case starts from');
  test.info().annotations.push({ type: 'description', description });
  return tradeId;
}

/**
 * Logs in and waits for the Trades page. A case on an existing trade checks the trade's state next, which opens the
 * trade portal by its address: without the wait that would race the login.
 */
export async function loggedIn(flows: Flows, role: 'maker' | 'checker') {
  await flows.auth.login(role);
  await flows.trades.expectOnTradesPage('And');
}
