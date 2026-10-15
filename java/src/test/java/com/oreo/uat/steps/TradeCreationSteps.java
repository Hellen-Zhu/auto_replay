package com.oreo.uat.steps;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.oreo.uat.hooks.ScenarioContext;
import com.oreo.uat.testdata.Products;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;

/**
 * Data-only stand-ins for the trade creation snippets: no browser. Each step checks that the values the real snippet
 * types ("from stored variable 'basic.counterpartyName'") are in the ctx with the expected product. In the E2E
 * project the real snippets run instead and these steps do not exist.
 */
public class TradeCreationSteps {

    private final ScenarioContext ctx;

    public TradeCreationSteps(ScenarioContext ctx) {
        this.ctx = ctx;
    }

    @When("maker is logged in to the trade portal")
    public void makerIsLoggedIn() {
        // Login is the snippet's job; nothing to check in the data
    }

    @When("creates a new {string} trade")
    public void createsANewTrade(String productType) {
        checkBasic(productType);
    }

    @When("creates a new {string} StepIn full trade")
    public void createsAStepInFullTrade(String productType) {
        checkBasic(productType);
        assertFalse(ctx.text("stepIn.oldCounterpartyName").isBlank());
    }

    @When("creates a new {string} StepIn partial trade")
    public void createsAStepInPartialTrade(String productType) {
        checkBasic(productType);
        assertFalse(ctx.text("stepIn.oldCounterpartyName").isBlank());
    }

    @Then("trade is created with pending approval status and info")
    public void tradeIsPendingApproval() {
        // Checked on the page by the real snippet
    }

    private void checkBasic(String productType) {
        assertEquals(Products.productId(productType), ctx.text("basic.productId"));
        for (String field : new String[] {"portfolioId", "counterpartyFmId", "counterpartyName", "direction"}) {
            assertFalse(ctx.text("basic." + field).isBlank(), "basic." + field);
        }
    }
}
