// Steps that deal with a request: a click that waits for the answer of the request it triggers (answered by the
// system or by a mock), a click that reads a value out of that answer, and a call of the API without the page.

const fs = require('fs');
const path = require('path');
const { getPath, resolveValue, resolveDeep, resolveUrl } = require('./values');
const { resolveDataFile } = require('./data-files');

/** Does a request address end with this path? A query in the path must be on the request too, with the same values */
function urlMatcher(pathAndQuery) {
  const [wantPath, wantQuery = ''] = String(pathAndQuery).split('?');
  const wantParams = [...new URLSearchParams(wantQuery)];
  return (url) => url.pathname.replace(/\/+$/, '').endsWith(wantPath.replace(/\/+$/, ''))
    && wantParams.every(([k, v]) => url.searchParams.get(k) === v);
}

/**
 * Is the request of this click answered by the runner instead of the system? Only when the step names a local
 * setting (request.setting, e.g. riskEngine) and that setting is 'mock'. Any other value than 'real' is refused.
 */
function isMocked(step, config) {
  const req = step && step.request;
  if (!req || !req.setting || !req.mock) return false;
  const mode = String(getPath(config, req.setting) ?? 'real').trim().toLowerCase() || 'real';
  if (mode !== 'mock' && mode !== 'real') throw new Error(`${req.setting} in config.local.json must be "real" or "mock", not "${mode}"`);
  return mode === 'mock';
}

/**
 * Click and wait for the answer of a request the click triggers, e.g. the risk calculation that runs before a
 * confirmation dialog opens:
 *   request: { url: '/trades/${var:createdTradeId}/calculate-risk', method: 'POST', setting: 'riskEngine',
 *              mock: { status: 200, body: { ... } } }
 * url is matched like the one of capture. The request is sent by the page and answered by the system, unless the
 * local setting named by setting is 'mock': then it never leaves the browser and is answered with mock.
 * Either way the step is over only once the answer is there; any answer other than 2xx fails it.
 */
async function clickAndAwait(page, loc, step, ctx, timeout) {
  const req = step.request;
  const method = String(req.method || 'GET').toUpperCase();
  const urlPath = await resolveValue(String(req.url), ctx);
  const what = `${method} ...${urlPath}`;
  const isMatch = urlMatcher(urlPath);
  const wait = step.timeout ?? ctx.config?.timeouts?.response ?? 60000;
  const mocked = isMocked(step, ctx.config);
  // Whether the hint to mock the request is of any use: not where the setting is fixed (ctx.fixed, the PO's runner)
  const canMock = !mocked && !!req.setting && !!req.mock && !(ctx.fixed && req.setting in ctx.fixed);
  const answered = page.waitForResponse((r) => r.request().method() === method && isMatch(new URL(r.url())), { timeout: wait });
  answered.catch(() => {}); // reported below; without this a failed click would leave an unhandled rejection
  const route = async (r) => {
    const request = r.request();
    if (request.method() !== method) return r.fallback();
    const origin = await request.headerValue('origin');
    await r.fulfill({
      status: req.mock.status || 200,
      contentType: 'application/json',
      // the API is on another origin than the pages: the browser only hands the answer to the page with these
      headers: origin ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' } : {},
      body: JSON.stringify(await resolveDeep(req.mock.body ?? {}, ctx)),
    });
  };
  if (mocked) await page.route(isMatch, route);
  let res;
  try {
    await loc.click({ timeout, button: step.button });
    try { res = await answered; }
    catch { throw new Error(`No ${what} was answered within ${wait} ms after the click${mocked ? '' : ` (timeouts.response in config.local.json${canMock ? `; "${req.setting}": "mock" answers it without the system` : ''})`}`); }
  } finally {
    if (mocked) await page.unroute(isMatch, route).catch(() => {});
  }
  if (!res.ok()) {
    const text = await res.text().catch(() => '');
    throw new Error(`${what} returned HTTP ${res.status()}${text ? ': ' + text.slice(0, 300) : ''}${canMock ? ` (set "${req.setting}": "mock" in config.local.json to run without it)` : ''}`);
  }
}

/**
 * Click and read a value out of the response the click triggers, e.g. the ID of the trade that was just created:
 *   capture: { url: '/trades', method: 'POST', field: 'data.trade.id', saveAs: 'createdTradeId' }
 * url is matched against the end of the request path, so no server address is needed. It may carry a query
 * ('/trades/create?tradeAction=SUBMIT'): those parameters must then be present on the request with the same values.
 */
