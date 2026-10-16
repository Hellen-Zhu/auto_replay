package com.example.module.oreo.glue.ui;

import com.example.module.oreo.OreoModule;
import com.example.module.oreo.glue.ScenarioContext;
import com.example.module.oreo.utils.pages.DynamicActionComponent;
import com.example.module.oreo.utils.pages.Toast;
import com.example.module.oreo.utils.pages.TradeChangeConfirmation;
import com.example.module.oreo.utils.pages.TradePortalPage;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;

/**
 * lifecycle_event.snippet and common_trade_action.snippet: what every event started from a row's action menu
 * shares. An event's steps open its action, fill the dialog with its own component calls, then submit.
 *
 * <p>Early termination (trade_early_termination.snippet): the values come from the case data
 * ({@code earlyTermination.direction}, {@code .amount}, {@code .ccy}, from data/ui/trade_early_termination.json).
 */
public class TradeLifecycleEventSteps {

    private final OreoModule session;
    private final TradePortalPage portal;
    private final DynamicActionComponent dynamicAction;

    public TradeLifecycleEventSteps(OreoModule session) {
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

    @When("perform the Early Termination event on the {string} trade")
    public void performEarlyTermination(String product) {
        ScenarioContext ctx = session.ctx();
        opensLifecycleAction("early termination");
        dynamicAction.selectDirection(ctx.get("earlyTermination.direction"));
        dynamicAction.typeAmount(ctx.get("earlyTermination.amount"));
        dynamicAction.typeCurrency(ctx.get("earlyTermination.ccy"));
        submitsLifecycleEvent();
    }

    @Then("the early termination is completed successfully")
    public void earlyTerminationCompleted() {
        new Toast(session.ui()).expectMessage("success", Toast.EARLY_TERMINATION_COMPLETED);
    }

    @Then("the trade is closed as Terminated")
    public void tradeIsClosedAsTerminated() {
        tradeHasStatusInBlotter(TradePortalPage.DEAD, TradePortalPage.TERMINATED);
    }

    private String tradeId() {
        return session.ctx().get("createdTradeId");
    }
}
