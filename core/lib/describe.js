// A step as one readable line, for the console and the reports.

const { showPlaceholders } = require('./values');
const { describeTarget } = require('./targets');
const { dataFilesOf } = require('./data-files');
const { isMocked } = require('./requests');

/**
 * One-line readable description of a step, used in logs and reports; pass the variables read so far and
 * the case data (params) to show their values, and the local config to say that a request is answered by a mock
 */
function describeStep(step, vars, params, config) {
  const t = describeTarget(step.target, vars, params);
  const v = step.secret ? '******' : typeof step.value === 'string' ? showPlaceholders(step.value, vars, params) : step.value;
  switch (step.action) {
    case 'goto': return `Open page ${v}`;
    case 'fill': return `Type ${v} into ${t}`;
    case 'click': {
      const click = step.button === 'right' ? 'Right-click' : 'Click';
      if (step.request) {
        return `${click} ${t} and wait for the answer of ${String(step.request.method || 'GET').toUpperCase()} ${showPlaceholders(step.request.url, vars, params)}`
          + (config && isMocked(step, config) ? ` (MOCKED: ${step.request.setting} is "mock")` : '');
      }
      return step.capture ? `${click} ${t} and save ${step.capture.field} from the response as ${step.capture.saveAs}` : `${click} ${t}`;
    }
    case 'upload': return `Upload file ${v} to ${t}`;
    case 'press': return `Press ${v} on ${t}`;
    case 'select': return `Select ${v} in ${t}`;
    case 'read': return `Read ${t} and save as ${step.saveAs}`;
    case 'expectVisible': return `Verify ${t} is visible`;
    case 'expectHidden': return `Verify ${t} is not shown`;
    case 'expectEnabled': return `Verify ${t} is enabled`;
    case 'expectDisabled': return `Verify ${t} is disabled`;
    case 'expectValue': return `Verify ${t} holds the value ${v}`;
    case 'expectText': return `Verify ${t} ${step.exact ? 'equals' : 'contains'} ${v}`;
    case 'expectUrl': return `Verify current page is ${v}`;
    case 'wait': return `Wait ${v} ms`;
    case 'api': {
      // Header values are shown like any other text: a config reference by its name, never by its value
      const headers = Object.entries(step.headers || {}).map(([k, h]) => `${k}: ${showPlaceholders(h, vars, params)}`);
      const files = dataFilesOf(step);
      const saved = Object.entries(step.save || {}).map(([name, field]) => `${field} as ${name}`);
      return `Call API ${String(step.method || 'GET').toUpperCase()} ${v}`
        + (headers.length ? ` (${headers.join(', ')})` : '')
        + (files.length ? ` with file ${files.join(', ')}` : '')
        + (saved.length ? ` and save ${saved.join(', ')}` : '');
    }
    default: return step.action;
  }
}

module.exports = { describeStep };
