package com.example.module.oreo.glue.steps;

import com.example.module.oreo.OreoModule;
import com.example.module.oreo.utils.ScenarioContext;
import com.example.module.oreo.utils.pages.DynamicActionComponent;
import com.example.module.oreo.utils.pages.Toast;
import com.example.module.oreo.utils.pages.TradePortalPage;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;

/**
 * trade_early_termination.snippet. The values come from the case data ({@code earlyTermination.direction},
 * {@code .amount}, {@code .ccy}, from data/ui/trade_early_termination.json).
 */
public class TradeEarlyTerminationSteps {

    private final OreoModule session;
    private final TradeLifecycleEventSteps lifecycle;

    public TradeEarlyTerminationSteps(OreoModule session, TradeLifecycleEventSteps lifecycle) {
        this.session = session;
        this.lifecycle = lifecycle;
    }

    @When("perform the Early Termination event on the {string} trade")
    public void performEarlyTermination(String product) {
        ScenarioContext ctx = session.ctx();
        lifecycle.opensLifecycleAction("early termination");
        DynamicActionComponent dialog = lifecycle.dynamicAction();
        dialog.selectDirection(ctx.text("earlyTermination.direction"));
        dialog.typeAmount(ctx.text("earlyTermination.amount"));
        dialog.typeCurrency(ctx.text("earlyTermination.ccy"));
        lifecycle.submitsLifecycleEvent();
    }

    @Then("the early termination is completed successfully")
    public void earlyTerminationCompleted() {
        new Toast(session.ui()).expectMessage("success", Toast.EARLY_TERMINATION_COMPLETED);
    }

    @Then("the trade is closed as Terminated")
    public void tradeIsClosedAsTerminated() {
        lifecycle.tradeHasStatusInBlotter(TradePortalPage.DEAD, TradePortalPage.TERMINATED);
    }
}
