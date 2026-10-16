package com.oreo.uat.steps;

import com.oreo.uat.pages.DynamicActionComponent;
import com.oreo.uat.pages.TradeChangeConfirmation;
import com.oreo.uat.pages.TradePortalPage;
import com.oreo.uat.support.OreoSession;

/**
 * lifecycle_event.snippet and common_trade_action.snippet: what every event started from a row's action menu
 * shares. An event's steps open its action, fill the dialog with its own component calls, then submit.
 */
public class TradeLifecycleEventSteps {

    private final OreoSession session;
    private final TradePortalPage portal;
    private final DynamicActionComponent dynamicAction;

    public TradeLifecycleEventSteps(OreoSession session) {
        this.session = session;
        this.portal = new TradePortalPage(session.ui());
        this.dynamicAction = new DynamicActionComponent(session.ui());
    }

    public DynamicActionComponent dynamicAction() {
        return dynamicAction;
    }

    /** "opens lifecycle action '<action>' for current trade" */
    public void opensLifecycleAction(String action) {
        portal.searchAndOpenActionMenu(tradeId());
        portal.expectActionVisible(action);
        portal.clickAction(action);
        dynamicAction.expectVisible();
    }

    /** "submits lifecycle event and waits for page ready" */
    public void submitsLifecycleEvent() {
        dynamicAction.confirm(session.config().riskEngineMode(), tradeId());
        TradeChangeConfirmation confirmation = new TradeChangeConfirmation(session.ui());
        confirmation.expectVisible();
        confirmation.confirmLifecycleEvent();
    }

    /** "the trade has status '<status>' and event status '<eventStatus>' in the blotter" */
    public void tradeHasStatusInBlotter(String status, String eventStatus) {
        portal.navigate();
        portal.search(tradeId());
        portal.expectColumn(tradeId(), "status", status);
        portal.expectColumn(tradeId(), "eventStatus", eventStatus);
    }

    private String tradeId() {
        return session.ctx().text("createdTradeId");
    }
}
