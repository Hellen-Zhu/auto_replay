// What a run needs before it starts: the settings and case data that are asked for, and the checks of a case file.

const fs = require('fs');
const path = require('path');
const { FORMAT_VERSION, DATA_DIR, showPlaceholders, resolveDataFile, dataFilesOf, fillParams, paramChoicesOf, optionalParamsOf, notRunWith, conditionHolds } = require('../../core/actions');
const { ROOT } = require('./paths');
const state = require('./state');
const { ask, askHidden } = require('./console');
const { useKeys, pickRow } = require('./menu');
const { looksLikePath, droppedPath } = require('./case-list');

// ---------------- Saving settings ----------------
// Update only the given keys in the config file and leave everything else in it untouched.
function saveConfig(file, values) {
  const doc = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '')) : {};
  for (const [key, v] of Object.entries(values)) {
    const parts = key.split('.');
    let o = doc;
    for (const p of parts.slice(0, -1)) o = o[p] = o[p] && typeof o[p] === 'object' ? o[p] : {};
    o[parts.at(-1)] = v;
  }
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
}

// ---------------- Execution ----------------
const isSecret = (key) => /password|secret|token/i.test(key);
const isEmpty = (v) => v === undefined || v === '';
const getCfg = (config, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), config);
function setCfg(config, key, v) {
  const parts = key.split('.');
  let o = config;
  for (const p of parts.slice(0, -1)) o = o[p] = o[p] || {};
  o[parts.at(-1)] = v;
}

// Case data (version 2 case files): the values the case types or selects
const paramsOf = (doc) => Object.fromEntries(Object.entries(doc.params || {}).map(([k, v]) => [k, String(v)]));
// What a run with this case data does not need: the case data and settings that only actions which do not run with it
// use (a trade ID given: the API data of a new trade, the checker's account that would approve it; an allocation into
// two: the third and fourth subtrade). They are neither shown, asked for nor reported for that run.
const notNeededOf = (doc, params) => notRunWith(doc.steps, params || paramsOf(doc));
// Case data that must differ from each other (the case file's "distinct": lists of names, e.g. the counterparties of
// the subtrades of an allocation). Only the values this run needs count. Returns the problem, or '' when there is none
function distinctProblem(doc, params) {
  const notNeeded = notNeededOf(doc, params).params;
  for (const group of Array.isArray(doc.distinct) ? doc.distinct : []) {
    const seen = {};
    for (const name of group) {
      const v = params[name];
      if (v === undefined || String(v) === '' || notNeeded.has(name)) continue;
      const key = String(v).trim().toLowerCase();
      if (seen[key]) return `Case data ${seen[key]} and ${name} are both "${v}": they must be different`;
      seen[key] = name;
    }
  }
  return '';
}
// The data a run used, for the report: a value that points at local config is shown by its name, and a value the PO
// changed for the run comes with the one of the case file
const caseDataOf = (doc, params) => Object.keys(params).filter((name) => !notNeededOf(doc, params).params.has(name)).map((name) => {
  const original = String(doc.params[name]);
  // a value that was entered for the run (empty in the case file) is not a change
  return { name, value: showPlaceholders(params[name]), ...(params[name] !== original && original !== '' ? { changedFrom: showPlaceholders(original) } : {}) };
});
// Case data without a value in the case file (version 6): what only the PO knows, e.g. the ID of an existing trade
// case data that may stay empty (the case then gives it its value itself, e.g. creates the trade) is not asked for
const askedParamsOf = (doc) => {
  const optional = optionalParamsOf(doc.steps);
  return Object.keys(doc.params || {}).filter((k) => String(doc.params[k]) === '' && !optional.includes(k));
};

