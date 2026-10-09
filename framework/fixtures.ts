// Auto fixtures: inject flows (business steps), app (pages and components) and ui (actions + recording)
// into every test, and export the case file to cases/<spec name>/ once the test passes

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

/**
 * The name of a spec: tests/trade-creation.spec.ts -> trade-creation. One spec covers one lifecycle event, and its
 * name is also the name of its test data file (testdata/trade-creation.json) and of its folder under cases/
 */
const specNameOf = (file: string) => path.basename(file).replace(/\.spec\.[cm]?[jt]s$/, '');

/** Export file name: the case ID in [ ] at the start of the title, or an @case:xxx tag; falls back to the title */
function exportIdOf(title: string): string {
  const id = caseIdOf(title) || title.match(CASE_TAG)?.[1];
  return id || title.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80);
}

/** Returns the data of the running case: the common values and defaults, overridden by its own row if it has one */
export type TestData = <T extends object>() => T & { id: string };

/** A step of the scenario as it is written in the case: await When('maker is logged in ...', () => flows.auth.login('maker')) */
export type BddStep = <R>(text: string, fn: () => Promise<R>) => Promise<R>;
type BddSteps = { Given: BddStep; When: BddStep; Then: BddStep; And: BddStep; But: BddStep };

export const test = base.extend<{ ui: UI; app: App; flows: Flows; testData: TestData } & BddSteps>({
  // The scenario's steps, written in the case like the lines of a feature file. The step returns what fn returns.
  // Capitalized on purpose, like the methods of UI
  Given: async ({ ui }, use) => use((text, fn) => ui.Given(text, fn)),
  When: async ({ ui }, use) => use((text, fn) => ui.When(text, fn)),
  Then: async ({ ui }, use) => use((text, fn) => ui.Then(text, fn)),
  And: async ({ ui }, use) => use((text, fn) => ui.And(text, fn)),
  But: async ({ ui }, use) => use((text, fn) => ui.But(text, fn)),

  // Case data, matched at run time by the case ID: the [xxx] at the start of the title is looked up as "id" in
  // testdata/<spec file name>.json (tests/trade-creation.spec.ts -> testdata/trade-creation.json). A case
  // without a row there gets the shared values only
  testData: async ({}, use, testInfo) => {
    await use(<T extends object>() => {
      const id = caseIdOf(testInfo.title);
      if (!id) throw new Error(`The test title must start with its case ID in [ ] to use test data: "${testInfo.title}"`);
      return findCase<T>(specNameOf(testInfo.file), id);
    });
  },


  ui: async ({ page }, use, testInfo) => {
    const ui = new UI(page, loadConfig(ROOT), ROOT);
    await use(ui);

    // Export only passing cases, so a half-finished flow never reaches the PO. The cases of a spec share a folder,
    // so that the hundreds of cases of all events and products stay easy to find, for QA and in the runner's menu
    if (testInfo.status === 'passed') {
      const id = exportIdOf(testInfo.title);
      const name = testInfo.title.replace(CASE_TAG, '').trim();
      const file = path.join(CASES_DIR, specNameOf(testInfo.file), `${id}.json`);
      ui.exportCase(file, {
        name,
        description: testInfo.annotations.find((a) => a.type === 'description')?.description,
        source: `${path.relative(ROOT, testInfo.file).replace(/\\/g, '/')} › ${testInfo.title}`,
      });
      const shown = path.relative(ROOT, file).replace(/\\/g, '/');
      testInfo.annotations.push({ type: 'exported-case', description: shown });
      console.log(`  ✔ Exported case: ${shown}`);
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