async function clickAndCapture(page, loc, capture, ctx, timeout, button) {
  const method = capture.method ? String(capture.method).toUpperCase() : '';
  const what = `${method || 'request'} ...${capture.url}`;
  const wantPath = String(capture.url).split('?')[0];
  const isMatch = urlMatcher(capture.url);
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
    await loc.click({ timeout, button });
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

/**
 * Call the system's API directly, without the page, e.g. to prepare the trade a case works on:
 *   { action: 'api', method: 'POST', value: '/trades/create?tradeAction=SUBMIT',
 *     headers: { 'X-User-Id': '${cfg:accounts.maker.email}' },
 *     multipart: { trade: { json: { basic: { productId: 'FX_TRF' } } }, datFile: { file: 'testdata/dat/FX_TRF/FX_TRF.dat' } },
 *     save: { createdTradeId: 'data.trade.id' } }
 * value is a path on apiBaseUrl of the local config: the API may be served from another address than the pages.
 * apiBaseUrl includes the prefix every request shares (e.g. .../api/v1), so that prefix is not part of value.
 * With base "origin" the path is joined to the address of apiBaseUrl without that prefix: a request of the same
 * server that is not under the prefix (e.g. /uc/api/user-preferences).
 * The request carries multipart (each part a JSON document or a file of the data folder), or body (JSON), or nothing.
 * Any answer other than 2xx fails the step. save stores fields of the JSON response as variables: name -> field.
 * The request is sent by Playwright's own API client, not by the page; it is listed in the trace.
 */
/** The server of an address, without its path: https://host:port of https://host:port/api/v1. Empty stays empty */
function originOf(address) {
  if (!address) return address;
  try { return new URL(address).origin; }
  catch { throw new Error('apiBaseUrl in config.local.json is not a valid address'); }
}

async function callApi(page, step, apiPath, ctx, timeout) {
  const method = String(step.method || 'GET').toUpperCase();
  const what = `${method} ${apiPath}`;
  if (step.base !== undefined && step.base !== 'origin') throw new Error(`${what}: base "${step.base}" is not supported (only "origin"). Ask QA for the current UAT-Runner package.`);
  const url = resolveUrl(step.base === 'origin' ? originOf(ctx.config.apiBaseUrl) : ctx.config.apiBaseUrl, apiPath, 'apiBaseUrl');
  const options = { method, timeout, headers: { accept: 'application/json', ...(await resolveDeep(step.headers || {}, ctx)) } };
  if (step.multipart) {
    options.multipart = {};
    for (const [name, part] of Object.entries(step.multipart)) {
      if (part && part.file) {
        const file = resolveDataFile(ctx.rootDir, await resolveValue(part.file, ctx));
        options.multipart[name] = { name: path.basename(file), mimeType: 'application/octet-stream', buffer: fs.readFileSync(file) };
      } else if (part && part.json !== undefined) {
        // Sent the way a browser sends a JSON Blob in a form: its own content type and the file name "blob"
        const json = JSON.stringify(await resolveDeep(part.json, ctx));
        options.multipart[name] = { name: 'blob', mimeType: 'application/json', buffer: Buffer.from(json, 'utf-8') };
      } else {
        throw new Error(`Part ${name} of ${what} must be { "json": ... } or { "file": "testdata/dat/..." }`);
      }
    }
  } else if (step.body !== undefined) {
    options.data = await resolveDeep(step.body, ctx);
  }
  let res;
  try { res = await page.request.fetch(url, options); }
  catch (e) { throw new Error(`${what} could not be sent: ${String(e.message || e).split('\n')[0]}`); }
  const text = await res.text();
  // The usual reason for a 404 or for a page instead of JSON: apiBaseUrl is not the API's address, or the prefix all
  // requests share (e.g. /api/v1) is missing from it or repeated in the path
  const hint = step.base === 'origin'
    ? ' (this request is sent to the server of apiBaseUrl in config.local.json, without the prefix: check that it is served there)'
    : ' (check that apiBaseUrl in config.local.json is the address of the API including its prefix, e.g. .../api/v1)';
  if (!res.ok()) throw new Error(`${what} returned HTTP ${res.status()}${text ? ': ' + text.slice(0, 300) : ''}${res.status() === 404 ? hint : ''}`);
  const saved = {};
  const fields = Object.entries(step.save || {});
  if (fields.length) {
    let body;
    try { body = JSON.parse(text); } catch { throw new Error(`${what} did not return JSON${hint}`); }
    for (const [name, field] of fields) {
      const v = getPath(body, field);
      if (v === undefined || v === null || v === '') throw new Error(`${what} response has no ${field}`);
      ctx.vars[name] = saved[name] = String(v);
    }
  }
  return saved;
}

module.exports = { isMocked, clickAndAwait, clickAndCapture, callApi };
