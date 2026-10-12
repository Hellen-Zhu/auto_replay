// Running one step of a case on the page, and the values it produced.

const { expect } = require('@playwright/test');
const { resolveValue, resolveUrl } = require('./values');
const { resolveTarget } = require('./targets');
const { resolveDataFile } = require('./data-files');
const { clickAndAwait, clickAndCapture, callApi } = require('./requests');

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Execute one step. The step's value may contain placeholders, which are resolved here.
 * Returns the text that was read for a read step or captured by a click, the saved variables (name -> value)
 * for an api step, undefined otherwise.
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
      // button: 'right' opens a context menu, e.g. the action menu of a blotter row; without it, a normal click
      if (step.request && step.capture) throw new Error('A click cannot have both request and capture');
      if (step.request) return clickAndAwait(page, resolveTarget(page, step.target), step, ctx, timeout);
      if (step.capture) return clickAndCapture(page, resolveTarget(page, step.target), step.capture, ctx, timeout, step.button);
      await resolveTarget(page, step.target).click({ timeout, button: step.button });
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
    case 'expectHidden':
      // Not on the page counts as hidden too: a dialog that was closed, a menu entry the user is not offered
      await expect(resolveTarget(page, step.target)).toBeHidden({ timeout });
      return;
    case 'expectEnabled':
      await expect(resolveTarget(page, step.target)).toBeEnabled({ timeout });
      return;
    case 'expectDisabled':
      await expect(resolveTarget(page, step.target)).toBeDisabled({ timeout });
      return;
    case 'expectValue':
      // What an input, a textarea or a select holds: its text is not part of the page's text, so expectText cannot see it
      await expect(resolveTarget(page, step.target)).toHaveValue(value, { timeout });
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
    case 'api':
      return callApi(page, step, value, ctx, timeout);
    default:
      throw new Error(`Unsupported action: ${step.action}`);
  }
}

/**
 * The values a step produced, by variable name: what a read step read, what a click captured from a response,
 * what an api step saved from its response. result is what executeStep returned. Empty for any other step.
 * A run shows them (a new trade's ID above all) so that the data it created can be found in the system afterwards.
 */
function savedValues(step, result) {
  if (step.action === 'read') return { [step.saveAs]: result };
  if (step.capture) return { [step.capture.saveAs]: result };
  if (step.action === 'api') return result || {};
  return {};
}

module.exports = { executeStep, savedValues };
