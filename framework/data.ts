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
 *   { "defaults": { ...shared by every row of this file... }, "cases": [ { "id": "TC-XXX-001", ... }, ... ] }
 * Each row is completed with "defaults" and then with testdata/common.json (values shared by every file):
 * the row wins over defaults, defaults win over common. "id" is the full case ID, the one in [ ] at the start
 * of the test title.
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

/** The case ID of a test: the [xxx] at the start of its title */
export function caseIdOf(title: string): string | undefined {
  return title.match(/^\s*\[([\w-]+)\]/)?.[1];
}

/** The row of testdata/<name>.json whose id is the given case ID */
export function findCase<T extends object>(name: string, id: string): T & { id: string } {
  const rows = loadCases<T>(name);
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`testdata/${name}.json has no row with "id": "${id}" (it has: ${rows.map((r) => r.id).join(', ')})`);
  return row;
}
