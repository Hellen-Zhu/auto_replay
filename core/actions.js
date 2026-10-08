// Shared execution core: QA running a case locally and the PO replaying a case file both go through
// this same logic, so that "what ran when it was recorded is exactly what runs on replay".
// Note: keep this file CommonJS and dependent only on @playwright/test, so it can be bundled into the portable runner.

const { expect } = require('@playwright/test');

/**
 * Turn a target description from the JSON into a Playwright Locator.
 * Supported fields (in priority order): testId / role(+name) / label / placeholder / text / css
 * Extra fields: inner (locate again inside the host element, e.g. the input in a web component's shadow DOM), nth
 */
function resolveTarget(page, target) {
  if (!target) throw new Error('Step is missing a target');
  let loc;
  if (target.testId) loc = page.getByTestId(target.testId);
  else if (target.role) loc = page.getByRole(target.role, target.name ? { name: target.name, exact: !!target.exact } : {});
  else if (target.label) loc = page.getByLabel(target.label, { exact: !!target.exact });
  else if (target.placeholder) loc = page.getByPlaceholder(target.placeholder, { exact: !!target.exact });
  else if (target.text) loc = page.getByText(target.text, { exact: !!target.exact });
  else if (target.css) loc = page.locator(target.css);
  else throw new Error('Unrecognized target: ' + JSON.stringify(target));

  // CSS locators pierce open shadow roots automatically, so inner: 'input' finds the native input inside sc-text-input
  if (target.inner) loc = loc.locator(target.inner);
  if (target.nth !== undefined && target.nth !== null) loc = loc.nth(target.nth);
  return loc;
}

function describeTarget(target) {
  if (!target) return '';
  const base =
    (target.testId && `testId=${target.testId}`) ||
    (target.role && `role=${target.role}${target.name ? `[${target.name}]` : ''}`) ||
    (target.label && `label=${target.label}`) ||
    (target.placeholder && `placeholder=${target.placeholder}`) ||
    (target.text && `text=${target.text}`) ||
    (target.css && `css=${target.css}`) ||
    '?';
  return base + (target.inner ? ` >> ${target.inner}` : '') + (target.nth !== undefined ? ` [${target.nth}]` : '');
}

/** Read a dotted path from an object: get({a:{b:1}}, 'a.b') => 1 */
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const PLACEHOLDER = /\$\{(var|cfg):([^}]+)\}/g;

/**
 * Resolve placeholders in a value:
 *   ${var:tradeId}                  a dynamic value read at run time (e.g. a trade ID)
 *   ${cfg:accounts.maker.password}  a value from local config (accounts, passwords, etc. - never stored in the case file)
 * ctx.askConfig(path) is optional: ask the user when config is missing a value (the runner uses it to prompt the PO for passwords)
 */
async function resolveValue(value, ctx) {
  if (typeof value !== 'string') return value;
  let out = '';
  let last = 0;
  for (const m of value.matchAll(PLACEHOLDER)) {
    out += value.slice(last, m.index);
    const [, kind, key] = m;
    let v;
    if (kind === 'var') {
      v = ctx.vars[key];
      if (v === undefined) throw new Error(`Variable ${key} has not been read yet (check that an earlier read step saves it)`);
    } else {
      v = getPath(ctx.config, key);
      if (v === undefined || v === '') {
        if (!ctx.askConfig) throw new Error(`Local config is missing ${key}; please add it to config.local.json`);
        v = await ctx.askConfig(key);
      }
    }
    out += String(v);
    last = m.index + m[0].length;
  }
  return out + value.slice(last);
}

/** Join baseUrl and a relative path; case files store only relative paths, never the server address */
function resolveUrl(baseUrl, path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (!baseUrl) throw new Error('baseUrl is not configured; please set it in config.local.json');
  return baseUrl.replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Execute one step. The step's value may contain placeholders, which are resolved here.
 * Returns the text that was read for a read step, undefined otherwise.
 */
async function executeStep(page, step, ctx) {
  const timeout = step.timeout ?? ctx.config?.timeouts?.step ?? 15000;
  const value = await resolveValue(step.value, ctx);
  // Locators may contain variables too, e.g. { text: '${var:tradeId}' } to click the trade that was just booked
  if (step.target) {
    const resolved = {};
    for (const [k, v] of Object.entries(step.target)) resolved[k] = await resolveValue(v, ctx);
    step = { ...step, target: resolved };
  }

  switch (step.action) {
    case 'goto':
      await page.goto(resolveUrl(ctx.config.baseUrl, value));
      return;
    case 'fill':
      await resolveTarget(page, step.target).fill(value, { timeout });
      return;
    case 'click':
      await resolveTarget(page, step.target).click({ timeout });
      return;
    case 'press':
      await resolveTarget(page, step.target).press(value, { timeout });
      return;
    case 'select':
      await resolveTarget(page, step.target).selectOption(value, { timeout });
      return;
    case 'read': {
      const loc = resolveTarget(page, step.target);
      await loc.waitFor({ state: 'visible', timeout });
      const text = (await loc.innerText()).trim();
      ctx.vars[step.saveAs] = text;
      return text;
    }
    case 'expectVisible':
      await expect(resolveTarget(page, step.target)).toBeVisible({ timeout });
      return;
    case 'expectText':
      if (step.exact) await expect(resolveTarget(page, step.target)).toHaveText(value, { timeout });
      else await expect(resolveTarget(page, step.target)).toContainText(value, { timeout });
      return;
    case 'expectUrl':
      // Compare only the path part; the server address does not matter
      await expect(page).toHaveURL(new RegExp(escapeRegExp(value) + '(\\?.*)?(#.*)?$'), { timeout });
      return;
    case 'wait':
      await page.waitForTimeout(Number(value) || 0);
      return;
    default:
      throw new Error(`Unsupported action: ${step.action}`);
  }
}

/** One-line readable description of a step, used in logs and reports */
function describeStep(step) {
  const t = describeTarget(step.target);
  const v = step.secret
    ? '******'
    : typeof step.value === 'string'
      ? step.value.replace(/\$\{cfg:([^}]+)\}/g, '[config $1]').replace(/\$\{var:([^}]+)\}/g, '[variable $1]')
      : step.value;
  switch (step.action) {
    case 'goto': return `Open page ${v}`;
    case 'fill': return `Type ${v} into ${t}`;
    case 'click': return `Click ${t}`;
    case 'press': return `Press ${v} on ${t}`;
    case 'select': return `Select ${v} in ${t}`;
    case 'read': return `Read ${t} and save as ${step.saveAs}`;
    case 'expectVisible': return `Verify ${t} is visible`;
    case 'expectText': return `Verify ${t} ${step.exact ? 'equals' : 'contains'} ${v}`;
    case 'expectUrl': return `Verify current page is ${v}`;
    case 'wait': return `Wait ${v} ms`;
    default: return step.action;
  }
}

module.exports = { resolveTarget, describeTarget, resolveValue, resolveUrl, executeStep, describeStep, getPath };
