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
