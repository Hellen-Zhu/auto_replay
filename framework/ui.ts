// Action wrapper: every action = real execution + recording as a replayable step.
// After the test passes, the fixture calls exportCase() to export the case file for the PO to replay.

import { Page, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { caseIdOf } from './data';
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
  /** Keeps only the elements that contain this text, e.g. the row of a list that shows a trade ID (after inner, before nth) */
  hasText?: string;
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

/**
 * A request a click is known to trigger and whose answer the step waits for, e.g. a risk calculation. url is matched
 * against the end of the request path. With setting (the name of a local config entry, e.g. 'riskEngine') and mock,
 * the request is answered by mock instead of the system when that entry is 'mock'.
 */
export type AwaitedRequest = { url: string; method?: string; setting?: string; mock?: { status?: number; body: unknown } };

/** One part of a multipart request: a JSON document, or a file shipped with the cases in data/ */
export type ApiPart = { json: unknown } | { file: string };

/**
 * A call to the system's API. path is relative to apiBaseUrl of the local config, never a full address;
 * apiBaseUrl ends with the prefix all requests share (.../api/v1), so a path starts after it: /trades/create.
 * A text anywhere inside headers, body or a JSON part may be a reference: cfg('accounts.maker.email') or a parameter.
 * save names the fields of the JSON response to keep as variables: { createdTradeId: 'data.trade.id' }.
 */
export type ApiCall = {
  method: string;
  path: string;
  headers?: Record<string, Val>;
  /** JSON body; leave it out for a multipart request */
  body?: unknown;
  multipart?: Record<string, ApiPart>;
  save?: Record<string, string>;
  timeout?: number;
};

type Step = {
  title?: string;
  substep?: string;
  action: string;
  target?: Target;
  value?: string;
  saveAs?: string;
  capture?: Capture;
  request?: AwaitedRequest;
  button?: 'right';
  exact?: boolean;
  secret?: boolean;
  // api steps only
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  multipart?: Record<string, ApiPart>;
  save?: Record<string, string>;
  timeout?: number;
};

/** The fields that hold JSON whose texts may contain placeholders: the request of an api step, the request a click waits for */
const API_JSON = ['headers', 'body', 'multipart', 'request'] as const;

export class UI {
  readonly steps: Step[] = [];
  readonly vars: Record<string, string> = {};
  /** Case data handed out by params() so far: name -> value */
  private readonly paramValues: Record<string, string> = {};
  /** Case data the PO has to enter for a run (input()): name -> the value of this run */
  private readonly inputs: Record<string, string> = {};
  private pendingTitle?: string;
  private pendingSubstep?: string;
  private depth = 0;

  constructor(readonly page: Page, readonly config: any, readonly rootDir?: string) {}

  // ---------- Business step grouping ----------
  // Two levels, like a feature step and the snippet behind it: the outermost step (written in the case) is the
  // title, i.e. a row of the report; a step opened inside it (by a flow) is recorded as a substep, shown under
  // that row. A flow step that no case step wraps is itself the title.
  async step<R>(title: string, fn: () => Promise<R>): Promise<R> {
    return test.step(title, async () => {
      const outer = this.depth === 0;
      if (outer) this.pendingTitle = title;
      else this.pendingSubstep = title.replace(/^(Given|When|Then|And|But) /, ''); // the keyword belongs to the case's step
      this.depth++;
      try {
        return await fn();
      } finally {
        this.depth--;
        if (outer) this.pendingTitle = undefined;
        this.pendingSubstep = undefined;
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

  /**
   * Case data that only the person who runs the case knows, e.g. the ID of an existing trade to work on. The value
   * given here is the one of this run; wherever a later step uses it, it is recorded as ${param:name}. The case file
   * gets the name with an empty value, and the runner asks the PO for the value before every run.
   */
  input(name: string, value: string): string {
    this.useParam(name, value);
    if (value.length < 4) throw new Error(`The value of "${name}" is too short to be told apart from other text (at least 4 characters)`);
    this.inputs[name] = value;
    return value;
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
   * Click and wait for the answer of a request the click triggers (e.g. the risk calculation before a confirmation
   * dialog). A trade ID in its url that an earlier step produced is recorded as ${var:name}.
   */
  clickAndAwait(target: TargetIn, request: AwaitedRequest) {
    return this.run({ action: 'click', target: this.toTarget(target), request });
  }
  /** Click with the right mouse button, which opens a context menu such as the action menu of a blotter row */
  rightClick(target: TargetIn) {
    return this.run({ action: 'click', button: 'right', target: this.toTarget(target) });
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
  /**
   * Call the system's API without the page, e.g. to prepare the trade a case works on. Returns the saved variables
   * (name -> value); like a value from read(), a later use of one is recorded as ${var:name}.
   * The request itself is recorded, so the PO's replay sends it again: every replay really creates the data.
   */
  async api(call: ApiCall): Promise<Record<string, string>> {
    if (/^https?:\/\//i.test(call.path)) {
      throw new Error(`An API call takes a path, not a full address (${call.method} ${call.path.replace(/^(https?:\/\/)[^/]+/i, '$1...')}): the address is apiBaseUrl in config.local.json`);
    }
    const json = <T>(v: T): T => mapTexts(v, (s) => s, (ref) => this.toPlaceholder(ref));
    return this.run({
      action: 'api',
      method: call.method.toUpperCase(),
      value: call.path,
      ...(call.headers ? { headers: json(call.headers) as Record<string, string> } : {}),
      ...(call.body !== undefined ? { body: json(call.body) } : {}),
      ...(call.multipart ? { multipart: json(call.multipart) } : {}),
      ...(call.save ? { save: call.save } : {}),
      ...(call.timeout !== undefined ? { timeout: call.timeout } : {}),
    });
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
    // The title and the substep are attached only to the first action of their group
    const group = { ...(this.pendingTitle ? { title: this.pendingTitle } : {}), ...(this.pendingSubstep ? { substep: this.pendingSubstep } : {}) };
    this.pendingTitle = undefined;
    this.pendingSubstep = undefined;
    const result = await core.executeStep(this.page, recorded, { config: this.config, vars: this.vars, params: this.paramValues, rootDir: this.rootDir });
    this.steps.push({ ...group, ...recorded });
    // Show what the step read or received, e.g. the ID of the trade it created: in the console and in Playwright's report.
    // With several workers the lines of different cases are mixed in the console, so each says which case it is from
    const info = test.info();
    const owner = info.config.workers > 1 ? `[${caseIdOf(info.title) || info.title}] ` : '';
    for (const [name, value] of Object.entries(core.savedValues(recorded, result))) {
      console.log(`  ${owner}${name} = ${value}`);
      info.annotations.push({ type: 'value', description: `${name} = ${value}` });
    }
    return result;
  }

  private variabilize(step: Step): Step {
    // A value the PO enters for a run (input()) is case data: it is rewritten in the same way, to ${param:name}
    const entries = [
      ...Object.entries(this.vars).filter(([, v]) => v && v.length >= 4).map(([name, v]) => [v, '${var:' + name + '}']),
      ...Object.entries(this.inputs).map(([name, v]) => [v, '${param:' + name + '}']),
    ];
    if (!entries.length) return step;
    const swap = (s?: string) => {
      if (typeof s !== 'string') return s;
      // Only the literal text is checked: a placeholder that is already there (odd parts of the split) is left alone
      return s.split(/(\$\{(?:var|cfg|param):[^}]+\})/).map((part, i) => {
        if (i % 2) return part;
        for (const [v, placeholder] of entries) part = part.split(v).join(placeholder);
        return part;
      }).join('');
    };
    const target = step.target ? Object.fromEntries(Object.entries(step.target).map(([k, v]) => [k, typeof v === 'string' ? swap(v) : v])) : undefined;
    const out: Step = { ...step, value: swap(step.value), target: target as Target };
    // The request of an api step too, e.g. the task ID an earlier call returned, inside a body
    for (const k of API_JSON) if (step[k] !== undefined) (out as Record<string, unknown>)[k] = mapTexts(step[k], (s) => swap(s) as string);
    return out;
  }

  /** Safety net: if someone hard-codes a password in test code, it is replaced with a config reference when recorded */
  private stripSecrets(step: Step): Step {
    const secrets = secretEntries(this.config) as [string, string][];
    const strip = (s: string) => secrets.reduce((text, [p, secret]) => text.split(secret).join('${cfg:' + p + '}'), s);
    const out: Step = { ...step };
    // The request of an api step: once it is a config reference it is shown by its name, so no mask is needed
    for (const k of API_JSON) if (step[k] !== undefined) (out as Record<string, unknown>)[k] = mapTexts(step[k], strip);
    if (typeof step.value === 'string' && strip(step.value) !== step.value) {
      out.value = strip(step.value);
      out.secret = true;
    }
    return out;
  }

  exportCase(file: string, meta: { name: string; description?: string; source: string }) {
    const params = usedParams(this.steps, this.paramValues);
    const hasParams = Object.keys(params).length > 0;
    // A value the PO enters is written empty: the one of this run (a trade that is used up by now) is of no use
    const asked = Object.keys(params).filter((name) => name in this.inputs);
    for (const name of asked) params[name] = '';
    const caseDoc = {
      // A case is written in the lowest version that can express it, so that an older runner still runs what it can
      // and refuses the rest: 2 adds the params block; 3 adds hasText in a target and button on a click, which a
      // version 2 runner would ignore without a word (any row, a normal click); 4 adds the api action; 5 adds the
      // request a click waits for (an older runner would click and never mock it); 6 adds case data without a value,
      // which the runner asks for (an older runner would run with the empty text, e.g. find any trade's row)
      formatVersion: asked.length ? 6 : this.steps.some((s) => s.request) ? 5 : this.steps.some((s) => s.action === 'api') ? 4 : this.steps.some((s) => s.button || s.target?.hasText) ? 3 : hasParams ? 2 : 1,
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

const isRef = (v: unknown): v is Ref => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length === 1 && (keys[0] === 'cfg' || keys[0] === 'param') && typeof (v as Record<string, unknown>)[keys[0]] === 'string';
};

/** Rewrite every text inside a JSON value. With ref, a reference (cfg(...), a parameter) found there becomes the text ref returns */
function mapTexts<T>(value: T, text: (s: string) => string, ref?: (r: Ref) => string): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return text(v);
    if (ref && isRef(v)) return ref(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/** Every text of the steps that may hold a placeholder: values, the text fields of targets and the request of an api step */
function stepTexts(steps: Step[]): string[] {
  return steps.flatMap((s) => {
    const texts = [s.value, ...Object.values(s.target ?? {})].filter((v) => typeof v === 'string') as string[];
    for (const k of API_JSON) mapTexts(s[k], (t) => (texts.push(t), t));
    return texts;
  });
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
  // An api step is sent to the API's own address, which is local config like the pages' address
  if (steps.some((s) => s.action === 'api')) set.add('apiBaseUrl');
  // Case data may point at local config too
  for (const t of [...stepTexts(steps), ...Object.values(params)]) for (const m of t.matchAll(/\$\{cfg:([^}]+)\}/g)) set.add(m[1]);
  // A request that can be mocked is switched by a local setting, which the runner then shows and lets the PO change
  for (const s of steps) if (s.request?.setting) set.add(s.request.setting);
  return [...set];
}