// Case data that names a data file, or the folder it is in (testdata/dat/${param:product}/${param:datFile}), can only be
// what the package has: name -> the values to choose from, in alphabetical order, for the case data as it is now.
// A name that follows another one in the path (datFile after product) is listed for the current value of the
// earlier one, so the names come back in the order they have to be chosen in (choiceOrder).
const PARAM_PART = /^([^$]*)\$\{param:([^}]+)\}([^$]*)$/;
const dataFileNames = (doc) => [...new Set(doc.steps.flatMap((step) => dataFilesOf(step).map(String)))];
function choicesOf(doc, params) {
  const out = {};
  for (const f of dataFileNames(doc)) {
    const parts = f.split('/');
    parts.forEach((part, i) => {
      const m = PARAM_PART.exec(part);
      if (!m) return;
      const [, before, name, after] = m;
      const dir = fillParams(parts.slice(0, i).join('/'), params);
      let found = [];
      if (!dir.includes('${param:')) {
        try {
          found = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
            // the last part of the path is a file, every part before it a folder
            .filter((e) => (i < parts.length - 1 ? e.isDirectory() : !e.isDirectory()))
            .map((e) => e.name)
            .filter((n) => n.startsWith(before) && n.endsWith(after) && n.length > before.length + after.length)
            .map((n) => n.slice(before.length, n.length - after.length)).sort();
        } catch { /* no such folder: nothing to choose */ }
      }
      out[name] = out[name] ? out[name].filter((v) => found.includes(v)) : found;
    });
  }
  return out;
}
// The names of choicesOf in the order of the path: a folder before the file in it
function choiceOrder(doc) {
  const order = [];
  for (const f of dataFileNames(doc)) for (const part of f.split('/')) {
    const m = PARAM_PART.exec(part);
    if (m && !order.includes(m[2])) order.push(m[2]);
  }
  return order;
}

// The case data that is the name of a data file itself (datFile of testdata/dat/${param:product}/${param:datFile}):
// { dir, before, after } for the case data as it is now (dir is null while a folder before it has no value), or null
function fileParamOf(doc, params, name) {
  for (const f of dataFileNames(doc)) {
    const parts = f.split('/');
    const m = PARAM_PART.exec(parts.at(-1));
    if (!m || m[2] !== name) continue;
    const dir = fillParams(parts.slice(0, -1).join('/'), params);
    return { dir: dir.includes('${param:') ? null : dir, before: m[1], after: m[3] };
  }
  return null;
}
// Whether the data file a case data names is in the package
const fileMissing = (doc, params, name) => {
  const t = fileParamOf(doc, params, name);
  return !!(t && t.dir && params[name] !== '' && !fs.existsSync(path.join(ROOT, t.dir, `${t.before}${params[name]}${t.after}`)));
};
/**
 * A data file the PO dropped into the window (from anywhere on the computer) is copied into the folder of the package
 * where the case looks for it (testdata/dat/<PRODUCT>/), so that core still only reads files of DATA_DIR and the file
 * can be chosen from the list in later runs. A file of that name that is already there is never replaced: the same
 * file is simply chosen, another one has to be renamed. Returns the value of the case data, or throws why not.
 */
function adoptDataFile(doc, params, name, src) {
  const t = fileParamOf(doc, params, name);
  if (!t) throw new Error(`${name} does not name a data file`);
  if (!t.dir) throw new Error('Choose the folder of the file first');
  if (!fs.statSync(src).isFile()) throw new Error(`${src} is a folder, not a file`);
  const file = path.basename(src);
  if (!file.startsWith(t.before) || !file.endsWith(t.after) || file.length <= t.before.length + t.after.length) {
    throw new Error(`The file name must ${t.before ? `start with "${t.before}"${t.after ? ' and ' : ''}` : ''}${t.after ? `end with "${t.after}"` : ''}`);
  }
  const base = path.join(ROOT, DATA_DIR);
  const dest = path.resolve(ROOT, t.dir, file);
  if (!dest.startsWith(base + path.sep)) throw new Error(`Data files must be inside ${DATA_DIR}`);
  const rel = `${t.dir}/${file}`;
  if (fs.existsSync(dest)) {
    if (!fs.readFileSync(dest).equals(fs.readFileSync(src))) {
      throw new Error(`${rel} is already in the package and is a different file: rename yours, or choose that one from the list`);
    }
    console.log(`  ${rel} is already in the package (the same file): it is chosen`);
  } else if (path.resolve(src) !== dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`  Copied ${file} to ${t.dir}/ (it stays in the package and can be chosen from the list later)`);
  }
  return file.slice(t.before.length, file.length - t.after.length);
}
// A case whose data file can be chosen by the PO (or dropped into the window): a missing file of the case file is no
// reason to refuse it before anything is asked
const choosesDataFile = (doc) => dataFileNames(doc).some((f) => PARAM_PART.test(f.split('/').at(-1)));
// Why the case cannot run with this data because a data file is missing, or ''
function missingFileProblem(chosen, params) {
  try { checkCase(chosen, params); return ''; } catch (e) { return /^File to upload was not found/.test(e.message) ? String(e.message).replace(/ \(expected at .*\)$/, '') : ''; }
}

