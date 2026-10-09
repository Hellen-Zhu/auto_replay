import type { TargetIn, Val } from '../ui';
import { element, INNER_INPUT } from '../elements';
import { RiskCalculation } from '../risk-engine';
import { CheckerAction } from '../components/checker-action';
import { TradeChangeConfirmation } from '../components/trade-change-confirmation';
import { BasePage } from './base.page';

/** Trades page (the trade portal): the landing page after login, with the search box and the blotters */
export class TradesPage extends BasePage {
  static readonly path = '/trades';
  /**
   * What the blotter shows in a trade's row. PARV, LIVE and DEAD are the E2E project's; DRAFT is what the user said
   * a rejected new trade goes back to, and the text the blotter shows for it has not been seen yet.
   */
  static readonly status = { pendingApproval: 'PARV', live: 'LIVE', dead: 'DEAD', draft: 'DRAFT' };
  static readonly eventStatus = { cancelled: 'Cancelled', new: 'New' };

  // The search box is a web component: the real control is in its shadow root
  protected readonly searchInput = element('trade_portal.search_input', { inner: INNER_INPUT });
  protected readonly allTradesBlotter = element('trade_portal.all_trade_blotter');
  // An entry of a row's action menu
  protected readonly cancelAction = element('trade_portal.row_action_cancel');

  /** The dialog that an action on a trade (cancel, ...) opens */
  readonly confirmDialog = new TradeChangeConfirmation(this.ui);
  /** The checker's Approve / Reject entries of a row's action menu and the dialog that confirms the decision */
  readonly checkerAction = new CheckerAction(this.ui);

  /** The first row of the blotter that shows this trade ID: the rows are only told apart by their text */
  protected row(tradeId: Val): TargetIn {
    return { ...this.allTradesBlotter, inner: 'role=row', hasText: tradeId, nth: 0 };
  }

  async open() {
    await this.ui.goto(TradesPage.path);
  }

  async expectOpen() {
    await this.ui.expectUrl(TradesPage.path);
  }

  /** Pass the ID a booking returned; it is recorded as a variable, so a replay searches for its own trade */
  async searchTrade(tradeId: Val) {
    await this.ui.fill(this.searchInput, tradeId);
  }

  /** Opens the action menu of the trade's row; in the blotter that is a right-click on the row */
  async openActionMenu(tradeId: Val) {
    await this.ui.rightClick(this.row(tradeId));
  }

  /** The action menu must be open */
  async expectCancelActionVisible() {
    await this.ui.expectVisible(this.cancelAction);
  }

  /** The cancel entry starts the risk calculation of the trade; the click is over once it is answered */
  async clickCancelAction(tradeId: string) {
    await this.ui.clickAndAwait(this.cancelAction, RiskCalculation.forTrade(tradeId));
  }

  /** The trade's row shows this text (e.g. a status) in one of its columns */
  async expectRowShows(tradeId: Val, text: Val) {
    await this.ui.expectText(this.row(tradeId), text);
  }
}
