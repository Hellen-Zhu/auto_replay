// What a run needs before it starts: the settings and case data that are asked for, and the checks of a case file.

const fs = require('fs');
const path = require('path');
const { FORMAT_VERSION, showPlaceholders, resolveDataFile, dataFilesOf } = require('../../core/actions');
const { ROOT } = require('./paths');
const state = require('./state');
const { ask, askHidden } = require('./console');

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
// The data a run used, for the report: a value that points at local config is shown by its name, and a value the PO
// changed for the run comes with the one of the case file
const caseDataOf = (doc, params) => Object.keys(params).map((name) => {
  const original = String(doc.params[name]);
  // a value that was entered for the run (empty in the case file) is not a change
  return { name, value: showPlaceholders(params[name]), ...(params[name] !== original && original !== '' ? { changedFrom: showPlaceholders(original) } : {}) };
});
// Case data without a value in the case file (version 6): what only the PO knows, e.g. the ID of an existing trade
const askedParamsOf = (doc) => Object.keys(doc.params || {}).filter((k) => String(doc.params[k]) === '');

// Case data that names a data file (data/${param:product}.dat) can only be what has such a file in the package:
// name -> the values to choose from, in alphabetical order
function choicesOf(doc) {
  const out = {};
  for (const s of doc.steps) for (const f of dataFilesOf(s)) {
    const m = /^([^$]*)\$\{param:([^}]+)\}([^$]*)$/.exec(String(f));
    if (!m) continue;
    const [, before, name, after] = m;
    const cut = before.lastIndexOf('/') + 1;
    let files = [];
    try { files = fs.readdirSync(path.join(ROOT, before.slice(0, cut))); } catch { /* no such folder: nothing to choose */ }
    const found = files.filter((n) => n.startsWith(before.slice(cut)) && n.endsWith(after) && n.length > before.length - cut + after.length)
      .map((n) => n.slice(before.length - cut, n.length - after.length)).sort();
    out[name] = out[name] ? out[name].filter((v) => found.includes(v)) : found;
  }
  return out;
}

// Fails when this runner cannot run the case, before anything is asked or opened
function checkCase({ file, doc }, params) {
  if (!doc || !Array.isArray(doc.steps)) throw new Error(`${path.basename(file)} is not a case file (it has no steps)`);
  if (Number(doc.formatVersion) > FORMAT_VERSION) {
    throw new Error(`${path.basename(file)} is case format version ${doc.formatVersion}; this runner supports up to version ${FORMAT_VERSION}. Ask QA for the current UAT-Runner package.`);
  }
  // A file the case uploads or sends to the API that did not come with the package. Its name may hold case data
  // (data/${param:product}.dat), so the check is repeated with the data of the run once the PO has changed it
  for (const s of doc.steps) for (const f of dataFilesOf(s, params || paramsOf(doc))) resolveDataFile(ROOT, f);
}

// The local settings the cases need. For several cases: each setting once, the API address first as in a case file
function requiredOf(list) {
  if (list.length === 1) return list[0].doc.requiredConfig || [];
  const all = [...new Set(list.flatMap((c) => c.doc.requiredConfig || []))];
  return [...all.filter((k) => k === 'apiBaseUrl'), ...all.filter((k) => k !== 'apiBaseUrl')];
}

/**
 * Everything that is asked before a run: shows the settings (and, for a single case, its case data), lets the PO
 * change them and asks for what is missing. Several cases are asked once, for the settings they need together.
 * Returns the case data to run with and the function that asks for a setting a step turns out to need.
 */
