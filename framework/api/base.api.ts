// Base class of every API object.
// An API object owns the requests of one area of the system's API and exposes atomic operations: one request each.
// Like a page object it acts only through ui.xxx (here ui.api), so every call is recorded into the case file and
// sent again when the PO replays the case. Sequences of calls belong to the flow layer.

import { cfg, type UI, type Val } from '../ui';

export abstract class BaseApi {
  constructor(protected readonly ui: UI) {}

  /**
   * The API has no login: a request only says who sends it, with that user's e-mail in the X-User-Id header.
   * The e-mail is accounts.<role>.email of the local config.local.json, so it never gets into a case file.
   */
  protected as(role: string): Record<string, Val> {
    return { 'X-User-Id': cfg(`accounts.${role}.email`) };
  }
}
