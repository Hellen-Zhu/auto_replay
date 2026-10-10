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
 * lists under "use", then "defaults" of testdata/<name>.json, then the row of its "cases" whose "id" is the case
 * ID; a later one wins.
 *   { "use": ["given-trade"], "defaults": { ...shared by every case of this spec... }, "cases": [ { "id": "TC-XXX-001", ... }, ... ] }
 * A shared block is testdata/shared/<block>.json, a flat object like common.json: values that several specs need
 * but not all of them, e.g. the trade a lifecycle event starts from. Everything is optional: a case needs a row
 * only for values that differ from the shared ones, and a spec whose cases all use the common values needs no file.
 */
export function findCase<T extends object>(name: string, id: string): T & { id: string } {
  const commonFile = path.join(DIR, 'common.json');
  const common = fs.existsSync(commonFile) ? readJson(commonFile, 'testdata/common.json') : {};
  if (!isObject(common)) throw new Error('testdata/common.json must be an object');

  const label = `testdata/${name}.json`;
  const file = path.join(DIR, `${name}.json`);
  const doc = fs.existsSync(file) ? readJson(file, label) : {};
  if (!isObject(doc)) throw new Error(`${label} must be an object with "defaults" and / or "cases"`);
  const { use = [], defaults = {}, cases = [] } = doc;
  if (!Array.isArray(use) || use.some((b) => typeof b !== 'string' || !/^[\w-]+$/.test(b))) throw new Error(`${label}: "use" must be a list of shared block names`);
  if (!isObject(defaults)) throw new Error(`${label}: "defaults" must be an object`);
  const shared: Row = {};
  for (const block of use as string[]) {
    const blockLabel = `testdata/shared/${block}.json`;
    const blockFile = path.join(DIR, 'shared', `${block}.json`);
    if (!fs.existsSync(blockFile)) throw new Error(`${label}: "use" names "${block}", but ${blockLabel} does not exist`);
    const values = readJson(blockFile, blockLabel);
    if (!isObject(values)) throw new Error(`${blockLabel} must be an object`);
    Object.assign(shared, values);
  }
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
  return { ...common, ...shared, ...defaults, ...own, id } as T & { id: string };
}

/** The case ID of a test: the [xxx] at the start of its title */
export function caseIdOf(title: string): string | undefined {
  return title.match(/^\s*\[([\w-]+)\]/)?.[1];
}
