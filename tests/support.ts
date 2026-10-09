// Shared by the specs; not a spec itself.

import fs from 'fs';
import path from 'path';
import { test } from '../framework/fixtures';
import { datFile } from '../framework/products';

/** Skips the case when the product's dat file is not there, and sets the description shown to the PO */
export function prepare(product: string, description: string) {
  test.skip(!fs.existsSync(path.resolve(__dirname, '..', datFile(product))), `${datFile(product)} is missing`);
  test.info().annotations.push({ type: 'description', description });
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
