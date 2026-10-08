// Base class of every page object.
// A page object owns the locators of one page and exposes atomic operations: one thing a user does there
// (fill a field, click a button) or one check. It acts only through ui.xxx, so everything is recorded into the
// case file. Sequences of operations, and anything that spans pages, belong to the flow layer.

import type { UI } from '../ui';

export abstract class BasePage {
  constructor(protected readonly ui: UI) {}
}
