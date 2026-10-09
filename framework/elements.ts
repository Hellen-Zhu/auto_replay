// Element locators, shared with the Java + Cucumber E2E project so that each one is maintained in one place only.
// elements/ is a copy of that project's src/test/resources/elements (pages/ and components/): it is refreshed with
// `npm run sync:elements` and never edited here. Every file is a list of
//   { "name": "new_trade.book_btn", "lookupDetails": { "findBy": "testId", "value": "create-trade-book-btn" } }
// and a page object or component refers to an element by that name: element('new_trade.book_btn').

import fs from 'fs';
import path from 'path';
import type { Target } from './ui';

const DIR = process.env.OREO_ELEMENTS_DIR || path.resolve(__dirname, '..', 'elements');

/**
 * The real control of a text web component (sc-text-input): an <input> or a <textarea> in its shadow root. The element
 * files locate the host, and a fill on the host fails ("Element is not an <input>, <textarea> ..."), so a text field
 * is looked up with { inner: INNER_INPUT }. It is the locator the E2E project's "type value ... into ..." step fills.
 */
export const INNER_INPUT = "input[part='input'], textarea[part='input']";

/** How a findBy of the element files becomes a Target. The E2E project uses testId; another kind is one more line */
const FIND_BY: Record<string, (value: string) => Target> = {
  testId: (value) => ({ testId: value }),
};

type Definition = { file: string; findBy: unknown; value: unknown };

let definitions: Map<string, Definition[]> | undefined;

function load(): Map<string, Definition[]> {
  if (!fs.existsSync(DIR)) throw new Error(`The element files are missing: ${DIR}`);
  const found = new Map<string, Definition[]>();
  const read = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) read(file);
      else if (entry.name.endsWith('.json')) readFile(file, found);
    }
  };
  read(DIR);
  return found;
}

function readFile(file: string, found: Map<string, Definition[]>) {
  const label = path.relative(DIR, file).replace(/\\/g, '/');
  let list: unknown;
  try {
    list = JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new Error(`Element file ${label} is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(list)) throw new Error(`Element file ${label} must be a list of { name, lookupDetails }`);
  for (const item of list) {
    if (!item || typeof item.name !== 'string') continue;
    const definition = { file: label, findBy: item.lookupDetails?.findBy, value: item.lookupDetails?.value };
    found.set(item.name, [...(found.get(item.name) || []), definition]);
  }
}

/**
 * The locator of an element of the E2E project, by its name. The element files only know the host of a control, so
 * what is specific to how this project operates it is added here: element('new_trade.portfolio_select', { inner: 'input' })
 */
export function element(name: string, extra: Pick<Target, 'inner' | 'nth' | 'exact'> = {}): Target {
  definitions ??= load();
  const [definition, ...others] = definitions.get(name) || [];
  if (!definition) throw new Error(unknownElement(name, definitions));

  const other = others.find((o) => o.findBy !== definition.findBy || o.value !== definition.value);
  if (other) throw new Error(`Element "${name}" is defined differently in ${definition.file} and ${other.file}`);

  const { findBy, value, file } = definition;
  if (typeof findBy !== 'string' || !Object.hasOwn(FIND_BY, findBy)) {
    throw new Error(`Element "${name}" (${file}) is found by "${findBy}", which is not supported yet: add it to FIND_BY in framework/elements.ts`);
  }
  if (typeof value !== 'string' || !value) throw new Error(`Element "${name}" (${file}) has no lookupDetails.value`);
  return { ...FIND_BY[findBy](value), ...extra };
}

/** A wrong name is usually a typo: show the elements of the same page or component */
function unknownElement(name: string, all: Map<string, Definition[]>): string {
  const group = name.split('.')[0];
  const siblings = [...all.keys()].filter((key) => key.startsWith(`${group}.`)).sort();
  const hint = siblings.length ? `The elements of "${group}" are: ${siblings.join(', ')}` : `No element starts with "${group}."`;
  return `Unknown element "${name}". ${hint}. The element files are in ${DIR}; refresh them from the E2E project with: npm run sync:elements`;
}
