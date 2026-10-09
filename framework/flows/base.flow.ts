// Base class of every flow.
// Flow layer: business steps composed from the atomic operations of pages and components. Each flow method is one
// or more BDD steps (Given / When / Then) as they appear in the report. A flow holds no locators and never calls
// ui.click / ui.fill itself. Flows are grouped by business domain, one file per domain.

import type { Params, UI } from '../ui';
import type { App } from '../app';

/** The BDD keyword a step is reported with; each flow has a default that a case can override */
export type Keyword = 'Given' | 'When' | 'Then' | 'And' | 'But';

export abstract class BaseFlow {
  protected readonly ui: UI;

  constructor(protected readonly app: App) {
    this.ui = app.ui;
  }

  /**
   * The data of a case as parameters: const p = this.params(data); p.xxx is then recorded as ${param:xxx}, so the
   * value sits in the params block of the case file where the PO can see and change it. Read data.xxx directly
   * for a field that decides what the flow does: that one is recorded as it is.
   */
  protected params<T extends object>(data: T): Params<T> {
    return this.ui.params(data);
  }

  /**
   * A value that only the person who runs the case knows (the ID of an existing trade): it is recorded as
   * ${param:name} wherever it is used, and the runner asks the PO for it before the run. Returns the value.
   */
  protected input(name: string, value: string): string {
    return this.ui.input(name, value);
  }

  /**
   * A value that decides what the case works on (the product) as case data the PO can change: it is recorded as
   * ${param:name} wherever a step uses it, and the case file keeps the value given here. Returns the value.
   */
  protected caseData(name: string, value: string): string {
    return this.ui.param(name, value);
  }
}
