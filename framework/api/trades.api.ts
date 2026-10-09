import type { Val } from '../ui';
import { BaseApi } from './base.api';

/** The "basic" block of a new trade, as the E2E project's API test data sends it (REQ-TPL-TRADE-CREATION-API-001) */
export interface TradeBasic {
  counterpartyFmId: Val;
  counterpartyName: Val;
  portfolioId: Val;
  productId: string;
  direction: Val;
  /** A number in the request, so it cannot be a case parameter (those are text) */
  premiumAmount: number;
  premiumCurrency: Val;
}

/** A request without the user it is sent as; path is relative to apiBaseUrl of the local config */
export interface ApiRequest {
  method: string;
  path: string;
  body?: unknown;
}

/** The trades API (.../api/v1/trades), called directly instead of through the pages */
export class TradesApi extends BaseApi {
  /**
   * The request that submits a new trade for approval, the same one the New Trade form sends.
   * Confirmed in the browser's Network tab: multipart with the JSON part "trade" and the file part "datFile",
   * answered with { data: { trade: { id }, checkerContext: { taskId } } }.
   */
  static readonly submit: ApiRequest = { method: 'POST', path: '/api/v1/trades/create?tradeAction=SUBMIT' };

  /**
   * The request with which the checker approves a task, given the task ID that the submit request returned.
   * NOT DEFINED YET: it is what TradeProvisioningSteps.approveTask of the E2E project sends, and that method was
   * not available when this was written. Fill in its method, path and body here, e.g.
   *   (taskId) => ({ method: 'POST', path: `/api/v1/...`, body: { ... } })
   * Nothing else needs to change: approveTask() below sends it as the checker.
   */
  static readonly approve: ((taskId: string) => ApiRequest) | undefined = undefined;

  /**
   * Fails with what is missing while the approval request is not defined.
   * A flow that is going to approve calls it before it submits anything, so that a run does not leave a pending trade behind.
   */
  requireApprove(): (taskId: string) => ApiRequest {
    const approve = TradesApi.approve;
    if (!approve) {
      throw new Error(
        'The API request that approves a task is not defined yet: fill in TradesApi.approve in framework/api/trades.api.ts ' +
          '(method, path and body of the request that TradeProvisioningSteps.approveTask of the E2E project sends)',
      );
    }
    return approve;
  }

  /**
   * Submit a new trade as that user; it is then pending approval. file is the product's dat file, relative to the
   * project root and inside data/. Returns the new trade's ID and the ID of the approval task, which are recorded
   * as ${var:createdTradeId} and ${var:createdTaskId} wherever a later step uses them.
   */
  async submitTrade(role: string, basic: TradeBasic, file: string): Promise<{ tradeId: string; taskId: string }> {
    const saved = await this.ui.api({
      ...TradesApi.submit,
      headers: this.as(role),
      multipart: { trade: { json: { basic } }, datFile: { file } },
      save: { createdTradeId: 'data.trade.id', createdTaskId: 'data.checkerContext.taskId' },
    });
    return { tradeId: saved.createdTradeId, taskId: saved.createdTaskId };
  }

  /** Approve a task as that user (the checker) */
  async approveTask(role: string, taskId: string) {
    await this.ui.api({ ...this.requireApprove()(taskId), headers: this.as(role) });
  }
}
