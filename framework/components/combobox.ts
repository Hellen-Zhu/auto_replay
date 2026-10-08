import type { UI, Target, TargetIn, Val } from '../ui';
import { BaseComponent } from './base.component';

/**
 * An OREO combobox / select: a text input with a dropdown. The entries are not native options: each one is an
 * <sl-menu-item role="menuitem"> whose label is slotted in, with the typed text highlighted in <b>.
 */
export class Combobox extends BaseComponent {
  /** input is the real <input> inside the host, e.g. { testId: '...-combobox', inner: 'input' } */
  constructor(ui: UI, protected readonly input: Target) {
    super(ui);
  }

  protected entry(name: Val): TargetIn {
    return { role: 'menuitem', name, exact: true };
  }

  /** Type the value, then pick the matching entry from the dropdown */
  async select(value: Val) {
    await this.ui.fill(this.input, value);
    await this.ui.click(this.entry(value));
  }
}
