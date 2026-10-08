// Base class of every component: a control or region that appears on more than one page
// (top bar, combobox, confirmation dialog). Like a page object it owns its locators and exposes
// atomic operations: one thing a user does to it or checks on it, acting only through ui.xxx.

import type { UI } from '../ui';

export abstract class BaseComponent {
  constructor(protected readonly ui: UI) {}
}
