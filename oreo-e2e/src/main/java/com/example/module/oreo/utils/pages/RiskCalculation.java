package com.example.module.oreo.utils.pages;

import com.example.module.oreo.OreoModuleConfiguration.Mode;
import com.example.module.oreo.testdata.TestDataLoader;
import com.example.module.oreo.utils.ui.OreoUi;

/**
 * The risk calculation a click starts (TradeLifecycleEventSteps: "... using configured risk engine mode ..."): with
 * the real engine the click waits for the answer; with the mock the request is answered with the setup data
 * {@code UI-SETUP-RISK-CALC-NEW-SUCCESS}.
 */
public final class RiskCalculation {

    static final String MOCK_RESPONSE_KEY = "UI-SETUP-RISK-CALC-NEW-SUCCESS";

    private RiskCalculation() {
    }

    /** tradeRiskCalculationUrl(tradeId) */
    public static String forTrade(String tradeId) {
        return "/trades/" + tradeId + "/calculate-risk";
    }

    /** Before a new trade is saved or booked; taken to be answered like the trade's own calculation */
    public static String forNewTrade() {
        return "/trades/calculate-risk-for-new";
    }

    public static void clickUsingMode(OreoUi ui, Mode mode, String element, String url) {
        switch (mode) {
            case MOCK:
                ui.clickWithMockedResponse(element, url, "POST", 200, TestDataLoader.forKey(MOCK_RESPONSE_KEY).response());
                return;
            case REAL:
                ui.clickAndWaitForResponse(element, url, "POST");
                return;
            default:
                throw new IllegalStateException("Unhandled risk engine mode " + mode);
        }
    }
}
