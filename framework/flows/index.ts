// All flows, grouped by business domain. Injected as the `flows` fixture: flows.auth.login('maker').
// Register a new domain here.

import type { App } from '../app';
import { AuthFlow } from './auth.flow';
import { TradesFlow } from './trades.flow';
import { TradeCreationFlow } from './trade-creation.flow';
import { TradeProvisioningFlow } from './trade-provisioning.flow';
import { TradeCancellationFlow } from './trade-cancellation.flow';

export class Flows {
  readonly auth: AuthFlow;
  readonly trades: TradesFlow;
  readonly tradeCreation: TradeCreationFlow;
  readonly tradeProvisioning: TradeProvisioningFlow;
  readonly tradeCancellation: TradeCancellationFlow;

  constructor(app: App) {
    this.auth = new AuthFlow(app);
    this.trades = new TradesFlow(app);
    this.tradeCreation = new TradeCreationFlow(app);
    this.tradeProvisioning = new TradeProvisioningFlow(app);
    this.tradeCancellation = new TradeCancellationFlow(app);
  }
}

export { BaseFlow, type Keyword } from './base.flow';
export { datFile } from '../products';
export { type TradeCreationData } from './trade-creation.flow';
export { type TradeProvisioningData } from './trade-provisioning.flow';
export { type TradeCancellationData } from './trade-cancellation.flow';
export { AuthFlow, TradesFlow, TradeCreationFlow, TradeProvisioningFlow, TradeCancellationFlow };
