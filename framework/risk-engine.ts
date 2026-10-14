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

/**
 * The answer of a partial novation calculation, which holds the risk of the original trade before and after, of the
 * new trade and their combination: the shape of a real response seen on the system (the page fails with "Cannot read
 * properties of undefined (reading 'pnl')" on the answer of the other calculations). The numbers are those of that
 * response.
 */
const PARTIAL_NOVATION_SUCCESS = {
  code: 200,
  status: 'SUCCESS',
  msg: '',
  data: {
    originalTradeRisk: { calculationTimestamp: '2026-10-14T14:08:15.346030327Z', pnl: 5277.967807918399, riskEngine: 'Cortex-QR' },
    reducedOriginalTradeRisk: { calculationTimestamp: '2026-10-14T14:08:15.195305963Z', pnl: -4451.633465113114, riskEngine: 'Cortex-QR' },
    newTradeRisk: { calculationTimestamp: '2026-10-14T14:08:14.881678564Z', pnl: 26833.40549035619, riskEngine: 'Cortex-QR' },
    combinedRisk: { pnl: 22381.772025243076 },
    deltaVsOriginal: { pnl: 17103.804217324677 },
    riskBreachFlag: false,
  },
};

const calculation = (url: string, body: object = SUCCESS): AwaitedRequest => ({ url, method: 'POST', setting: 'riskEngine', mock: { status: 200, body } });

/** Paths start after the prefix that is part of apiBaseUrl, like every API path in this repo */
export const RiskCalculation = {
  /** Before a new trade is saved or booked. POST and the mocked answer are taken to be those of the cancellation */
  forNewTrade: (): AwaitedRequest => calculation('/trades/calculate-risk-for-new'),
  /** Before an event on an existing trade (cancellation: tradeRiskCalculationUrl(tradeId) of the E2E project) */
  forTrade: (tradeId: string): AwaitedRequest => calculation(`/trades/${tradeId}/calculate-risk`),
  /**
   * Before a partial novation of an existing trade (tradePartialRiskCalculationUrl(tradeId) of the E2E project),
   * mocked with its own answer (PARTIAL_NOVATION_SUCCESS)
   */
  forPartialNovation: (tradeId: string): AwaitedRequest => calculation(`/trades/${tradeId}/calculate-partial-novation-risk`, PARTIAL_NOVATION_SUCCESS),
};
