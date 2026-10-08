// 操作封装层：每个动作 = 真实执行 + 记录成可回放的步骤。
// test 通过后由 fixture 调用 exportCase() 导出用例文件给 PO 回放。

import { Page, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { Target } from './targets';
// 与运行器共用同一套执行核心
// eslint-disable-next-line @typescript-eslint/no-var-requires
const core = require('../core/actions');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { secretEntries } = require('../core/config');

/** 值可以是普通字符串，也可以引用本地配置：cfg('accounts.maker.email') */
export type Val = string | { cfg: string };
export const cfg = (p: string): Val => ({ cfg: p });

type Step = {
  title?: string;
  action: string;
  target?: Target;
  value?: string;
  saveAs?: string;
  exact?: boolean;
  secret?: boolean;
};

export class UI {
  readonly steps: Step[] = [];
  readonly vars: Record<string, string> = {};
  private pendingTitle?: string;

  constructor(readonly page: Page, readonly config: any) {}

  // ---------- 业务步骤分组 ----------
  async step<R>(title: string, fn: () => Promise<R>): Promise<R> {
    return test.step(title, async () => {
      this.pendingTitle = title;
      try {
        return await fn();
      } finally {
        this.pendingTitle = undefined;
      }
    });
  }

  // ---------- 动作 ----------
  goto(urlPath: string) {
    return this.run({ action: 'goto', value: urlPath });
  }
  fill(target: Target, value: Val, opts: { secret?: boolean } = {}) {
    return this.run({ action: 'fill', target, value: this.toPlaceholder(value), secret: opts.secret });
  }
  click(target: Target) {
    return this.run({ action: 'click', target });
  }
  press(target: Target, key: string) {
    return this.run({ action: 'press', target, value: key });
  }
  /** 读取页面上的动态值（如交易号），后续步骤里出现这个值会自动替换成变量 */
  async read(target: Target, saveAs: string): Promise<string> {
    return this.run({ action: 'read', target, saveAs });
  }
  expectVisible(target: Target) {
    return this.run({ action: 'expectVisible', target });
  }
  expectText(target: Target, value: Val, opts: { exact?: boolean } = {}) {
    return this.run({ action: 'expectText', target, value: this.toPlaceholder(value), exact: opts.exact });
  }
  expectUrl(urlPath: string) {
    return this.run({ action: 'expectUrl', value: urlPath });
  }

  // ---------- 内部 ----------
  private toPlaceholder(v: Val): string {
    return typeof v === 'string' ? v : '${cfg:' + v.cfg + '}';
  }

  private async run(step: Step): Promise<any> {
    // 动态值变量化：比如前面读到交易号 TRD-123，这里用到 TRD-123 就改写成 ${var:tradeId}
    const recorded: Step = this.variabilize(this.stripSecrets(step));
    const title = this.pendingTitle;
    this.pendingTitle = undefined; // 标题只挂在该分组的第一个动作上
    const result = await core.executeStep(this.page, recorded, { config: this.config, vars: this.vars });
    this.steps.push(title ? { title, ...recorded } : recorded);
    return result;
  }

  private variabilize(step: Step): Step {
    const entries = Object.entries(this.vars).filter(([, v]) => v && v.length >= 4);
    if (!entries.length) return step;
    const swap = (s?: string) => {
      if (typeof s !== 'string') return s;
      for (const [name, v] of entries) s = s.split(v).join('${var:' + name + '}');
      return s;
    };
    const target = step.target ? Object.fromEntries(Object.entries(step.target).map(([k, v]) => [k, typeof v === 'string' ? swap(v) : v])) : undefined;
    return { ...step, value: swap(step.value), target: target as Target };
  }

  /** 防呆：如果有人把密码明文写进了测试代码，记录时自动替换成配置引用 */
  private stripSecrets(step: Step): Step {
    if (typeof step.value !== 'string') return step;
    let value = step.value;
    let hit = false;
    for (const [p, secret] of secretEntries(this.config) as [string, string][]) {
      if (value.includes(secret)) {
        value = value.split(secret).join('${cfg:' + p + '}');
        hit = true;
      }
    }
    return hit ? { ...step, value, secret: true } : step;
  }

  exportCase(file: string, meta: { name: string; description?: string; source: string }) {
    const caseDoc = {
      formatVersion: 1,
      name: meta.name,
      description: meta.description ?? '',
      source: meta.source,
      codeVersion: gitVersion(),
      exportedAt: new Date().toISOString(),
      requiredConfig: requiredConfig(this.steps),
      steps: this.steps,
    };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(caseDoc, null, 2), 'utf-8');
  }
}

function gitVersion(): string {
  try {
    return 'git:' + execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'local';
  }
}

/** 列出用例需要的本地配置项，运行器据此提示 PO 补齐 */
function requiredConfig(steps: Step[]): string[] {
  const set = new Set<string>();
  for (const s of steps) {
    for (const m of String(s.value ?? '').matchAll(/\$\{cfg:([^}]+)\}/g)) set.add(m[1]);
  }
  return [...set];
}
