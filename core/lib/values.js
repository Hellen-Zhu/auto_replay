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

/**
 * A part of a request that depends on case data (format version 11), anywhere inside the JSON of an api step:
 *   "udf": { "byParam": "tradeType", "choices": ["Normal", "StepInFull", "StepInPartial"],
 *            "values": { "StepInFull": [ ... ], "StepInPartial": [ ... ] } }
 * It stands for the entry of values under the current value of that case data. A choice without an entry stands for
 * nothing: the key (or list item) is left out of the request, so a Normal trade is sent without "udf".
 */
const isSwitch = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 3
  && typeof v.byParam === 'string' && Array.isArray(v.choices) && !!v.values && typeof v.values === 'object' && !Array.isArray(v.values);

const NOTHING = Symbol('nothing');
function variantOf(sw, ctx) {
  const v = ctx.params ? ctx.params[sw.byParam] : undefined;
  if (v === undefined) throw new Error(`Case data ${sw.byParam} is not defined (the case file has no "${sw.byParam}" in its params)`);
  if (!sw.choices.includes(String(v))) throw new Error(`Case data ${sw.byParam} is "${v}": it must be one of ${sw.choices.join(', ')}`);
  return Object.prototype.hasOwnProperty.call(sw.values, String(v)) ? sw.values[String(v)] : NOTHING;
}

/** Resolve the placeholders of every text inside a JSON value (the headers, body and JSON parts of an api step) */
async function resolveDeep(value, ctx) {
  if (typeof value === 'string') return resolveValue(value, ctx);
  // a part that depends on case data: only the variant of this run is resolved
  const pick = (v) => (isSwitch(v) ? variantOf(v, ctx) : v);
  if (Array.isArray(value)) {
    const out = [];
    for (const v of value) if (pick(v) !== NOTHING) out.push(await resolveDeep(pick(v), ctx));
    return out;
  }
  if (isSwitch(value)) {
    const v = variantOf(value, ctx);
    return v === NOTHING ? undefined : resolveDeep(v, ctx);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (pick(v) !== NOTHING) out[k] = await resolveDeep(pick(v), ctx);
    return out;
  }
  return value;
}

/**
 * The case data that parts of the api steps depend on: name -> the values it may have, as the case file lists them.
 * steps is the flat list of actions.
 */
function paramChoicesOf(steps) {
  const out = {};
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    if (isSwitch(v)) {
      if (!out[v.byParam]) out[v.byParam] = v.choices.map(String);
      Object.values(v.values).forEach(walk);
    } else Object.values(v).forEach(walk);
  };
  for (const s of steps || []) if (s && s.action === 'api') [s.headers, s.body, s.multipart].forEach(walk);
  // and the case data a group of actions depends on (format version 13)
  for (const s of steps || []) if (s && isCondition(s.when) && !s.when.empty && !out[s.when.param]) out[s.when.param] = s.when.choices.map(String);
  return out;
}

/**
 * A group of actions that runs only for some values of a case data (format version 13), e.g. the third subtrade of
 * an allocation: { "param": "allocationWays", "choices": ["2", "3", "4"], "in": ["3", "4"] }. choices are the values
 * the case data may have (what the runner offers), in those for which the group runs.
 */
// Format version 15 adds { "param": "tradeId", "empty": true }: the group runs only while that case data has no
// value, e.g. creating the given trade when no trade ID was entered (a set action of the group then fills it in).
const isCondition = (w) => !!w && typeof w === 'object' && typeof w.param === 'string'
  && (w.empty === true || (Array.isArray(w.choices) && Array.isArray(w.in)));

/** Case data that may stay empty: a group of the steps runs only while it is empty and gives it its value */
const optionalParamsOf = (steps) => [...new Set((steps || []).filter((s) => s && isCondition(s.when) && s.when.empty).map((s) => s.when.param))];

