package com.example.module.oreo.glue.ui;

import com.example.module.oreo.OreoModuleConfiguration;
import com.example.module.oreo.testdata.ProductDatFiles;
import com.example.module.oreo.testdata.TestDataLoader;
import cucumber.api.Scenario;
import cucumber.api.java.Before;
import cucumber.api.java.en.When;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.Paths;

public class NewTradeSteps {

    private static final String NEW_TRADE_RISK_URL = "/trades/calculate-risk-for-new";

    private PlaywrightServiceResolver.Context ctx;
    private static final Logger log = LoggerFactory.getLogger(NewTradeSteps.class);

    @Before({"@playwright"})
    public void beforeScenario(Scenario scenario) { this.ctx = PlaywrightServiceResolver.from(scenario); }

    // ── File upload ─────────────────────────────────────────────────

    @When("^upload '([^']*)' dat file$")
    public void uploadDatFile(String productType) { uploadDatFile(ProductDatFiles.valueOf(productType).path()); }

    @When("^click save using configured risk engine mode for new trade creation$")
    public void clickSaveUsingConfiguredRiskEngineModeForNewTrade() {
        clickUsingConfiguredRiskEngineModeForNewTrade("new_trade.save_btn");
    }

    @When("^click book using configured risk engine mode for new trade creation$")
    public void clickBookUsingConfiguredRiskEngineModeForNewTrade() {
        clickUsingConfiguredRiskEngineModeForNewTrade("new_trade.book_btn");
    }

    private void clickUsingConfiguredRiskEngineModeForNewTrade(String buttonLocator) {
        OreoModuleConfiguration.Mode mode = ctx.riskEngineMode();

        log.info("[NewTradeSteps] Clicking '{}' using configured risk engine mode='{}'", buttonLocator, mode);

        switch (mode) {
            case MOCK:
                clickSaveAndMockSuccessfulRiskCalculationResponseForNewTrade(buttonLocator);
                return;
            case REAL:
                clickSaveAndWaitForRealRiskCalculationResponseForNewTrade(buttonLocator);
                return;
            default:
                throw new IllegalStateException("Unhandled risk engine mode: " + mode);
        }
    }

    private void clickSaveAndWaitForRealRiskCalculationResponseForNewTrade(String buttonLocator) {
        ctx.runAndWaitForResponse(
                () -> ctx.service().getLocator(buttonLocator).click(),
                NEW_TRADE_RISK_URL,
                "POST"
        );
    }

    private void clickSaveAndMockSuccessfulRiskCalculationResponseForNewTrade(String buttonLocator) {
        String responseBody = TestDataLoader.forKey("UI-SETUP-RISK-CALC-NEW-SUCCESS").response();
        ctx.mockRoute(NEW_TRADE_RISK_URL, 200, responseBody);
        try {
            ctx.runAndWaitForResponse(
                    () -> ctx.service().getLocator(buttonLocator).click(),
                    NEW_TRADE_RISK_URL,
                    "POST"
            );
        } finally {
            ctx.clearMockRoute(NEW_TRADE_RISK_URL);
        }
    }


    @When("^confirm new trade and wait for page ready$")
    public void waitForNewTradeCreatedReady() {
        ctx.clickAndWaitForResponse("trade_change_confirmation.confirm_btn", "/api/v1/blotter/trades", "POST");
    }

    @When("^confirm new trade creation and capture response as '([^']*)'$")
    public void captureNewTradeCreationResponse(String responseCtxKey) {
        log.info("[NewTradeSteps] Confirming trade change confirmation; capturing /trades/create response as '{}'", responseCtxKey);
        String responseBody = ctx.clickAndCaptureResponse(
                "trade_change_confirmation.confirm_btn",
                "/api/v1/trades/create",
                "POST"
        );
        ctx.set(responseCtxKey, responseBody);
    }

    // ── Private helpers ─────────────────────────────────────────────

    private void uploadDatFile(String relativeFilePath) {
        URL resource = getClass().getClassLoader().getResource(relativeFilePath);
        if (resource == null) {
            throw new AssertionError(
                    "[NewTradeSteps] Cannot find resource '" + relativeFilePath + "' on classpath.");
        }
        try {
            ctx.service().getLocator("new_trade.file_input")
                    .setInputFiles(Paths.get(resource.toURI()));
        } catch (URISyntaxException e) {
            throw new AssertionError(
                    "[NewTradeSteps] Invalid URI for resource '" + relativeFilePath + "': " + e.getMessage());
        }
    }
}
