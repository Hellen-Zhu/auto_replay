package com.oreo.uat.steps;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.oreo.uat.hooks.ScenarioContext;
import com.oreo.uat.pages.NewTradePage;
import com.oreo.uat.pages.TradeDetailPage;
import com.oreo.uat.pages.TradePortalPage;
import com.oreo.uat.support.DatFiles;
import com.oreo.uat.support.OreoSession;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import java.io.IOException;
import java.io.UncheckedIOException;

/**
 * trade_creation.snippet. Every value comes from the case data the hook put into the ctx ({@code basic.*},
 * {@code stepIn.*}, from data/ui/trade_creation.json); the product ID is the registry's.
 */
public class TradeCreationSteps {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final OreoSession session;
    private final ScenarioContext ctx;
    private final TradePortalPage portal;
    private final NewTradePage newTrade;

    public TradeCreationSteps(OreoSession session) {
        this.session = session;
        this.ctx = session.ctx();
        this.portal = new TradePortalPage(session.ui());
        this.newTrade = new NewTradePage(session.ui());
    }

    @When("creates a new {string} trade")
    public void createsANewTrade(String product) {
        openNewTradeForm();
        selectBasicInfo();
        newTrade.uploadDat(DatFiles.forProduct(product));
        bookAndConfirm();
    }

    @When("creates a new {string} StepIn full trade")
    public void createsAStepInFullTrade(String product) {
        createStepIn(product, true);
    }

    @When("creates a new {string} StepIn partial trade")
    public void createsAStepInPartialTrade(String product) {
        createStepIn(product, false);
    }

    @Then("trade is created with pending approval status and info")
    public void tradeIsPendingApproval() {
        // "and info": which details the snippet checks besides the status was not seen
        new TradeDetailPage(session.ui()).expectTrade(ctx.text("createdTradeId"), TradeDetailPage.PENDING_APPROVAL);
    }

    private void createStepIn(String product, boolean full) {
        openNewTradeForm();
        newTrade.uploadDat(DatFiles.forProduct(product));
        selectBasicInfo();
        newTrade.enableStepIn(full);
        newTrade.selectStepInOldCounterparty(ctx.text("stepIn.oldCounterpartyName"));
        bookAndConfirm();
    }

    private void openNewTradeForm() {
        portal.clickNewTrade();
        newTrade.expectOpen();
    }

    private void selectBasicInfo() {
        newTrade.selectCounterparty(ctx.text("basic.counterpartyName"));
        newTrade.selectPortfolio(ctx.text("basic.portfolioId"));
        newTrade.selectProductId(ctx.text("basic.productId"));
        newTrade.selectDirection(ctx.text("basic.direction"));
    }

    /** Book, then confirm and store the new trade's ID as {@code createdTradeId} */
    private void bookAndConfirm() {
        newTrade.book(session.config().riskEngineMode());
        String response = newTrade.confirmAndCaptureCreation();
        try {
            ctx.setAttribute("createdTradeId", JSON.readTree(response).at("/data/trade/id").asText());
        } catch (IOException e) {
            throw new UncheckedIOException("The trade creation answer is not JSON: " + response, e);
        }
    }
}