/**
 * What only the groups that run while an optional case data is empty need: optional name -> { params, config },
 * the case data and the config entries no other action uses. When the PO gives a trade ID, the data of the trade
 * the case would otherwise create through the API is not needed, nor the account that would approve it.
 * The step lines (title, substep) do not count as a use: they are text for the reader.
 */
// The case data and config entries an action uses. The step lines (title, substep) do not count: they are text for the reader
function refsOf(action) {
  const params = new Set();
  const config = new Set();
  const walk = (v) => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(/\$\{param:([^}]+)\}/g)) params.add(m[1]);
      for (const m of v.matchAll(/\$\{cfg:([^}]+)\}/g)) config.add(m[1]);
    } else if (v && typeof v === 'object') {
      if (isSwitch(v)) params.add(v.byParam);
      Object.values(v).forEach(walk);
    }
  };
  for (const [k, v] of Object.entries(action)) {
    if (k === 'title' || k === 'substep') continue;
    if (k === 'when') { if (isCondition(v)) params.add(v.param); continue; }
    if (k === 'request' && v && v.setting) config.add(v.setting);
    walk(v);
  }
  return { params, config };
}

/**
 * What this case data does not need: { params, config }, the case data and config entries that only actions which do
 * not run with it use (the data of the given trade when a trade ID was entered, the third subtrade of an allocation
 * into two). A case data that a condition names is always needed, since changing it changes what runs. An action
 * whose condition cannot be decided (a value outside its choices) counts as running: the step fails on it.
 */
function notRunWith(steps, params) {
  const runs = (s) => { try { return !s.when || conditionHolds(s.when, params); } catch { return true; } };
  const used = { params: new Set(), config: new Set() };
  const unused = { params: new Set(), config: new Set() };
  const named = new Set();
  for (const s of steps || []) {
    if (!s) continue;
    if (isCondition(s.when)) named.add(s.when.param);
    const r = refsOf(s);
    const to = runs(s) ? used : unused;
    r.params.forEach((x) => to.params.add(x));
    r.config.forEach((x) => to.config.add(x));
  }
  return {
    params: new Set([...unused.params].filter((x) => !used.params.has(x) && !named.has(x))),
    config: new Set([...unused.config].filter((x) => !used.config.has(x))),
  };
}

function onlyWhenEmptyOf(steps) {
  const inside = {};
  const outside = { params: new Set(), config: new Set() };
  for (const s of steps || []) {
    if (!s) continue;
    const r = refsOf(s);
    const to = isCondition(s.when) && s.when.empty ? (inside[s.when.param] = inside[s.when.param] || { params: new Set(), config: new Set() }) : outside;
    r.params.forEach((x) => to.params.add(x));
    r.config.forEach((x) => to.config.add(x));
  }
  return Object.fromEntries(Object.entries(inside).map(([name, r]) => [name, {
    params: [...r.params].filter((x) => x !== name && !outside.params.has(x)),
    config: [...r.config].filter((x) => !outside.config.has(x)),
  }]));
}

/** Whether a group with this condition runs with this case data; a value outside its choices is an error */
function conditionHolds(when, params) {
  if (!isCondition(when)) throw new Error(`A condition must be { param, choices, in } or { param, empty: true }; the case file has ${JSON.stringify(when)}`);
  const v = params ? params[when.param] : undefined;
  if (v === undefined) throw new Error(`Case data ${when.param} is not defined (the case file has no "${when.param}" in its params)`);
  if (when.empty) return String(v) === '';
  if (!when.choices.map(String).includes(String(v))) throw new Error(`Case data ${when.param} is "${v}": it must be one of ${when.choices.join(', ')}`);
  return when.in.map(String).includes(String(v));
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

module.exports = { getPath, resolveValue, resolveDeep, isSwitch, paramChoicesOf, isCondition, conditionHolds, optionalParamsOf, onlyWhenEmptyOf, notRunWith, fillParams, showPlaceholders, resolveUrl };