// Fails when this runner cannot run the case, before anything is asked or opened
function checkCase({ file, doc }, params) {
  if (!doc || !Array.isArray(doc.steps)) throw new Error(`${path.basename(file)} is not a case file (it has no steps)`);
  if (Number(doc.formatVersion) > FORMAT_VERSION) {
    throw new Error(`${path.basename(file)} is case format version ${doc.formatVersion}; this runner supports up to version ${FORMAT_VERSION}. Ask QA for the current UAT-Runner package.`);
  }
  // A file the case uploads or sends to the API that did not come with the package. Its name may hold case data
  // (testdata/dat/${param:product}/${param:datFile}), so the check is repeated with the data of the run once the PO has changed it
  // A step that does not run with this data needs no file (the dat file of a trade that is given, not created)
  const runs = (s) => { try { return !s.when || conditionHolds(s.when, params || paramsOf(doc)); } catch { return true; } };
  for (const s of doc.steps.filter(runs)) for (const f of dataFilesOf(s, params || paramsOf(doc))) resolveDataFile(ROOT, f);
  const problem = distinctProblem(doc, params || paramsOf(doc));
  if (problem) throw new Error(`${path.basename(file)}: ${problem}`);
}

// Settings the runner decides itself: whatever config.local.json says, a replay runs with these values, and they are
// neither shown nor offered for change. The risk calculation always reaches the system: a replay is an acceptance
// run. (QA's Playwright run still reads riskEngine from its config and may mock it.)
const FIXED_SETTINGS = { riskEngine: 'real' };

// What askSettings (and runCase / runBatch after it) returns when the PO goes back to the case list instead of
// running: Esc in a list, B at a typed prompt. Nothing has been started then, and no evidence folder written
const BACK = Symbol('back');
const isBack = (answer) => /^b(ack)?$/i.test(String(answer).trim());

// The local settings the cases need, without the fixed ones. For several cases: each setting once, the API address
// first as in a case file
function requiredOf(list) {
  const asked = (keys) => (keys || []).filter((k) => !(k in FIXED_SETTINGS));
  if (list.length === 1) return asked(list[0].doc.requiredConfig);
  const all = [...new Set(list.flatMap((c) => asked(c.doc.requiredConfig)))];
  return [...all.filter((k) => k === 'apiBaseUrl'), ...all.filter((k) => k !== 'apiBaseUrl')];
}

/**
 * Everything that is asked before a run: shows the settings (and, for a single case, its case data), lets the PO
 * change them and asks for what is missing. Several cases are asked once, for the settings they need together.
 * Returns the case data to run with and the function that asks for a setting a step turns out to need, or BACK
 * when the PO goes back to the case list.
 */
