// Placeholders: ${cfg:...} (local config), ${var:...} (a value read at run time) and ${param:...} (case data).
// Resolving them for a run, filling in case data alone, and showing them readably in logs and reports.

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
      if (String(v) === '') throw new Error(`Case data ${key} has no value: it has to be entered before the run`);
      v = await resolveValue(String(v), ctx, true);
    }
    out += String(v);
    last = m.index + m[0].length;
  }
  return out + value.slice(last);
}

/** Resolve the placeholders of every text inside a JSON value (the headers, body and JSON parts of an api step) */
async function resolveDeep(value, ctx) {
  if (typeof value === 'string') return resolveValue(value, ctx);
  if (Array.isArray(value)) {
    const out = [];
    for (const v of value) out.push(await resolveDeep(v, ctx));
    return out;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = await resolveDeep(v, ctx);
    return out;
  }
  return value;
}

/**
 * Text with its case data filled in: a step line such as "creates a new '${param:product}' trade", or the name of
 * a data file (testdata/dat/${param:product}/${param:datFile}). Case data without a value stays as it is written.
 */
function fillParams(text, params) {
  return String(text).replace(/\$\{param:([^}]+)\}/g, (m, name) => (params && params[name] !== undefined && String(params[name]) !== '' ? String(params[name]) : m));
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

/**
 * Join a configured address and a relative path; case files store only relative paths, never the server address.
 * key names the config entry the address comes from (baseUrl for pages, apiBaseUrl for api steps), for the error message
 */
function resolveUrl(baseUrl, path, key = 'baseUrl') {
  if (/^https?:\/\//i.test(path)) return path;
  if (!baseUrl) throw new Error(`${key} is not configured; please set it in config.local.json`);
  return baseUrl.replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
}

module.exports = { getPath, resolveValue, resolveDeep, fillParams, showPlaceholders, resolveUrl };
