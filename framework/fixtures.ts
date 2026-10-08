// Auto fixture: injects ui into every test and exports the case file to cases/ once the test passes

import { test as base, expect } from '@playwright/test';
import path from 'path';
import { UI } from './ui';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadConfig } = require('../core/config');

const ROOT = path.resolve(__dirname, '..');
const CASES_DIR = process.env.OREO_CASES_DIR || path.join(ROOT, 'cases');

/** Case ID: the @case:xxx tag in the title, used as the export file name; falls back to the title */
function caseIdOf(title: string): string {
  const m = title.match(/@case:([\w-]+)/);
  if (m) return m[1];
  return title.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80);
}

export const test = base.extend<{ ui: UI }>({
  ui: async ({ page }, use, testInfo) => {
    const ui = new UI(page, loadConfig(ROOT));
    await use(ui);

    // Export only passing cases, so a half-finished flow never reaches the PO
    if (testInfo.status === 'passed') {
      const id = caseIdOf(testInfo.title);
      const name = testInfo.title.replace(/@case:[\w-]+/, '').trim();
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
});

export { expect };
