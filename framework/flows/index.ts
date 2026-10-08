// All flows, grouped by business domain. Injected as the `flows` fixture: flows.auth.login('maker').
// Register a new domain here.

import type { App } from '../app';
import { AuthFlow } from './auth.flow';
import { TradesFlow } from './trades.flow';
import { TradeCreationFlow } from './trade-creation.flow';

export class Flows {
  readonly auth: AuthFlow;
  readonly trades: TradesFlow;
  readonly tradeCreation: TradeCreationFlow;

  constructor(app: App) {
    this.auth = new AuthFlow(app);
    this.trades = new TradesFlow(app);
    this.tradeCreation = new TradeCreationFlow(app);
  }
}

export { BaseFlow, type Keyword } from './base.flow';
export { datFile, type TradeCreationData } from './trade-creation.flow';
export { AuthFlow, TradesFlow, TradeCreationFlow };
