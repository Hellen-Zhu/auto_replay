// All flows, grouped by business domain. Injected as the `flows` fixture: flows.auth.login('maker').
// Register a new domain here.

import type { App } from '../app';
import { AuthFlow } from './auth.flow';
import { TradesFlow } from './trades.flow';
import { TradeCreationFlow } from './trade-creation.flow';
import { TradeProvisioningFlow } from './trade-provisioning.flow';
import { TradeCancellationFlow } from './trade-cancellation.flow';
import { TradeApprovalFlow } from './trade-approval.flow';
import { TradeAllocationFlow } from './trade-allocation.flow';
import { LifecycleEventFlow } from './lifecycle-event.flow';
import { TradeEarlyTerminationFlow } from './trade-early-termination.flow';
import { TradePartialTerminationFlow } from './trade-partial-termination.flow';
import { TradeNovationRemainingFlow } from './trade-novation-remaining.flow';
import { TradeStepOutFlow } from './trade-step-out.flow';
import { TradePortfolioReassignmentFlow } from './trade-portfolio-reassignment.flow';
import { TradeDetailFlow } from './trade-detail.flow';

export class Flows {
  readonly auth: AuthFlow;
  readonly trades: TradesFlow;
  readonly tradeCreation: TradeCreationFlow;
  readonly tradeProvisioning: TradeProvisioningFlow;
  readonly tradeCancellation: TradeCancellationFlow;
  readonly tradeApproval: TradeApprovalFlow;
  readonly tradeAllocation: TradeAllocationFlow;
  readonly lifecycleEvent: LifecycleEventFlow;
  readonly tradeEarlyTermination: TradeEarlyTerminationFlow;
  readonly tradePartialTermination: TradePartialTerminationFlow;
  readonly tradeNovationRemaining: TradeNovationRemainingFlow;
  readonly tradeStepOut: TradeStepOutFlow;
  readonly tradePortfolioReassignment: TradePortfolioReassignmentFlow;
  readonly tradeDetail: TradeDetailFlow;

  constructor(app: App) {
    this.auth = new AuthFlow(app);
    this.trades = new TradesFlow(app);
    this.tradeCreation = new TradeCreationFlow(app);
    this.tradeProvisioning = new TradeProvisioningFlow(app);
    this.tradeCancellation = new TradeCancellationFlow(app);
    this.tradeApproval = new TradeApprovalFlow(app);
    this.tradeAllocation = new TradeAllocationFlow(app);
    this.lifecycleEvent = new LifecycleEventFlow(app);
    this.tradeEarlyTermination = new TradeEarlyTerminationFlow(app);
    this.tradePartialTermination = new TradePartialTerminationFlow(app);
    this.tradeNovationRemaining = new TradeNovationRemainingFlow(app);
    this.tradeStepOut = new TradeStepOutFlow(app);
    this.tradePortfolioReassignment = new TradePortfolioReassignmentFlow(app);
    this.tradeDetail = new TradeDetailFlow(app);
  }
}

export { BaseFlow, type Keyword } from './base.flow';
export { datFile } from '../products';
export { type TradeCreationData } from './trade-creation.flow';
export { type TradeProvisioningData, type StepInProvisioningData } from './trade-provisioning.flow';
export { type TradeCancellationData } from './trade-cancellation.flow';
export { type TradeAllocationData, type SubTradeData } from './trade-allocation.flow';
export { type TradeEarlyTerminationData } from './trade-early-termination.flow';
export { type TradePartialTerminationData } from './trade-partial-termination.flow';
export { type TradeNovationRemainingData, type NovationInputProfile } from './trade-novation-remaining.flow';
export { type TradeStepOutData, type TradeStepOutPartialData } from './trade-step-out.flow';
export { type TradePortfolioReassignmentData } from './trade-portfolio-reassignment.flow';
export { AuthFlow, TradesFlow, TradeCreationFlow, TradeProvisioningFlow, TradeCancellationFlow, TradeApprovalFlow, TradeAllocationFlow, LifecycleEventFlow, TradeEarlyTerminationFlow, TradePartialTerminationFlow, TradeNovationRemainingFlow, TradeStepOutFlow, TradePortfolioReassignmentFlow, TradeDetailFlow };
