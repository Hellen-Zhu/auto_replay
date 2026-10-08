// Base class of every page object.
// A page object owns the locators of one page (or one shared component) and exposes what a user can do
// and check there. It acts only through ui.xxx, so everything it does is recorded into the case file.

import type { UI, Target, TargetIn, Val } from '../ui';

export abstract class BasePage {
  constructor(protected readonly ui: UI) {}

  /**
   * An entry of an open OREO dropdown. The entries are not native options: each one is an
   * <sl-menu-item role="menuitem"> whose label is slotted in, with the typed text highlighted in <b>.
   */
  protected dropdownItem(name: Val): TargetIn {
    return { role: 'menuitem', name, exact: true };
  }

  /** Type into a combobox, then pick the matching entry from its dropdown */
  protected async pick(box: Target, value: Val) {
    await this.ui.fill(box, value);
    await this.ui.click(this.dropdownItem(value));
  }
}
