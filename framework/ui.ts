// Action wrapper: every action = real execution + recording as a replayable step.
// After the test passes, the fixture calls exportCase() to export the case file for the PO to replay.

import { Page, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
// Shares the same execution core as the runner
// eslint-disable-next-line @typescript-eslint/no-var-requires
const core = require('../core/actions');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { secretEntries } = require('../core/config');

/**
 * How an element is found. data-testid is preferred. OREO inputs are web components (sc-text-input) whose real
 * <input> sits in the shadow DOM, so inner: 'input' locates one level further inside the host element.
 * Targets are declared in the page object that owns the element (framework/pages), not in tests.
 */
export type Target = {
  testId?: string;
  role?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  text?: string;
  css?: string;
  inner?: string;
  nth?: number;
  exact?: boolean;
};

/** A reference instead of a literal value: local config - cfg('accounts.maker.email') - or case data from ui.params() */
type Ref = { cfg: string } | { param: string };
export type Val = string | Ref;
export const cfg = (p: string): Val => ({ cfg: p });

/**
 * The parameters of a case: one per field of its data. Used as a value, a parameter is recorded as ${param:name}
 * and its value goes into the params block of the case file, where the PO can see it and change it for a run.
 */
export type Params<T> = { readonly [K in keyof T]-?: Val };

/** Like Target, but text fields may also be a reference, e.g. { role: 'menuitem', name: p.direction } */
export type TargetIn = { [K in keyof Target]: Target[K] | (Target[K] extends string | undefined ? Ref : never) };

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
  /** Case data handed out by params() so far: name -> value */
  private readonly paramValues: Record<string, string> = {};
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

  // ---------- Case data ----------
  /**
   * Case data as parameters: with p = ui.params(data), p.counterpartyName is recorded as ${param:counterpartyName}
   * instead of its value. Read a field from data directly when it decides what the scenario does (which product,
   * which variant): it is then recorded as it is, and the PO cannot change it.
   */
  params<T extends object>(data: T): Params<T> {
    return new Proxy({}, {
      get: (_, name) => {
        if (typeof name !== 'string' || name === 'then' || name === 'toJSON') return undefined;
        return { param: this.useParam(name, (data as Record<string, unknown>)[name]) };
      },
    }) as Params<T>;
  }

  private useParam(name: string, raw: unknown): string {
    if (!/^[\w-]+$/.test(name)) throw new Error(`Test data name "${name}" may only contain letters, digits, _ and -`);
    if (raw === undefined || raw === null || raw === '') {
      throw new Error(`Test data "${name}" is not set: add it to the case's row or to "defaults" in its testdata file`);
    }
    if (typeof raw === 'object') throw new Error(`Test data "${name}" is a list or an object; a parameter must be text, a number or true / false`);
    const value = String(raw);
    for (const [p, secret] of secretEntries(this.config) as [string, string][]) {
      if (value.includes(secret)) throw new Error(`Test data "${name}" contains the value of ${p}; passwords stay in config.local.json, use cfg('${p}')`);
    }
    const known = this.paramValues[name];
    if (known !== undefined && known !== value) {
      throw new Error(`Test data "${name}" has two different values in one case ("${known}" and "${value}"); give them different names`);
    }
    this.paramValues[name] = value;
    return name;
  }

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
    if (typeof v === 'string') return v;
    return 'cfg' in v ? '${cfg:' + v.cfg + '}' : '${param:' + v.param + '}';
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
    const result = await core.executeStep(this.page, recorded, { config: this.config, vars: this.vars, params: this.paramValues, rootDir: this.rootDir });
    this.steps.push(title ? { title, ...recorded } : recorded);
    return result;
  }

  private variabilize(step: Step): Step {
    const entries = Object.entries(this.vars).filter(([, v]) => v && v.length >= 4);
    if (!entries.length) return step;
    const swap = (s?: string) => {
      if (typeof s !== 'string') return s;
      // Only the literal text is checked: a placeholder that is already there (odd parts of the split) is left alone
      return s.split(/(\$\{(?:var|cfg|param):[^}]+\})/).map((part, i) => {
        if (i % 2) return part;
        for (const [name, v] of entries) part = part.split(v).join('${var:' + name + '}');
        return part;
      }).join('');
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
    const params = usedParams(this.steps, this.paramValues);
    const hasParams = Object.keys(params).length > 0;
    const caseDoc = {
      // Version 2 adds the params block. A case without case data is still version 1, which older runners can run too.
      formatVersion: hasParams ? 2 : 1,
      name: meta.name,
      description: meta.description ?? '',
      source: meta.source,
      codeVersion: gitVersion(),
      exportedAt: new Date().toISOString(),
      requiredConfig: requiredConfig(this.steps, params),
      ...(hasParams ? { params } : {}),
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

/** Every text of the steps that may hold a placeholder: values and the text fields of targets */
function stepTexts(steps: Step[]): string[] {
  return steps.flatMap((s) => [s.value, ...Object.values(s.target ?? {})].filter((v) => typeof v === 'string') as string[]);
}

/** The case data the steps really use, in the order of first use; this becomes the params block of the case file */
function usedParams(steps: Step[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of stepTexts(steps)) for (const m of t.matchAll(/\$\{param:([^}]+)\}/g)) out[m[1]] = values[m[1]];
  return out;
}

/** List the local config entries a case needs; the runner uses this to prompt the PO for missing ones */
function requiredConfig(steps: Step[], params: Record<string, string>): string[] {
  const set = new Set<string>();
  // Case data may point at local config too
  for (const t of [...stepTexts(steps), ...Object.values(params)]) for (const m of t.matchAll(/\$\{cfg:([^}]+)\}/g)) set.add(m[1]);
  return [...set];
}
