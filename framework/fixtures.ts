// Auto fixtures: inject flows (business steps), app (pages and components) and ui (actions + recording)
// into every test, and export the case file to cases/ once the test passes

import { test as base, expect } from '@playwright/test';
import path from 'path';
import { UI } from './ui';
import { App } from './app';
import { Flows } from './flows';
import { caseIdOf, findCase } from './data';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadConfig } = require('../core/config');

const ROOT = path.resolve(__dirname, '..');
const CASES_DIR = process.env.OREO_CASES_DIR || path.join(ROOT, 'cases');

const CASE_TAG = /@case:([\w-]+)/;

/** Export file name: the case ID in [ ] at the start of the title, or an @case:xxx tag; falls back to the title */
function exportIdOf(title: string): string {
  const id = caseIdOf(title) || title.match(CASE_TAG)?.[1];
  return id || title.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80);
}

/** Returns the data of the running case: its row in testdata/, with defaults and common values filled in */
export type TestData = <T extends object>() => T & { id: string };

export const test = base.extend<{ ui: UI; app: App; flows: Flows; testData: TestData }>({
  // Case data, matched at run time by the case ID: the [xxx] at the start of the title is looked up as "id" in
  // testdata/<spec file name>.json (tests/trade-creation.spec.ts -> testdata/trade-creation.json)
  testData: async ({}, use, testInfo) => {
    await use(<T extends object>() => {
      const id = caseIdOf(testInfo.title);
      if (!id) throw new Error(`The test title must start with its case ID in [ ] to use test data: "${testInfo.title}"`);
      return findCase<T>(path.basename(testInfo.file).replace(/\.spec\.[cm]?[jt]s$/, ''), id);
    });
  },


  ui: async ({ page }, use, testInfo) => {
    const ui = new UI(page, loadConfig(ROOT), ROOT);
    await use(ui);

    // Export only passing cases, so a half-finished flow never reaches the PO
    if (testInfo.status === 'passed') {
      const id = exportIdOf(testInfo.title);
      const name = testInfo.title.replace(CASE_TAG, '').trim();
      const file = path.join(CASES_DIR, `${id}.json`);
      ui.exportCase(file, {
        name,
        description: testInfo.annotations.find((a) => a.type === 'description')?.description,
        source: `${path.relative(ROOT, testInfo.file).replace(/\\/g, '/')} › ${testInfo.title}`,
      });
      testInfo.annotations.push({ type: 'exported-case', description: path.relative(ROOT, file) });
      console.log(`  ✔ Exported case: ${path.relative(ROOT, file)}`);
    }
  },

  // Pages and components, all acting through the same ui
  app: async ({ ui }, use) => {
    await use(new App(ui));
  },

  // Business steps; this is what a case normally uses
  flows: async ({ app }, use) => {
    await use(new Flows(app));
  },
});

export { expect };
