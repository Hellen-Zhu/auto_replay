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
 * The rows of testdata/<name>.json, one per case:
 *   { "defaults": { ...shared by every row of this file... }, "cases": [ { "id": "my_case", ... }, ... ] }
 * Each row is completed with "defaults" and then with testdata/common.json (values shared by every file):
 * the row wins over defaults, defaults win over common. "id" is the case ID: the spec puts it in [ ] at the start of the title, and it names the exported file.
 */
export function loadCases<T extends object>(name: string): (T & { id: string })[] {
  const label = `testdata/${name}.json`;
  const file = path.join(DIR, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Test data file not found: ${label} (looked in ${DIR})`);
  const doc = readJson(file, label);
  if (!isObject(doc) || !Array.isArray(doc.cases) || !doc.cases.length) throw new Error(`${label} must contain "cases": a list with at least one row`);
  if (doc.defaults !== undefined && !isObject(doc.defaults)) throw new Error(`${label}: "defaults" must be an object`);

  const commonFile = path.join(DIR, 'common.json');
  const common = fs.existsSync(commonFile) ? readJson(commonFile, 'testdata/common.json') : {};
  if (!isObject(common)) throw new Error('testdata/common.json must be an object');

  const seen = new Set<string>();
  return doc.cases.map((row: unknown, i: number) => {
    if (!isObject(row)) throw new Error(`${label}: row ${i + 1} of "cases" must be an object`);
    const { id } = row;
    if (typeof id !== 'string' || !/^[\w-]+$/.test(id)) throw new Error(`${label}: row ${i + 1} needs an "id" made of letters, digits, _ and -`);
    if (seen.has(id)) throw new Error(`${label}: id "${id}" is used by more than one row`);
    seen.add(id);
    return { ...common, ...(doc.defaults as Row | undefined), ...row } as T & { id: string };
  });
}