async function askSettings(list, config) {
  const single = list.length === 1 ? list[0].doc : null;
  const allRequired = requiredOf(list);
  const toSave = {}; // non-secret values typed in during this run, offered for saving afterwards
  const get = (key) => getCfg(config, key);
  const set = (key, v) => setCfg(config, key, v);

  // Ask the PO at run time for missing config (e.g. passwords); kept in memory only
  const askConfig = async (key) => {
    const v = isSecret(key)
      ? await askHidden(`Enter ${key} (input is hidden): `)
      : await ask(key === 'apiBaseUrl' ? 'Enter the API address, with its path prefix (e.g. https://xxx:port/api/v1): ' : `Enter ${key}: `);
    set(key, v);
    if (!isSecret(key) && v !== '') toSave[key] = v;
    return v;
  };

  // The PO can change the case data of a single case for this run; the case file itself is never modified.
  // Several cases run with the data of their own files: the same name can mean another value in each of them.
  const params = single ? paramsOf(single) : {};
  const showData = (v) => showPlaceholders(v); // a value that points at local config is shown by its name

  // When settings are already provided, show them and let the PO switch environment or account without editing
  // any file. config is the same object for every run of this window, so a change stays for the cases run after it.
  const hasSettings = ['baseUrl', ...allRequired.filter((k) => !isSecret(k))].some((k) => !isEmpty(get(k)));
  const secrets = allRequired.filter(isSecret);
  // case data the case may give a value itself (the ID of a trade it otherwise creates): the PO may enter one or not
  const optional = single ? optionalParamsOf(single.steps) : [];
  // With such a value given, what only creating it needs is left out (notNeededOf); the lists below follow the
  // current case data, so they change when the PO enters or removes a trade ID
  const notNeeded = () => (single ? notNeededOf(single, params) : { params: new Set(), config: new Set() });
  const required = () => allRequired.filter((k) => !notNeeded().config.has(k));
  const settingKeys = () => (hasSettings ? ['baseUrl', ...required()] : []);
  // the optional case data first: whether the case creates its trade decides what else it needs
  const paramNames = () => [...optional.filter((n) => n in params), ...Object.keys(params).filter((n) => !optional.includes(n))]
    .filter((n) => !notNeeded().params.has(n));
  // a value that is still to be entered is asked for anyway
  const changeable = () => paramNames().filter((n) => params[n] !== '' || optional.includes(n));
  // values that name a data file, in the order of the path: what can be chosen for the file depends on the folder
  // that was chosen before it
  const ordered = single ? choiceOrder(single) : [];
  // What the PO can change is numbered, the settings first and the case data after them: a number at the prompt
  // changes that one value, and the lists are shown again
  const numbered = [];
  const renumber = () => numbered.splice(0, numbered.length, ...settingKeys().map((key) => ({ key })), ...changeable().map((param) => ({ param })));
  renumber();
  // On a console that can show a list operated with the keyboard, the value is picked with the arrow keys instead
  const keys = useKeys();
  const no = (i) => (keys ? '' : `${String(i + 1).padStart(numbered.length > 9 ? 2 : 1)}. `);
  const settingText = (k) => (isEmpty(get(k)) ? (isSecret(k) ? '(to be typed in below)' : '(not set)') : isSecret(k) ? '****** (typed in earlier in this window)' : get(k));
  const paramText = (k) => (params[k] !== '' ? `${showData(params[k])}${single && fileMissing(single, params, k) ? '  (not in this package: choose another one, or drop one into this window)' : ''}`
    : optional.includes(k) ? '(empty: the case creates a new one)' : '(to be entered below)');
  const show = () => {
    if (hasSettings) {
      console.log('\nSettings for this run:');
      // a password is listed too, masked: one typed in for an earlier case of this window is used without asking,
      // its number lets the PO type it again; one that is not set is asked for below
      settingKeys().forEach((k, i) => console.log(`  ${no(i)}${k}: ${settingText(k)}`));
    }
    if (paramNames().length) {
      console.log('\nCase data:');
      for (const k of paramNames()) {
        const i = numbered.findIndex((e) => e.param === k);
        console.log(`  ${i < 0 ? ' '.repeat(no(0).length) : no(i)}${k}: ${paramText(k)}`);
      }
    }
  };

  const changeSetting = async (k) => {
    if (isSecret(k)) {
      // A password is not shown, but it can be typed again: the one of an earlier run in this window is still in use,
      // also when that run failed on it
      const v = await askHidden(isEmpty(get(k)) ? `  ${k} (input is hidden): ` : `  ${k} [Enter keeps the current one; input is hidden]: `);
      if (v !== '') set(k, v);
      return;
    }
    const cur = get(k);
    const v = await ask(`  ${k} [${isEmpty(cur) ? 'not set' : cur}] (Enter keeps it): `);
    if (v === '' || v === cur) return;
    set(k, v);
    toSave[k] = v;
    // A saved password belongs to the old environment/account: drop it so it is asked for again
    // instead of being sent to the wrong place.
    const scope = k === 'baseUrl' ? '' : k.slice(0, k.lastIndexOf('.') + 1);
    for (const s of secrets) if (s.startsWith(scope)) { set(s, ''); toSave[s] = ''; }
  };

  // case data that decides a part of a request (the trade type): the case file lists the values it can have
  const fixed = single ? paramChoicesOf(single.steps) : {};
  // a data file dropped into the window (the console types its path) for case data that names one
  const dropsFile = (k) => !!(single && fileParamOf(single, params, k));
  const useDropped = (k, text) => {
    const src = droppedPath(text);
    if (!src) { console.log('  There is no file with this path.'); return false; }
    try { params[k] = adoptDataFile(single, params, k, src); return true; } catch (e) { console.log(`  ${e.message}.`); return false; }
  };
  const changeParam = async (k) => {
    if (optional.includes(k)) return chooseGiven(k);
    const inPath = ordered.includes(k);
    const list = inPath ? choicesOf(single, params)[k] : fixed[k] || null;
    const heading = (valid) => (inPath
      ? `${k}: the values that have a data file in this package${valid ? '' : ` for the new ${ordered[ordered.indexOf(k) - 1] || 'values'}`}`
      : `${k}: the values this case can be run with`);
    if (!list || !list.length) {
      for (;;) {
        const v = await ask(`  ${k} [${showData(params[k])}] (Enter keeps it${dropsFile(k) ? '; or drop a file into this window and press Enter' : ''}): `);
        if (dropsFile(k) && looksLikePath(v.trim())) { if (useDropped(k, v) || state.inputEnded) return; continue; }
        if (v !== '') params[k] = v;
        return;
      }
    }
    // a value that needs its data file: the PO picks one of those that came with the package. The current
    // value can be kept only while it is one of them (it is not after the folder before it was changed)
    const valid = list.includes(params[k]);
    // a data file the PO may drop instead is always offered as a list, also when the package has only one
    if (!valid && list.length === 1 && !dropsFile(k)) {
      console.log(`  ${k}: ${list[0]}  (the only data file of that ${ordered[ordered.indexOf(k) - 1] || 'value'})`);
      params[k] = list[0];
    } else if (keys) {
      const rows = [{ text: heading(valid) },
        ...list.map((v) => ({ text: `  ${v}${v === params[k] ? '  (current)' : ''}`, value: v }))];
      const drops = dropsFile(k);
      const hint = `Up/Down: move   Enter: choose${valid ? '   Esc: keep the current value' : ''}${drops ? '   Or drop a file into this window' : ''}`;
      // without a value that can be kept, Esc has nothing to go back to: the list is shown again
      for (let r = {}; r.value === undefined && !(r.esc && valid);) {
        r = await pickRow({ rows, start: params[k], hint, typing: drops });
        if (r.value !== undefined) params[k] = r.value;
        if (r.typed !== undefined && useDropped(k, r.typed)) break;
      }
      console.log(`  ${k}: ${params[k]}`);
    } else {
      console.log(`  ${heading(valid)}`);
      // values that are numbers themselves (allocationWays 2, 3, 4) are not numbered: a number is then the value
      const byName = list.some((x) => /^\d+$/.test(x));
      const what = byName ? 'value' : 'number or name';
      list.forEach((v, i) => console.log(`    ${byName ? '-' : `${i + 1}.`} ${v}${v === params[k] ? '  (current)' : ''}`));
      const drop = dropsFile(k) ? ', or drop a file into this window and press Enter' : '';
      for (;;) {
        const v = (await ask(valid ? `  ${k} [${showData(params[k])}], ${what} (Enter keeps it${drop}): ` : `  ${k}, ${what}${drop}: `)).trim();
        if (drop && looksLikePath(v)) { if (useDropped(k, v) || state.inputEnded) break; continue; }
        const picked = /^\d+$/.test(v) && !byName ? list[Number(v) - 1] : list.find((x) => x.toLowerCase() === v.toLowerCase());
        if (picked) params[k] = picked;
        if ((v === '' && valid) || picked || state.inputEnded) break;
        const above = byName ? 'values' : 'numbers or names';
        console.log(v === '' ? `    Type one of the ${above} above.`
          : `    "${v}" ${inPath ? 'has no data file' : 'is not one of them'}: type one of the ${above} above${valid ? `, or press Enter to keep ${params[k]}` : ''}.`);
      }
    }
    // what follows in the path (the file after its folder) may no longer exist for the new value: chosen again
    for (const next of inPath ? ordered.slice(ordered.indexOf(k) + 1) : []) {
      const l = choicesOf(single, params)[next];
      if (l && l.length && !l.includes(params[next])) { await changeParam(next); break; }
    }
  };

  // Case data the case gives a value itself when it is empty (tradeId): the PO first chooses whether the case creates
  // a new one or runs on an existing one, whose ID is then typed in. Only for a new one is the data it is created
  // with (and the account that approves it) listed.
  const noun = (k) => k.replace(/Id$/, '') || k;
  // first: the question that opens the settings, where Esc (or B) goes back to the case list; asked again from the
  // list of case data, Esc keeps the current choice
  const chooseGiven = async (k, first = false) => {
    const NEW = 'new';
    const OLD = 'existing';
    const options = [
      { value: NEW, text: `Create a new ${noun(k)} (the case creates it through the API)` },
      { value: OLD, text: `Use an existing ${noun(k)} (type its ${k})` },
    ];
    const current = params[k] === '' ? NEW : OLD;
    let pick;
    if (keys) {
      const r = await pickRow({ rows: [{ text: `Which ${noun(k)} does the case run on?` }, ...options.map((o) => ({ text: `  ${o.text}${o.value === current ? '  (current)' : ''}`, value: o.value }))],
        start: current, hint: `Up/Down: move   Enter: choose   Esc: ${first ? 'back to the case list' : 'keep the current choice'}` });
      if (r.esc && first) return BACK;
      pick = r.value || current;
    } else {
      console.log(`\nWhich ${noun(k)} does the case run on?`);
      options.forEach((o, i) => console.log(`  ${i + 1}. ${o.text}${o.value === current ? '  (current)' : ''}`));
      for (;;) {
        const v = (await ask(`Type 1 or 2 (Enter keeps ${options.findIndex((o) => o.value === current) + 1}${first ? ', B goes back to the case list' : ''}): `)).trim();
        if (first && isBack(v)) return BACK;
        pick = v === '' ? current : v === '1' ? NEW : v === '2' ? OLD : null;
        if (pick || state.inputEnded) break;
        console.log(first ? '  Type 1 or 2, or B to go back to the case list.' : '  Type 1 or 2.');
      }
      pick = pick || current;
    }
    if (pick === NEW) { params[k] = ''; console.log(`  ${k}: a new one is created`); return; }
    for (;;) {
      const v = (await ask(params[k] === '' ? `  Enter ${k}: ` : `  ${k} [${params[k]}] (Enter keeps it): `)).trim();
      if (v !== '') params[k] = v;
      if (params[k] !== '') { console.log(`  ${k}: ${params[k]} (the data to create a new one is not needed)`); return; }
      if (state.inputEnded) { console.log(`  No ${k} was entered: a new one is created`); return; }
    }
  };
  for (const k of optional.filter((n) => n in params)) {
    if (await chooseGiven(k, true) === BACK) return BACK;
    renumber();
  }

  if (!keys || !numbered.length) show();
  if (!single && list.some((c) => Object.keys(c.doc.params || {}).length)) {
    console.log('\nCase data: each case runs with the values of its own case file. To change a value, run that case on its own.');
  }
  // Step by step (the run stops before each Given / When / Then block and each substep, so the PO can look at the
  // page) is not offered on the screen: S at the prompt below turns it on
  let stepByStep = false;
  // With the keyboard: the same lines as a list, Up / Down move, Enter on a value changes it, Enter on the last row
  // goes on. The row that is highlighted first is the last one, so that plain Enter still starts the run.
  if (keys && numbered.length) {
    const RUN = {};
    const hint = 'Up/Down: move   Enter: change the highlighted value, or continue   Esc: back to the case list   Ctrl+C: close';
    let told = false;
    console.log('');
    for (;;) {
      const rows = [];
      renumber();
      if (hasSettings) rows.push({ text: 'Settings for this run:' }, ...settingKeys().map((k, i) => ({ text: `  ${k}: ${settingText(k)}`, value: numbered[i] })), { text: '' });
      if (paramNames().length) {
        rows.push({ text: 'Case data:' }, ...paramNames().map((k) => {
          const e = numbered.find((x) => x.param === k);
          return e ? { text: `  ${k}: ${paramText(k)}`, value: e } : { text: `    ${k}: ${paramText(k)}` };
        }), { text: '' });
      }
      rows.push({ text: single ? 'Run the case' : `Run the ${list.length} cases`, value: RUN });
      const r = await pickRow({ rows, start: RUN, hint, keys: ['s'] });
      if (r.esc) return BACK;
      if ((r.key === 's' || r.value === RUN) && single && distinctProblem(single, params)) {
        console.log(`${distinctProblem(single, params)}. Change one of them.\n`);
        continue;
      }
      if ((r.key === 's' || r.value === RUN) && single && missingFileProblem(list[0], params)) {
        console.log(`${missingFileProblem(list[0], params)}. Choose another one, or drop one into this window.\n`);
        continue;
      }
      if (r.key === 's') stepByStep = true;
      if (r.key === 's' || r.value === RUN) break;
      if (r.value.param && !told) { console.log('A change of case data applies to this run only.'); told = true; }
      if (r.value.key) await changeSetting(r.value.key);
      else await changeParam(r.value.param);
      console.log('');
    }
    // the list is erased when it ends: what the run starts with stays on the screen
    show();
    console.log('');
  }
  for (let changed = false; numbered.length && !keys;) {
    if (changed) { renumber(); show(); }
    changed = false;
    const range = numbered.length === 1 ? 'type 1 to change it' : `type a number (1-${numbered.length}) to change that value`;
    const answer = (await ask(`\nPress Enter to continue${hasSettings ? ' with these settings' : ''}, ${range}, or B to go back to the case list: `)).trim().toLowerCase();
    if (isBack(answer)) return BACK;
    if ((answer === '' || answer === 's') && single && distinctProblem(single, params)) {
      if (state.inputEnded) throw new Error(distinctProblem(single, params));
      console.log(`  ${distinctProblem(single, params)}. Type the number of one of them to change it.`);
      continue;
    }
    if ((answer === '' || answer === 's') && single && missingFileProblem(list[0], params)) {
      if (state.inputEnded) throw new Error(missingFileProblem(list[0], params));
      console.log(`  ${missingFileProblem(list[0], params)}. Type its number to choose another one, or to drop one into this window.`);
      continue;
    }
    if (answer === '') break;
    if (answer === 's') { stepByStep = true; break; }
    // several numbers at once are changed one after another
    const picked = answer.split(/[\s,]+/).filter(Boolean).map((t) => (/^\d+$/.test(t) ? numbered[Number(t) - 1] : undefined));
    if (picked.includes(undefined)) {
      if (state.inputEnded) break;
      console.log(`  "${answer}" is not a number of the list${numbered.length > 1 ? `: type a number from 1 to ${numbered.length}` : ''}, or press Enter to continue.`);
      continue;
    }
    if (picked.some((e) => e.param)) console.log('\nA change of case data applies to this run only.');
    for (const e of picked) {
      if (e.key) await changeSetting(e.key);
      else await changeParam(e.param);
    }
    if (state.inputEnded) break;
    changed = true;
  }

  // Case data the case file leaves empty must be entered: the case has nothing to work on without it
  for (const k of paramNames().filter((n) => params[n] === '' && !optional.includes(n))) {
    while (params[k] === '') {
      params[k] = (await ask(`Enter ${k}: `)).trim();
      if (params[k] === '' && state.inputEnded) throw new Error(`Case data ${k} was not entered`);
    }
  }

  // Collect all required config up front so the run does not stop halfway
  if (!config.baseUrl) {
    config.baseUrl = await ask('Enter the system address (e.g. https://xxx:8088): ');
    if (config.baseUrl) toSave.baseUrl = config.baseUrl;
  }
  for (const key of required()) {
    if (isEmpty(get(key))) await askConfig(key);
  }

  // Offer to remember what was typed in, so the next run starts from it. Passwords are never written:
  // the only secret entries in toSave are blanked ones, which remove a password that no longer matches.
  if (Object.keys(toSave).some((k) => !isSecret(k))) {
    const name = path.basename(config.__file);
    const answer = await ask(`\nSave the address and account to ${name} for next time? Passwords are not saved. (y/N): `);
    if (/^y(es)?$/i.test(answer)) {
      try {
        saveConfig(config.__file, toSave);
        console.log(`  Saved to ${config.__file}`);
      } catch (e) {
        console.log(`  Could not save (${String(e.message).split('\n')[0]}); the settings still apply while this window is open.`);
      }
    } else {
      console.log('  Not saved; the settings apply until this window is closed.');
    }
  }
  return { params, askConfig, stepByStep };
}

module.exports = { BACK, isBack, FIXED_SETTINGS, setCfg, paramsOf, caseDataOf, askedParamsOf, checkCase, choosesDataFile, askSettings };
