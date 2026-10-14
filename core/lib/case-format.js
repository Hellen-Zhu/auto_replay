// The case file format: the versions this code can run and the reading of a case file, whatever its version,
// into the flat list of actions that runs.

// Case file versions this code can run: 1 = steps only; 2 = adds the params block and ${param:name};
// 3 = adds hasText in a target and button on a click; 4 = adds the api action; 5 = adds request on a click;
// 6 = adds case data without a value (an empty text in params), which is asked for before the run;
// 7 = adds case data in the name of a data file and in a step line;
// 8 = adds the checks expectHidden, expectEnabled, expectDisabled and expectValue;
// 9 = the steps are nested: one entry per step line of the scenario, { step, actions }, instead of a flat list of
// actions with the line as the title of the first action of its group;
// 10 = the substeps are nested too: inside a step's actions, { substep, actions } instead of the substep as a field
// of the first action of its group
// 11 = adds a part of an api step's JSON that depends on case data: { byParam, choices, values } (values.js)
// 12 = adds base "origin" on an api step: its path is joined to the server of apiBaseUrl, without the prefix
// 13 = adds a condition on a substep entry: { substep, when: { param, choices, in }, actions } runs only for those
// values of that case data (values.js); in the flat list every action of the substep carries it
// 14 = an api step may name its request instead of holding it: { action: 'api', ref: '<id>' }, the request being the
// file requests/<id>.json of the package (expandRequests below)
// 15 = adds the condition { param, empty: true } (the group runs while that case data is empty) and the action set,
// { action: 'set', param, value }, which gives case data its value at run time: a case on an existing trade
// creates its trade when no trade ID was entered (values.js, execute.js)
// 16 = adds visible on a target: only the visible elements it matches (targets.js)
// 17 = adds the condition { param, filled: true }: the group runs only while that case data has a value, which the
// PO may leave empty (values.js)
const FORMAT_VERSION = 17;

const fs = require('fs');
const path = require('path');

// The folder of the API requests, next to cases/: the case file names a request, the request itself is here, so that
// the PO reading a case file sees what the case does and not the bodies it sends
const REQUESTS_DIR = 'requests';
// What a request file holds, and the name each has in an api step (its path is the step's value)
const REQUEST_FIELDS = { method: 'method', path: 'value', base: 'base', headers: 'headers', body: 'body', multipart: 'multipart', save: 'save', timeout: 'timeout' };

/** An api step's request as the content of its request file */
function requestOf(step) {
  const out = {};
  for (const [field, key] of Object.entries(REQUEST_FIELDS)) if (step[key] !== undefined) out[field] = step[key];
  return out;
}

/**
 * Every api step that names its request (ref) as the full step: the request is read from requests/<ref>.json under
 * rootDir. A step without ref is returned as it is, so a case file that holds its requests (up to version 13) runs as before.
 */
function expandRequests(steps, rootDir) {
  return steps.map((step) => {
    if (!step || step.action !== 'api' || step.ref === undefined) return step;
    const { ref, ...rest } = step;
    if (typeof ref !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(ref)) throw new Error(`The API request "${ref}" of this case is not a valid request name`);
    const file = path.join(rootDir || '.', REQUESTS_DIR, `${ref}.json`);
    if (!fs.existsSync(file)) throw new Error(`The API request ${ref} of this case is missing (${REQUESTS_DIR}/${ref}.json). Ask QA for the current UAT-Runner package.`);
    const request = JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, ''));
    const fields = {};
    for (const [field, key] of Object.entries(REQUEST_FIELDS)) if (request[field] !== undefined) fields[key] = request[field];
    return { ...rest, ...fields, action: 'api' };
  });
}

/**
 * The actions of a case file as one flat list, which is what runs: a nested entry (version 9) gives its actions, the
 * first one carrying the step line as its title, as a file up to version 8 has it. A flat list is returned as it is.
 * A substep entry among those actions (version 10) gives its actions in the same way, the first one carrying the substep;
 * the condition of a substep entry (version 13) is carried by each of its actions.
 */
function flatSteps(steps) {
  if (!Array.isArray(steps) || !steps.some((s) => s && Array.isArray(s.actions))) return steps;
  return steps.flatMap((group) => {
    if (!group || !Array.isArray(group.actions)) throw new Error('A case file cannot mix nested steps ({ step, actions }) with plain actions');
    const actions = group.actions.flatMap((entry) =>
      entry && Array.isArray(entry.actions)
        ? entry.actions.map((action, i) => ({ ...(i === 0 && entry.substep ? { substep: entry.substep } : {}), ...(entry.when ? { when: entry.when } : {}), ...action }))
        : [entry]);
    return actions.map((action, i) => (i === 0 && group.step ? { title: group.step, ...action } : action));
  });
}

/**
 * A case file as the runner works on it: whatever its version, steps is the flat list of actions, each api step with
 * its request (read from requests/ under rootDir, the root of the package)
 */
// (a file of a newer version is left alone: the runner refuses it by its version)
const readCase = (doc, rootDir) => (doc && Array.isArray(doc.steps) && !(Number(doc.formatVersion) > FORMAT_VERSION)
  ? { ...doc, steps: expandRequests(flatSteps(doc.steps), rootDir) } : doc);

/** The checks that came with version 8: a case that uses one cannot be run by an older runner */
const V8_ACTIONS = ['expectHidden', 'expectEnabled', 'expectDisabled', 'expectValue'];

module.exports = { FORMAT_VERSION, V8_ACTIONS, REQUESTS_DIR, flatSteps, requestOf, expandRequests, readCase };
