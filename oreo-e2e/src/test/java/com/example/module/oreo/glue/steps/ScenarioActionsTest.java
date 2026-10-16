package com.example.module.oreo.glue.steps;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.example.module.oreo.OreoModule;
import com.example.module.oreo.testdata.TestDataLoader;
import com.example.module.oreo.testdata.TestDataRecord;
import com.example.module.oreo.utils.ScenarioContext;
import java.util.List;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/**
 * The actions a scenario does, in order, with the values of its case data: the steps run against the recording
 * session, as Cucumber runs them (the hook's injection included).
 */
class ScenarioActionsTest {

    private final ScenarioContext ctx = new ScenarioContext();
    private final OreoModule session = new OreoModule(ctx);

    private void inject(String tcId) {
        TestDataLoader.setCurrentCase(tcId);
        TestDataRecord record = TestDataLoader.getByTcId(tcId);
        record.flattenRequest().forEach(ctx::setAttribute);
    }

    @AfterEach
    void clear() {
        TestDataLoader.clearCurrentCase();
    }

    private List<String> log() {
        return session.log().stream()
            .map(l -> l.replaceAll("TRADE-\\d+", "TRADE-n").replaceAll("TASK-\\d+", "TASK-n"))
            .collect(Collectors.toList());
    }

    @Test
    void earlyTerminationOfAnFsbTrade() {
        inject("TC-TRADE-EARLY-TERMINATION-FX_FSB-UI-001");
        TradeLifecycleEventSteps lifecycle = new TradeLifecycleEventSteps(session);
        TradeEarlyTerminationSteps steps = new TradeEarlyTerminationSteps(session, lifecycle);

        new TradeProvisioningSteps(session).aLiveTradeExists("FX_FSB");
        new AuthenticationSteps(session).isLoggedIn("maker");
        steps.performEarlyTermination("FX_FSB");
        steps.earlyTerminationCompleted();
        steps.tradeIsClosedAsTerminated();

        assertEquals(List.of(
            "POST /trades/create?tradeAction=SUBMIT as <accounts.maker.email> trade={\"basic\":{\"counterpartyFmId\":\"300036958\","
                + "\"counterpartyName\":\"10 AM NY\",\"portfolioId\":\"ABS_EQF\",\"productId\":\"FX_PSCRIPT_FSKO\",\"direction\":\"Buy\","
                + "\"premiumAmount\":10000,\"premiumCurrency\":\"USD\"}} datFile=src/test/resources/data/FX_PSCRIPT_FSKO.dat",
            "POST /checker/tasks/TASK-n/approve as <accounts.checker.email> {}",
            "navigate /login",
            "assert visible testId=login-dialog",
            "type '<accounts.maker.email>' into testId=login-email-input",
            "type '<accounts.maker.password>' into testId=login-password-input",
            "click testId=login-sign-in-to-portal-btn",
            "type 'TRADE-n' into trade_portal.search_input",
            "right-click row 'TRADE-n' of trade_portal.all_trade_blotter",
            "assert visible trade_portal.row_action_earlytermination",
            "click trade_portal.row_action_earlytermination",
            "assert visible dynamic_action.dialog",
            "click dynamic_action.et_direction_select",
            "click option 'Pay'",
            "type '100' into dynamic_action.amount_input",
            "type 'USD' into dynamic_action.et_ccy_input",
            "click dynamic_action.confirm_btn and wait for POST /trades/TRADE-n/calculate-risk",
            "assert visible trade_change_confirmation.dialog",
            "click trade_change_confirmation.confirm_btn and wait for POST /trades/trigger-event",
            "assert toast success description 'EarlyTermination completed successfully'",
            "navigate /trades",
            "type 'TRADE-n' into trade_portal.search_input",
            "assert trade_portal.all_trade_blotter row 'TRADE-n' column status is 'DEAD'",
            "assert trade_portal.all_trade_blotter row 'TRADE-n' column eventStatus is 'Terminated'"), log());
    }

    @Test
    void stepInFullTradeOfACoProduct() {
        inject("TC-TRADE-CREATION-FX_CO-UI-002");
        TradeCreationSteps steps = new TradeCreationSteps(session);

        new AuthenticationSteps(session).isLoggedIn("maker");
        steps.createsAStepInFullTrade("FX_CO");
        steps.tradeIsPendingApproval();

        assertEquals(List.of(
            "navigate /login",
            "assert visible testId=login-dialog",
            "type '<accounts.maker.email>' into testId=login-email-input",
            "type '<accounts.maker.password>' into testId=login-password-input",
            "click testId=login-sign-in-to-portal-btn",
            "click trade_portal.new_trade_btn",
            "assert visible new_trade.container",
            "upload src/test/resources/data/FX_PSCRIPT.dat into new_trade.file_input",
            "type '10 AM NY' into new_trade.counterparty_select",
            "click option '10 AM NY'",
            "type 'CM_OIL_CRU_OPT' into new_trade.portfolio_select",
            "click option 'CM_OIL_CRU_OPT'",
            "type 'FX_PSCRIPT' into new_trade.product_id_input",
            "click option 'FX_PSCRIPT'",
            "type 'Sell' into new_trade.direction_select",
            "click option 'Sell'",
            "click new_trade.stepin_toggle",
            "click new_trade.stepin_full_radio",
            "type 'ACACSUPRIANI SUP*JBA' into new_trade.stepin_old_counterparty_select",
            "click option 'ACACSUPRIANI SUP*JBA'",
            "click new_trade.book_btn and wait for POST /trades/calculate-risk-for-new",
            "assert visible trade_change_confirmation.dialog",
            "click trade_change_confirmation.confirm_btn and capture POST /trades/create?tradeAction=SUBMIT",
            "assert trade_detail.header_card contains 'TRADE-n'",
            "assert trade_detail.header_card contains 'PARV'"), log());
    }
}
