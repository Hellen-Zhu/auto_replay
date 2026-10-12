// Targets: the description of an element in a case file, turned into a Playwright locator or into readable text.

const { showPlaceholders } = require('./values');

/**
 * Turn a target description from the JSON into a Playwright Locator.
 * Supported fields (in priority order): testId / role(+name) / label / placeholder / text / css
 * Extra fields, applied in this order: inner (locate again inside the host element, e.g. the input in a web
 * component's shadow DOM), hasText (keep only the elements that contain this text), nth
 * A row of a list found by a text it shows: { testId: '<list>', inner: 'role=row', hasText: '${var:tradeId}', nth: 0 }
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
  if (target.hasText) loc = loc.filter({ hasText: target.hasText });
  if (target.nth !== undefined && target.nth !== null) loc = loc.nth(target.nth);
  return loc;
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
  const within = (target.inner ? ` >> ${target.inner}` : '') + (target.hasText ? ` containing "${target.hasText}"` : '');
  return showPlaceholders(base + within + (target.nth !== undefined ? ` [${target.nth}]` : ''), vars, params);
}

module.exports = { resolveTarget, describeTarget };
