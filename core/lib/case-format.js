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
const FORMAT_VERSION = 12;

/**
 * The actions of a case file as one flat list, which is what runs: a nested entry (version 9) gives its actions, the
 * first one carrying the step line as its title, as a file up to version 8 has it. A flat list is returned as it is.
 * A substep entry among those actions (version 10) gives its actions in the same way, the first one carrying the substep.
 */
function flatSteps(steps) {
  if (!Array.isArray(steps) || !steps.some((s) => s && Array.isArray(s.actions))) return steps;
  return steps.flatMap((group) => {
    if (!group || !Array.isArray(group.actions)) throw new Error('A case file cannot mix nested steps ({ step, actions }) with plain actions');
    const actions = group.actions.flatMap((entry) =>
      entry && Array.isArray(entry.actions) ? entry.actions.map((action, i) => (i === 0 && entry.substep ? { substep: entry.substep, ...action } : action)) : [entry]);
    return actions.map((action, i) => (i === 0 && group.step ? { title: group.step, ...action } : action));
  });
}

/** A case file as the runner works on it: whatever its version, steps is the flat list of actions */
// (a file of a newer version is left alone: the runner refuses it by its version)
const readCase = (doc) => (doc && Array.isArray(doc.steps) && !(Number(doc.formatVersion) > FORMAT_VERSION) ? { ...doc, steps: flatSteps(doc.steps) } : doc);

/** The checks that came with version 8: a case that uses one cannot be run by an older runner */
const V8_ACTIONS = ['expectHidden', 'expectEnabled', 'expectDisabled', 'expectValue'];

module.exports = { FORMAT_VERSION, V8_ACTIONS, flatSteps, readCase };
