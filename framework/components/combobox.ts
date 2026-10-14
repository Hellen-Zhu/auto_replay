import type { UI, Target, TargetIn, Val } from '../ui';
import { BaseComponent } from './base.component';

/**
 * An OREO combobox / select: a text input with a dropdown. The entries are not native options: each one is an
 * <sl-menu-item role="menuitem"> whose label is slotted in, with the typed text highlighted in <b>.
 */
export class Combobox extends BaseComponent {
  /**
   * input is the real <input> inside the host, e.g. { testId: '...-combobox', inner: 'input' }.
   * visibleEntries: the dropdown keeps a hidden copy of the unfiltered list, whose entry with the same name is the one
   * the role query finds (the trade details: "element is not visible" on data-path 7 while the shown entry was
   * data-path 1). The entry is then the visible menuitem that contains the value, found by its attribute rather than
   * by its accessible name, which the shown entry did not match.
   */
  constructor(ui: UI, protected readonly input: Target, private readonly visibleEntries = false) {
    super(ui);
  }

  protected entry(name: Val): TargetIn {
    if (this.visibleEntries) return { css: '[role="menuitem"]', hasText: name, visible: true };
    return { role: 'menuitem', name, exact: true };
  }

  /** Type the value, then pick the matching entry from the dropdown */
  async select(value: Val) {
    await this.ui.fill(this.input, value);
    await this.ui.click(this.entry(value));
  }
}
