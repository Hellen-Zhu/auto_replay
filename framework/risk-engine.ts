// The third-party risk calculation the system calls when a trade is booked or an event is triggered on one.
// The page sends the request after a click and opens the confirmation dialog once it is answered. Whether the
// request reaches the risk engine is local config: riskEngine 'real' (default) or 'mock', as the E2E project's
// "configured risk engine mode" (its steps "... using configured risk engine mode ...").

import type { AwaitedRequest } from './ui';

/**
 * The answer a mocked calculation gets: the E2E project's test data UI-SETUP-RISK-CALC-NEW-SUCCESS, i.e. the
 * response template RESP-TPL-MOCK-DATA-UI-001 with that entry's data. That the entry's data replaces the template's
 * empty data is inferred from the yml, the code that merges them was not seen.
 */
const SUCCESS = {
  code: 200,
  status: 'SUCCESS',
  msg: '',
  data: { calculationTimestamp: '2026-08-21T08:35:21.383923927Z', pnl: -18726.25346898106, riskEngine: 'Cortex-QR' },
};

const calculation = (url: string): AwaitedRequest => ({ url, method: 'POST', setting: 'riskEngine', mock: { status: 200, body: SUCCESS } });

/** Paths start after the prefix that is part of apiBaseUrl, like every API path in this repo */
export const RiskCalculation = {
  /** Before a new trade is saved or booked. POST and the mocked answer are taken to be those of the cancellation */
  forNewTrade: (): AwaitedRequest => calculation('/trades/calculate-risk-for-new'),
  /** Before an event on an existing trade (cancellation: tradeRiskCalculationUrl(tradeId) of the E2E project) */
  forTrade: (tradeId: string): AwaitedRequest => calculation(`/trades/${tradeId}/calculate-risk`),
  /**
   * Before a partial novation of an existing trade (tradePartialRiskCalculationUrl(tradeId) of the E2E project).
   * The E2E project mocks it with its own test data, UI-SETUP-RISK-CALC-PARTIAL-SUCCESS, whose body was not seen
   * completely: the mocked answer here is the one of the other calculations, which the page may not accept.
   */
  forPartialNovation: (tradeId: string): AwaitedRequest => calculation(`/trades/${tradeId}/calculate-partial-novation-risk`),
};
