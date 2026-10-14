// Case data: what a case types or selects (counterparty, portfolio, notional...) lives in testdata/*.json, one row
// per case. config.local.json is only for the environment: server address, accounts, passwords.

import fs from 'fs';
import path from 'path';

const DIR = process.env.OREO_TESTDATA_DIR || path.resolve(__dirname, '..', 'testdata');

type Row = Record<string, unknown>;
const isObject = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);

function readJson(file: string, label: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^﻿/, ''));
  } catch (e) {
    throw new Error(`${label} is not valid JSON: ${(e as Error).message}`);
  }
}

/**
 * The data of one case: testdata/common.json (values shared by every file), then the shared blocks the file
 * lists under "use", then "defaults" of testdata/<name>.json, then the shared blocks the case's own row lists under
 * "use", then the other values of that row, which is the one of "cases" whose "id" is the case ID; a later one wins.
 *   { "use": ["given-trade"], "defaults": { ...shared by every case of this spec... },
 *     "cases": [ { "id": "TC-XXX-001", "use": ["cancellation"], ... }, ... ] }
 * A shared block is an entry of "shared" in testdata/common.json, a flat object of values that several specs need
 * but not all of them, e.g. the trade a lifecycle event starts from; the values of one event are in its own file:
 *   { "counterpartyName": "...", ..., "shared": { "given-trade": { ... } } }
 * "shared" itself is not a value of any case. Everything is optional: a case needs a row only for values that
 * differ from the shared ones, and a spec whose cases all use the common values needs no file.
 */
export function findCase<T extends object>(name: string, id: string): T & { id: string } {
  const commonFile = path.join(DIR, 'common.json');
  const common = fs.existsSync(commonFile) ? readJson(commonFile, 'testdata/common.json') : {};
  if (!isObject(common)) throw new Error('testdata/common.json must be an object');
  const { shared: sharedBlocks = {}, ...commonValues } = common;
  if (!isObject(sharedBlocks)) throw new Error('testdata/common.json: "shared" must be an object of blocks, name -> values');

  const label = `testdata/${name}.json`;
  const file = path.join(DIR, `${name}.json`);
  const doc = fs.existsSync(file) ? readJson(file, label) : {};
  if (!isObject(doc)) throw new Error(`${label} must be an object with "defaults" and / or "cases"`);
  const { use = [], defaults = {}, cases = [] } = doc;
  if (!isObject(defaults)) throw new Error(`${label}: "defaults" must be an object`);
  /** The values of the shared blocks a "use" list names, in its order */
  const blocks = (list: unknown, where: string): Row => {
    if (!Array.isArray(list) || list.some((b) => typeof b !== 'string' || !/^[\w-]+$/.test(b))) throw new Error(`${where}: "use" must be a list of shared block names`);
    const merged: Row = {};
    for (const block of list as string[]) {
      const values = Object.prototype.hasOwnProperty.call(sharedBlocks, block) ? sharedBlocks[block] : undefined;
      if (values === undefined) throw new Error(`${where}: "use" names "${block}", but "shared" of testdata/common.json has no such block`);
      if (!isObject(values)) throw new Error(`testdata/common.json: the shared block "${block}" must be an object`);
      Object.assign(merged, values);
    }
    return merged;
  };
  const shared = blocks(use, label);
  if (!Array.isArray(cases)) throw new Error(`${label}: "cases" must be a list`);

  const seen = new Set<string>();
  let own: Row = {};
  cases.forEach((row: unknown, i: number) => {
    if (!isObject(row)) throw new Error(`${label}: row ${i + 1} of "cases" must be an object`);
    if (typeof row.id !== 'string' || !/^[\w-]+$/.test(row.id)) throw new Error(`${label}: row ${i + 1} needs an "id" made of letters, digits, _ and -`);
    if (seen.has(row.id)) throw new Error(`${label}: id "${row.id}" is used by more than one row`);
    seen.add(row.id);
    if (row.id === id) own = row;
  });
  const { use: ownUse = [], ...ownValues } = own;
  return { ...commonValues, ...shared, ...defaults, ...blocks(ownUse, `${label}, row "${id}"`), ...ownValues, id } as T & { id: string };
}

/** The case ID of a test: the [xxx] at the start of its title */
export function caseIdOf(title: string): string | undefined {
  return title.match(/^\s*\[([\w-]+)\]/)?.[1];
}