async function askSettings(list, config) {
  const single = list.length === 1 ? list[0].doc : null;
  const required = requiredOf(list);
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
  const paramNames = Object.keys(params);
  const showData = (v) => showPlaceholders(v); // a value that points at local config is shown by its name

  // When settings are already provided, show them and let the PO switch environment or account without editing
  // any file. config is the same object for every run of this window, so a change stays for the cases run after it.
  const editable = ['baseUrl', ...required.filter((k) => !isSecret(k))];
  const hasSettings = editable.some((k) => !isEmpty(get(k)));
  if (hasSettings) {
    console.log('\nSettings for this run:');
    // a password is listed too, masked: one typed in for an earlier case of this window is used without asking,
    // C lets the PO type it again; one that is not set is asked for below
    for (const k of ['baseUrl', ...required]) console.log(`  ${k}: ${isEmpty(get(k)) ? (isSecret(k) ? '(to be typed in below)' : '(not set)') : isSecret(k) ? '****** (typed in earlier in this window)' : get(k)}`);
  }
  if (paramNames.length) {
    console.log('\nCase data:');
    for (const k of paramNames) console.log(`  ${k}: ${params[k] === '' ? '(to be entered below)' : showData(params[k])}`);
  }
  if (!single && list.some((c) => Object.keys(c.doc.params || {}).length)) {
    console.log('\nCase data: each case runs with the values of its own case file. To change a value, run that case on its own.');
  }
  // Step by step (the run stops before each Given / When / Then block and each substep, so the PO can look at the
  // page) is not offered on the screen: S at the prompt below turns it on
  let stepByStep = false;
  const changeable = paramNames.filter((n) => params[n] !== ''); // a value that is still to be entered is asked for anyway
  if (hasSettings || changeable.length) {
    const choices = [hasSettings && 'C to change the environment or account', changeable.length && 'D to change the case data'].filter(Boolean).join(', ');
    const answer = (await ask(`\nPress Enter to continue${hasSettings ? ' with these settings' : ''}, or type ${choices}: `)).toLowerCase();
    const chose = (letter) => /^[cds\s,+]+$/.test(answer) && answer.includes(letter);
    stepByStep = chose('s');
    if (hasSettings && chose('c')) {
      console.log('\nType a new value, or just press Enter to keep the current one.');
      const secrets = required.filter(isSecret);
      for (const k of editable) {
        const cur = get(k);
        const v = await ask(`  ${k} [${isEmpty(cur) ? 'not set' : cur}]: `);
        if (v === '' || v === cur) continue;
        set(k, v);
        toSave[k] = v;
        // A saved password belongs to the old environment/account: drop it so it is asked for again
        // instead of being sent to the wrong place.
        const scope = k === 'baseUrl' ? '' : k.slice(0, k.lastIndexOf('.') + 1);
        for (const s of secrets) if (s.startsWith(scope)) { set(s, ''); toSave[s] = ''; }
      }
      // A password is not shown, but it can be typed again: the one of an earlier run in this window is still in use,
      // also when that run failed on it. A password that was just dropped above is asked for below anyway.
      for (const s of secrets) {
        if (isEmpty(get(s))) continue;
        const v = await askHidden(`  ${s} [Enter keeps the current one; input is hidden]: `);
        if (v !== '') set(s, v);
      }
    }
    if (changeable.length && chose('d')) {
      console.log('\nType a new value, or just press Enter to keep the current one. Changes apply to this run only.');
      const choices = choicesOf(single);
      for (const k of changeable) {
        const list = choices[k];
        if (!list || !list.length) {
          const v = await ask(`  ${k} [${showData(params[k])}]: `);
          if (v !== '') params[k] = v;
          continue;
        }
        // a value that needs its data file: the PO picks one of those that came with the package
        console.log(`  ${k}: the values that have a data file in this package`);
        list.forEach((v, i) => console.log(`    ${i + 1}. ${v}${v === params[k] ? '  (current)' : ''}`));
        for (;;) {
          const v = (await ask(`  ${k} [${showData(params[k])}], number or name: `)).trim();
          const picked = /^\d+$/.test(v) ? list[Number(v) - 1] : list.find((x) => x.toLowerCase() === v.toLowerCase());
          if (picked) params[k] = picked;
          if (v === '' || picked || state.inputEnded) break;
          console.log(`    "${v}" has no data file: type one of the numbers or names above, or press Enter to keep ${params[k]}.`);
        }
      }
    }
  }

  // Case data the case file leaves empty must be entered: the case has nothing to work on without it
  for (const k of paramNames.filter((n) => params[n] === '')) {
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
  for (const key of required) {
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

module.exports = { setCfg, paramsOf, caseDataOf, askedParamsOf, checkCase, askSettings };
