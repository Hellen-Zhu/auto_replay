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

/**
 * What a case that creates its trade for a product chosen in the case data has on top of its other data. byProduct
 * holds the values that differ for a product (a notional that follows from its dat file, say): when the case runs for
 * that product they replace the shared ones
 */
export type ProductData = { product: string; datFile?: string; byProduct?: Record<string, Record<string, unknown>> };

/**
 * The tag that tells apart the runs of one case for each product: "[TC-...] <title> @product:FX_TRF". It is not part
 * of the exported case's name, and a run for one product is chosen with --grep @product:FX_TRF
 */
export const productTag = (product: string) => `@product:${product}`;

/**
 * For a case that is the same for every product: the product is case data ("product" of its test data, with
 * "datFile", the file of testdata/dat/<product>/ the trade is created from), so the PO can run the case for another product
 * or another variant of the product's structure by changing them before the run. Skips the case while the dat file
 * is missing and sets the description; returns the product for the step lines and the flows, and the rest of the
 * data (the dat file included, which the flows read from it).
 */
export function givenProduct<T extends ProductData>(flows: Flows, row: T, description: string, forProduct?: string) {
  const { product: dataProduct, byProduct, ...rest } = row;
  // A case that QA runs for every product of a lifecycle event (forProduct, from the spec's loop): one case file per
  // event, so only the run for the product of the test data exports it; the others create their trades and check
  // the event for their product. Another product sends its own default dat file
  const product = forProduct || dataProduct;
  const data = { ...rest } as Omit<T, 'product' | 'byProduct'> & { datFile?: string };
  if (product !== dataProduct) {
    delete data.datFile;
    test.info().annotations.push({ type: 'no-export', description: `the case file is exported from the run for ${dataProduct}` });
  }
  Object.assign(data, byProduct?.[product]);
  prepare(product, description, data.datFile);
  return { product: flows.tradeCreation.productAsCaseData(product), data };
}

/** What the test data of a case whose Given trade may also be an existing one holds: "" or the ID of a trade */
export type GivenTradeData = { tradeId?: string };

/**
 * Makes "tradeId" optional case data of a case whose Given creates its trade through the API (explicit user
 * requirement: no separate cases on an existing trade; every such case can also work on a trade that is already in
 * the system). Its value, the first that is there:
 *   1. the environment variable OREO_TRADE_ID: the ID of a trade in the system, for this run (it applies to every
 *      case of the run: set it for one case at a time);
 *   2. "tradeId" in the case's test data ("" in the committed files: never commit a real trade ID);
 *   3. neither: empty, and the Given creates a new trade (flows.trades.orCreate).
 * The exported case file always has "tradeId" empty and holds the steps that create the trade, which run only while
 * it is empty: the PO enters an ID in the runner to work on that trade, or leaves it empty to get a new one.
 * Nothing checks that a given trade is in the state the case starts from: a wrong trade fails at the first step
 * that needs that state.
 */
export function givenTrade(flows: Flows, row: GivenTradeData) {
  flows.trades.givenTrade((process.env.OREO_TRADE_ID || '').trim() || (row.tradeId || '').trim());
}
