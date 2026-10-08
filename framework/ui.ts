// Action wrapper: every action = real execution + recording as a replayable step.
// After the test passes, the fixture calls exportCase() to export the case file for the PO to replay.

import { Page, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { Target } from './targets';
// Shares the same execution core as the runner
// eslint-disable-next-line @typescript-eslint/no-var-requires
const core = require('../core/actions');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { secretEntries } = require('../core/config');

/** A value is either a plain string or a reference to local config: cfg('accounts.maker.email') */
export type Val = string | { cfg: string };
export const cfg = (p: string): Val => ({ cfg: p });

/** Like Target, but text fields may also reference local config, e.g. { role: 'option', name: cfg('tradeData.direction') } */
export type TargetIn = { [K in keyof Target]: Target[K] | (Target[K] extends string | undefined ? { cfg: string } : never) };

/** Read a value from the response a click triggers; url is matched against the end of the request path */
export type Capture = { url: string; method?: string; field: string; saveAs: string };

type Step = {
  title?: string;
  action: string;
  target?: Target;
  value?: string;
  saveAs?: string;
  capture?: Capture;
  exact?: boolean;
  secret?: boolean;
};

export class UI {
  readonly steps: Step[] = [];
  readonly vars: Record<string, string> = {};
  private pendingTitle?: string;

  constructor(readonly page: Page, readonly config: any, readonly rootDir?: string) {}

  // ---------- Business step grouping ----------
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

  // BDD-style groups: the keyword becomes part of the title, so logs and the PO's report read as
  // Given / When / Then. Capitalized on purpose: a lowercase `then` method would make UI a thenable.
  Given<R>(text: string, fn: () => Promise<R>) { return this.step(`Given ${text}`, fn); }
  When<R>(text: string, fn: () => Promise<R>) { return this.step(`When ${text}`, fn); }
  Then<R>(text: string, fn: () => Promise<R>) { return this.step(`Then ${text}`, fn); }
  And<R>(text: string, fn: () => Promise<R>) { return this.step(`And ${text}`, fn); }
  But<R>(text: string, fn: () => Promise<R>) { return this.step(`But ${text}`, fn); }

  // ---------- Actions ----------
  goto(urlPath: string) {
    return this.run({ action: 'goto', value: urlPath });
  }
  fill(target: TargetIn, value: Val, opts: { secret?: boolean } = {}) {
    return this.run({ action: 'fill', target: this.toTarget(target), value: this.toPlaceholder(value), secret: opts.secret });
  }
  click(target: TargetIn) {
    return this.run({ action: 'click', target: this.toTarget(target) });
  }
  /**
   * Click and capture a value from the response the click triggers (e.g. the ID of a trade that was just created).
   * Like read(), the value becomes a variable: later steps that use it are recorded as ${var:saveAs}.
   */
  async clickAndCapture(target: TargetIn, capture: Capture): Promise<string> {
    return this.run({ action: 'click', target: this.toTarget(target), capture });
  }
  /** Upload a file shipped with the cases; file is relative to the project root and must be inside data/, e.g. 'data/FX_TRF.dat' */
  upload(target: TargetIn, file: string) {
    return this.run({ action: 'upload', target: this.toTarget(target), value: file.replace(/\\/g, '/') });
  }
  press(target: TargetIn, key: string) {
    return this.run({ action: 'press', target: this.toTarget(target), value: key });
  }
  /** Read a dynamic value from the page (e.g. a trade ID); later steps that use the value get it replaced with a variable automatically */
  async read(target: TargetIn, saveAs: string): Promise<string> {
    return this.run({ action: 'read', target: this.toTarget(target), saveAs });
  }
  expectVisible(target: TargetIn) {
    return this.run({ action: 'expectVisible', target: this.toTarget(target) });
  }
  expectText(target: TargetIn, value: Val, opts: { exact?: boolean } = {}) {
    return this.run({ action: 'expectText', target: this.toTarget(target), value: this.toPlaceholder(value), exact: opts.exact });
  }
  expectUrl(urlPath: string) {
    return this.run({ action: 'expectUrl', value: urlPath });
  }

  // ---------- Internals ----------
  private toPlaceholder(v: Val): string {
    return typeof v === 'string' ? v : '${cfg:' + v.cfg + '}';
  }

  private toTarget(t: TargetIn): Target {
    return Object.fromEntries(
      Object.entries(t).map(([k, v]) => [k, v && typeof v === 'object' ? this.toPlaceholder(v as Val) : v]),
    ) as Target;
  }

  private async run(step: Step): Promise<any> {
    // Turn dynamic values into variables: if trade ID TRD-123 was read earlier, a later TRD-123 is rewritten to ${var:tradeId}
    const recorded: Step = this.variabilize(this.stripSecrets(step));
    const title = this.pendingTitle;
    this.pendingTitle = undefined; // the title is attached only to the first action of the group
    const result = await core.executeStep(this.page, recorded, { config: this.config, vars: this.vars, rootDir: this.rootDir });
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

  /** Safety net: if someone hard-codes a password in test code, it is replaced with a config reference when recorded */
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

/** List the local config entries a case needs; the runner uses this to prompt the PO for missing ones */
function requiredConfig(steps: Step[]): string[] {
  const set = new Set<string>();
  for (const s of steps) {
    const texts = [s.value, ...Object.values(s.target ?? {})].filter((v) => typeof v === 'string') as string[];
    for (const t of texts) for (const m of t.matchAll(/\$\{cfg:([^}]+)\}/g)) set.add(m[1]);
  }
  return [...set];
}
