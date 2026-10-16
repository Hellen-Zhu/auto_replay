package com.example.module.oreo.glue.ui;

import com.example.module.oreo.OreoModuleConfiguration;
import com.example.module.oreo.testdata.TestData;
import cucumber.api.Scenario;
import cucumber.api.java.Before;
import cucumber.api.java.en.When;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class TradeLifecycleEventSteps {

    private static final Logger log = LoggerFactory.getLogger(TradeLifecycleEventSteps.class);
    private PlaywrightServiceResolver.Context ctx;

    @Before({"@playwright"})
    public void beforeScenario(Scenario scenario) { this.ctx = PlaywrightServiceResolver.from(scenario); }

    // ── Amendment steps ─────────────────────────────────────────────

    /**
     * React controlled {@code <input type="date">} ignores Playwright {@code fill()} — the save
     * button's {@code hasChanges} state stays false. {@link PlaywrightServiceResolver.Context#fillDateInput}
     * handles the workaround.
     */
    @When("^fill date field '([^']*)' with stored variable '([^']*)'$")
    public void fillDateFieldWithStoredVariable(String elementKey, String ctxKey) {
        String value = ctx.get(ctxKey);
        log.info("[TradeLifecycleEventSteps] Filling date field '{}' with ctx['{}'] = '{}'", elementKey, ctxKey, value);
        ctx.fillDateInput(elementKey, value);
    }

    @When("^click amend using configured risk engine mode for trade stored as '([^']*)' from trade details page$")
    public void clickAmendUsingConfiguredRiskEngineModeFromTradeDetails(String ctxKey) {
        switch (resolveRiskEngineMode()) {
            case MOCK:
                clickAmendAndMockSuccessfulRiskCalculationFromTradeDetails(ctxKey);
                return;
            case REAL:
                clickAmendAndWaitForRealRiskCalculationFromTradeDetails(ctxKey);
                return;
            default:
                throw new IllegalStateException("Unhandled risk engine mode");
        }
    }

    @When("^click amend and wait for real risk calculation response for trade stored as '([^']*)' from trade details page$")
    public void clickAmendAndWaitForRealRiskCalculationFromTradeDetails(String ctxKey) {
        String tradeId = ctx.get(ctxKey);
        ctx.runAndWaitForResponse(
                () -> ctx.service().getLocator("trade_detail.amend_btn").click(),
                tradeRiskCalculationUrl(tradeId),
                "POST"
        );
    }

    @When("^click amend and mock successful risk calculation for trade stored as '([^']*)' from trade details page$")
    public void clickAmendAndMockSuccessfulRiskCalculationFromTradeDetails(String ctxKey) {
        String tradeId = ctx.get(ctxKey);
        String responseBody = TestData.setup("risk-calc-success-mock").response();
        String urlFragment = tradeRiskCalculationUrl(tradeId);
        ctx.clickWithMockedResponse(
                "trade_detail.amend_btn",
                urlFragment,
                "POST",
                200,
                responseBody
        );
    }
    /**
     * Clicks the Confirm button in the TradeChangeConfirmation dialog and waits for
     * {@code POST /trades/{tradeId}/update} to complete.
     */
    @When("^click amendment confirm and wait for trade update for trade stored as '([^']*)'$")
    public void clickAmendmentConfirmAndWaitForUpdate(String ctxKey) {
        String tradeId = ctx.get(ctxKey);
        log.info("[TradeLifecycleEventSteps] Clicking amendment confirm and waiting for update for trade='{}'", tradeId);
        ctx.clickAndWaitForResponse("trade_change_confirmation.confirm_btn", "/trades/" + tradeId + "/update", "POST");
    }

    @When("^confirm checker action on trade detail and wait for page ready$")
    public void confirmCheckerActionAndWait() {
        log.info("[TradeLifecycleEventSteps] Confirming checker action on trade detail; waiting for /checker/tasks/ response");
        ctx.clickAndWaitForResponse("trade_detail.checker_confirm_btn", "/checker/tasks/", "POST");
    }

    // ── Lifecycle event steps ───────────────────────────────────────

    /**
     * Clicks Confirm in any dynamic-action event form dialog and waits for the
     * calculate-risk POST to complete. Applies to PartialTermination, EarlyTermination,
     * PortfolioReassignment, or any other event that uses the dynamic-action dialog.
     * On success the TradeChangeConfirmation dialog opens automatically.
     */
    @When("^confirm dynamic action form using configured risk engine mode for trade stored as '([^']*)'$")
    public void confirmDynamicActionFormUsingConfiguredRiskEngineMode(String ctxKey) {
        switch (resolveRiskEngineMode()) {
            case MOCK:
                clickSaveAndMockSuccessfulRiskCalculationResponseForEvent(ctxKey);
                return;
            case REAL:
                confirmDynamicActionFormAndWaitForRealRiskCalculationResponse(ctxKey);
                return;
            default:
                throw new IllegalStateException("Unhandled risk engine mode");
        }
    }

    @When("^confirm dynamic action form and wait for real risk calculation response for trade stored as '([^']*)'$")
    public void confirmDynamicActionFormAndWaitForRealRiskCalculationResponse(String ctxKey) {
        String tradeId = ctx.get(ctxKey);
        ctx.runAndWaitForResponse(
                () -> ctx.service().getLocator("dynamic_action.confirm_btn").click(),
                tradeRiskCalculationUrl(tradeId),
                "POST"
        );
    }

    @When("^confirm dynamic action form and mock successful risk calculation response for trade stored as '([^']*)'$")
    public void clickSaveAndMockSuccessfulRiskCalculationResponseForEvent(String ctxKey) {
        String tradeId = ctx.get(ctxKey);
        String responseBody = TestData.setup("risk-calc-success-mock").response();
        String urlFragment = tradeRiskCalculationUrl(tradeId);
        ctx.clickWithMockedResponse(
                "dynamic_action.confirm_btn",
                urlFragment,
                "POST",
                200,
                responseBody
        );
    }


    @When("^confirm dynamic action form using configured partial risk engine mode for trade stored as '([^']*)'$")
    public void confirmDynamicActionFormUsingConfiguredPartialRiskEngineMode(String ctxKey) {
        switch (resolveRiskEngineMode()) {
            case MOCK:
                clickSaveAndMockSuccessfulPartialRiskCalculationResponseForEvent(ctxKey);
                return;
            case REAL:
                confirmDynamicActionFormAndWaitForRealPartialRiskCalculationResponse(ctxKey);
                return;
            default:
                throw new IllegalStateException("Unhandled risk engine mode");
        }
    }

    @When("^confirm dynamic action form and wait for real partial risk calculation response for trade stored as '([^']*)'$")
    public void confirmDynamicActionFormAndWaitForRealPartialRiskCalculationResponse(String ctxKey) {
        String tradeId = ctx.get(ctxKey);
        ctx.runAndWaitForResponse(
                () -> ctx.service().getLocator("dynamic_action.confirm_btn").click(),
                tradePartialRiskCalculationUrl(tradeId),
                "POST"
        );
    }

    @When("^confirm dynamic action form and mock successful partial risk calculation response for trade stored as '([^']*)'$")
    public void clickSaveAndMockSuccessfulPartialRiskCalculationResponseForEvent(String ctxKey) {
        String tradeId = ctx.get(ctxKey);
        String responseBody = TestData.setup("risk-calc-partial-success-mock").response();
        String urlFragment = tradePartialRiskCalculationUrl(tradeId);
        log.info("[TradeLifecycleEventSteps] Mocking successful partial risk calculation response for trade='{}' with response body '{}'", tradeId, responseBody);
        ctx.clickWithMockedResponse(
                "dynamic_action.confirm_btn",
                urlFragment,
                "POST",
                200,
                responseBody
        );
    }
    /**
     * Clicks Confirm & Save in the TradeChangeConfirmation dialog and waits for the
     * trigger-event POST to complete. Used by any lifecycle event routed through
     * POST /trades/trigger-event (PartialTermination, EarlyTermination, PortfolioReassignment, etc.).
     */
    @When("^confirm lifecycle event trade change and wait for page ready$")
    public void confirmLifecycleEventTradeChangeAndWait() {
        log.info("[TradeLifecycleEventSteps] Confirming trade change confirmation; waiting for trigger-event response");
        ctx.clickAndWaitForResponse("trade_change_confirmation.confirm_btn", "/trades/trigger-event", "POST");
    }

    /**
     * Clicks Confirm & Save in the TradeChangeConfirmation dialog, waits for
     * {@code POST /trades/trigger-event} to complete, and stores the response body
     * in scenario context under {@code responseCtxKey}.
     */
    @When("^confirm lifecycle event trade change and capture response as '([^']*)'$")
    public void confirmLifecycleEventTradeChangeAndCaptureResponse(String responseCtxKey) {
        log.info("[TradeLifecycleEventSteps] Confirming trade change confirmation; capturing trigger-event response as '{}'", responseCtxKey);
        String responseBody = ctx.clickAndCaptureResponse(
                "trade_change_confirmation.confirm_btn",
                "/trades/trigger-event",
                "POST"
        );
        ctx.set(responseCtxKey, responseBody);
    }


    private OreoModuleConfiguration.Mode resolveRiskEngineMode() { return ctx.riskEngineMode(); }


    private String tradeRiskCalculationUrl(String tradeId) { return "/trades/" + tradeId + "/calculate-risk"; }

    private String tradePartialRiskCalculationUrl(String tradeId) {
        return "/trades/" + tradeId + "/calculate-partial-novation-risk";
    }
}
