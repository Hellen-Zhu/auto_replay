package com.example.module.oreo.glue.ui;

import cucumber.api.Scenario;
import cucumber.api.java.Before;
import cucumber.api.java.en.When;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class TradeDetailSteps {

    private static final Logger log = LoggerFactory.getLogger(TradeDetailSteps.class);

    private PlaywrightServiceResolver.Context ctx;

    @Before({"@playwright"})
    public void beforeScenario(Scenario scenario) { this.ctx = PlaywrightServiceResolver.from(scenario); }

    @When("^navigate to trade details for stored trade '([^']*)'$")
    public void navigateToTradeDetails(String ctxKey){
        String tradeId = ctx.get(ctxKey);
        ctx.write("Navigating to trade details for tradeId: " + tradeId);
        log.info("Navigating to trade details for tradeId: {}", tradeId);
        ctx.navigateToPath("/trade/" + tradeId);
    }
}
