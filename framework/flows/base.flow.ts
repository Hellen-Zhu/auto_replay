// Base class of every flow.
// Flow layer: business steps composed from the atomic operations of pages and components. Each flow method is one
// or more BDD steps (Given / When / Then) as they appear in the report. A flow holds no locators and never calls
// ui.click / ui.fill itself. Flows are grouped by business domain, one file per domain.

import type { UI } from '../ui';
import type { App } from '../app';

/** The BDD keyword a step is reported with; each flow has a default that a case can override */
export type Keyword = 'Given' | 'When' | 'Then' | 'And' | 'But';

export abstract class BaseFlow {
  protected readonly ui: UI;

  constructor(protected readonly app: App) {
    this.ui = app.ui;
  }
}
