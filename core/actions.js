// Shared execution core: QA running a case locally and the PO replaying a case file both go through
// this same logic, so that "what ran when it was recorded is exactly what runs on replay".
// Note: keep this file CommonJS and dependent only on @playwright/test, so it can be bundled into the portable runner.

const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

// Case file versions this code can run: 1 = steps only; 2 = adds the params block and ${param:name}
const FORMAT_VERSION = 2;

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

const showConfigRefs = (text) => String(text).replace(/\$\{cfg:([^}]+)\}/g, '[config $1]');

/**
 * Make placeholders readable. A variable whose value is already known (vars) is shown as that value,
 * e.g. "TRD-123 (variable createdTradeId)", and case data (params) as "MOCK BANK A (case data counterpartyName)";
 * config values are never printed, only their names.
 */
function showPlaceholders(text, vars, params) {
  return showConfigRefs(text)
    .replace(/\$\{var:([^}]+)\}/g, (m, name) => (vars && vars[name] !== undefined ? `${vars[name]} (variable ${name})` : `[variable ${name}]`))
    .replace(/\$\{param:([^}]+)\}/g, (m, name) => (params && params[name] !== undefined ? `${showConfigRefs(params[name])} (case data ${name})` : `[case data ${name}]`));
}

function describeTarget(target, vars, params) {
  if (!target) return '';
  const base =
    (target.testId && `testId=${target.testId}`) ||
    (target.role && `role=${target.role}${target.name ? `[${target.name}]` : ''}`) ||
    (target.label && `label=${target.label}`) ||
    (target.placeholder && `placeholder=${target.placeholder}`) ||
    (target.text && `text=${target.text}`) ||
    (target.css && `css=${target.css}`) ||
    '?';
  return showPlaceholders(base + (target.inner ? ` >> ${target.inner}` : '') + (target.nth !== undefined ? ` [${target.nth}]` : ''), vars, params);
}

/** Read a dotted path from an object: get({a:{b:1}}, 'a.b') => 1 */
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const PLACEHOLDER = /\$\{(var|cfg|param):([^}]+)\}/g;

async function configValue(key, ctx) {
  const v = getPath(ctx.config, key);
  if (v !== undefined && v !== '') return v;
  if (!ctx.askConfig) throw new Error(`Local config is missing ${key}; please add it to config.local.json`);
  return ctx.askConfig(key);
}

/**
 * Resolve placeholders in a value:
 *   ${var:tradeId}                  a dynamic value read at run time (e.g. a trade ID)
 *   ${cfg:accounts.maker.password}  a value from local config (accounts, passwords, etc. - never stored in the case file)
 *   ${param:counterpartyName}       case data: a value from the params block of the case file (ctx.params). The value
 *                                   may itself point at local config with ${cfg:...}; nothing else is resolved inside it
 * ctx.askConfig(path) is optional: ask the user when config is missing a value (the runner uses it to prompt the PO for passwords)
 */
