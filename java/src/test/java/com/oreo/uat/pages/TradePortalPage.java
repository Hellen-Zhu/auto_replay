package com.oreo.uat.pages;

import com.oreo.uat.support.OreoUi;

/** Trade portal: the top bar, the blotter and a row's action menu (trade_portal_page.json). */
public class TradePortalPage {

    public static final String PATH = "/trades";
    public static final String DEAD = "DEAD";
    public static final String TERMINATED = "Terminated";
    static final String NEW_TRADE = "trade_portal.new_trade_btn";
    static final String SEARCH = "trade_portal.search_input";
    static final String BLOTTER = "trade_portal.all_trade_blotter";
    /** The row action of each lifecycle event, by the name lifecycle_event.snippet uses */
    static final java.util.Map<String, String> LIFECYCLE_ACTIONS = java.util.Map.of(
        "allocation", "trade_portal.row_action_allocation",
        "novation remaining", "trade_portal.row_action_novationremaining",
        "partial novation remaining", "trade_portal.row_action_partialnovationremaining",
        "step out full", "trade_portal.row_action_stepoutfull",
        "step out partial", "trade_portal.row_action_stepoutpartial",
        "early termination", "trade_portal.row_action_earlytermination",
        "partial termination", "trade_portal.row_action_partialtermination",
        "portfolio reassignment", "trade_portal.row_action_portfolioreassignment");

    private final OreoUi ui;

    public TradePortalPage(OreoUi ui) {
        this.ui = ui;
    }

    public void navigate() {
        ui.navigate(PATH);
    }

    public void clickNewTrade() {
        ui.click(NEW_TRADE);
    }

    public void search(String tradeId) {
        ui.typeInner(SEARCH, tradeId);
    }

    /** "searches and opens action menu for trade stored as ..." */
    public void searchAndOpenActionMenu(String tradeId) {
        search(tradeId);
        ui.rightClickRow(BLOTTER, tradeId);
    }

    public String lifecycleAction(String action) {
        String element = LIFECYCLE_ACTIONS.get(action);
        if (element == null) {
            throw new IllegalArgumentException("Unknown lifecycle action '" + action + "': " + LIFECYCLE_ACTIONS.keySet());
        }
        return element;
    }

    /** "$1 action button is visible" */
    public void expectActionVisible(String action) {
        ui.assertVisible(lifecycleAction(action));
    }

    /** "clicks $1 action for current trade" */
    public void clickAction(String action) {
        ui.click(lifecycleAction(action));
    }

    /** "blotter column '<column>' is '<value>'" for the trade's row */
    public void expectColumn(String tradeId, String column, String value) {
        ui.assertCellText(BLOTTER, tradeId, column, value);
    }
}
