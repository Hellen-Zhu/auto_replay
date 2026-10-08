// 自动 fixture：给每个 test 注入 ui，test 通过后自动导出用例文件到 cases/

import { test as base, expect } from '@playwright/test';
import path from 'path';
import { UI } from './ui';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadConfig } = require('../core/config');

const ROOT = path.resolve(__dirname, '..');
const CASES_DIR = process.env.OREO_CASES_DIR || path.join(ROOT, 'cases');

/** 用例 ID：写在标题里的 @case:xxx 标签，用作导出文件名；没写就用标题 */
function caseIdOf(title: string): string {
  const m = title.match(/@case:([\w-]+)/);
  if (m) return m[1];
  return title.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80);
}

export const test = base.extend<{ ui: UI }>({
  ui: async ({ page }, use, testInfo) => {
    const ui = new UI(page, loadConfig(ROOT));
    await use(ui);

    // 只有通过的 case 才导出，避免把跑了一半的流程交给 PO
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
      console.log(`  ✔ 已导出用例：${path.relative(ROOT, file)}`);
    }
  },
});

export { expect };