async function resolveValue(value, ctx, inParam) {
  if (typeof value !== 'string') return value;
  let out = '';
  let last = 0;
  for (const m of value.matchAll(PLACEHOLDER)) {
    out += value.slice(last, m.index);
    const [, kind, key] = m;
    let v;
    if (kind === 'cfg') {
      v = await configValue(key, ctx);
    } else if (inParam) {
      v = m[0]; // case data is plain text apart from config references
    } else if (kind === 'var') {
      v = ctx.vars[key];
      if (v === undefined) throw new Error(`Variable ${key} has not been read yet (check that an earlier read step saves it)`);
    } else {
      v = ctx.params ? ctx.params[key] : undefined;
      if (v === undefined) throw new Error(`Case data ${key} is not defined (the case file has no "${key}" in its params)`);
      v = await resolveValue(String(v), ctx, true);
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

/**
 * Files to upload are shipped with the cases in the data folder next to them (e.g. data/FX_TRF.dat).
 * A case file can only point inside that folder, never at an arbitrary path on the machine.
 */
function resolveDataFile(rootDir, rel) {
  if (!rootDir) throw new Error('The folder that holds the upload files is not known (ctx.rootDir is missing)');
  const base = path.join(rootDir, 'data');
  const file = path.resolve(rootDir, String(rel));
  if (!file.startsWith(base + path.sep)) throw new Error(`Upload files must be inside the data folder: ${rel}`);
  if (!fs.existsSync(file)) throw new Error(`File to upload was not found: ${rel} (expected at ${file})`);
  return file;
}

/**
 * Click and read a value out of the response the click triggers, e.g. the ID of the trade that was just created:
 *   capture: { url: '/trades', method: 'POST', field: 'data.trade.id', saveAs: 'createdTradeId' }
 * url is matched against the end of the request path, so no server address is needed. It may carry a query
 * ('/trades/create?tradeAction=SUBMIT'): those parameters must then be present on the request with the same values.
 */
async function clickAndCapture(page, loc, capture, ctx, timeout) {
  const method = capture.method ? String(capture.method).toUpperCase() : '';
  const what = `${method || 'request'} ...${capture.url}`;
  const [wantPath, wantQuery = ''] = String(capture.url).split('?');
  const wantParams = [...new URLSearchParams(wantQuery)];
  const isMatch = (url) => url.pathname.replace(/\/+$/, '').endsWith(wantPath.replace(/\/+$/, ''))
    && wantParams.every(([k, v]) => url.searchParams.get(k) === v);
  // The response is paused in the browser (CDP Fetch domain, response stage), read, then released to the page:
  // - page.route + route.fetch() would re-send the request without the file of a multipart upload (the browser
  //   does not expose it), so the server receives a trade with an empty file;
  // - merely observing the response loses its body when the page navigates right after receiving it.
  // The request itself is sent by the browser untouched. Works on Chromium browsers (Edge, Chrome) only.
  let cdp;
  try { cdp = await page.context().newCDPSession(page); }
  catch (e) { throw new Error(`Reading a response needs Edge or Chrome: ${e.message || e}`); }
  let done;
  const seen = new Promise((resolve) => { done = resolve; });
  cdp.on('Fetch.requestPaused', async (ev) => {
    try {
      if ((method && ev.request.method !== method) || !isMatch(new URL(ev.request.url))) return;
      if (ev.responseErrorReason) return done({ error: new Error(ev.responseErrorReason) });
      const status = ev.responseStatusCode;
      if (status === undefined || (status >= 300 && status < 400)) return; // not a final response
      const b = await cdp.send('Fetch.getResponseBody', { requestId: ev.requestId });
      done({ status, ok: status >= 200 && status < 300, text: b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf-8') : b.body });
    } catch (e) {
      done({ error: e });
    } finally {
      await cdp.send('Fetch.continueRequest', { requestId: ev.requestId }).catch(() => {});
    }
  });
  let res;
  try {
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: `*${wantPath.replace(/\/+$/, '')}*`, requestStage: 'Response' }] });
    await loc.click({ timeout });
    let timer;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeout); });
    res = await Promise.race([seen, late]);
    clearTimeout(timer);
  } finally {
    await cdp.detach().catch(() => {});
  }
  if (!res) throw new Error(`No ${what} was sent within ${timeout} ms after the click`);
  if (res.error) throw new Error(`${what} failed: ${res.error.message || res.error}`);
  if (!res.ok) throw new Error(`${what} returned HTTP ${res.status}${res.text ? ': ' + res.text.slice(0, 300) : ''}`);
  let body;
  try { body = JSON.parse(res.text); } catch { throw new Error(`${what} did not return JSON`); }
  const v = getPath(body, capture.field);
  if (v === undefined || v === null || v === '') throw new Error(`${what} response has no ${capture.field}`);
  ctx.vars[capture.saveAs] = String(v);
  return String(v);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Execute one step. The step's value may contain placeholders, which are resolved here.
 * Returns the text that was read for a read step or captured by a click, undefined otherwise.
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
      if (step.capture) return clickAndCapture(page, resolveTarget(page, step.target), step.capture, ctx, timeout);
      await resolveTarget(page, step.target).click({ timeout });
      return;
    case 'upload': {
      const file = resolveDataFile(ctx.rootDir, value);
      // The target may be the file input itself or an upload zone (web component) that wraps it
      let loc = resolveTarget(page, step.target);
      await loc.waitFor({ state: 'attached', timeout });
      // setInputFiles does not scroll, so bring the upload area into view first: the upload is then visible
      // in the browser and in the step screenshot (a hidden file input cannot scroll, use its parent)
      await loc.evaluate((el) => (el.offsetParent || !el.parentElement ? el : el.parentElement)
        .scrollIntoView({ block: 'center', inline: 'nearest' }));
      if (!(await loc.evaluate((el) => el.tagName === 'INPUT'))) loc = loc.locator('input[type=file]');
      await loc.setInputFiles(file, { timeout });
      return;
    }
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

/**
 * One-line readable description of a step, used in logs and reports; pass the variables read so far and
 * the case data (params) to show their values
 */
function describeStep(step, vars, params) {
  const t = describeTarget(step.target, vars, params);
  const v = step.secret ? '******' : typeof step.value === 'string' ? showPlaceholders(step.value, vars, params) : step.value;
  switch (step.action) {
    case 'goto': return `Open page ${v}`;
    case 'fill': return `Type ${v} into ${t}`;
    case 'click': return step.capture ? `Click ${t} and save ${step.capture.field} from the response as ${step.capture.saveAs}` : `Click ${t}`;
    case 'upload': return `Upload file ${v} to ${t}`;
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

module.exports = {
  FORMAT_VERSION, resolveDataFile, resolveTarget, describeTarget, showPlaceholders, resolveValue, resolveUrl, executeStep, describeStep, getPath,
};
