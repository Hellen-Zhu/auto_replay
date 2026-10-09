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

/**
 * A request without the user it is sent as. path is relative to apiBaseUrl of the local config, which already
 * ends with the API's prefix (.../api/v1): a path starts after it, e.g. /trades/create
 */
export interface ApiRequest {
  method: string;
  path: string;
  body?: unknown;
}

/** The trades API (trades and their approval tasks), called directly instead of through the pages */
export class TradesApi extends BaseApi {
  /**
   * The request that submits a new trade for approval, the same one the New Trade form sends.
   * Confirmed in the browser's Network tab: multipart with the JSON part "trade" and the file part "datFile",
   * answered with { data: { trade: { id }, checkerContext: { taskId } } }.
   */
  static readonly submit: ApiRequest = { method: 'POST', path: '/trades/create?tradeAction=SUBMIT' };

  /**
   * The requests with which the checker approves or rejects a task, given the task ID that the submit request
   * returned. Confirmed in the browser's Network tab: POST with a JSON content type, answered with
   * { code: 200, status: 'SUCCESS', data: { id, basic, instrument, trace } } where data is the trade.
   * The body is an empty JSON object: the Network tab shows a content length of 2; the payload itself was not seen.
   */
  static readonly approve = (taskId: string): ApiRequest => ({ method: 'POST', path: `/checker/tasks/${taskId}/approve`, body: {} });
  static readonly reject = (taskId: string): ApiRequest => ({ method: 'POST', path: `/checker/tasks/${taskId}/reject`, body: {} });

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
    await this.ui.api({ ...TradesApi.approve(taskId), headers: this.as(role) });
  }

  /** Reject a task as that user (the checker) */
  async rejectTask(role: string, taskId: string) {
    await this.ui.api({ ...TradesApi.reject(taskId), headers: this.as(role) });
  }
}
