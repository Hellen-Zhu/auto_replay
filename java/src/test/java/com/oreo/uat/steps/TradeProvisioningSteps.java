package com.oreo.uat.steps;

import com.fasterxml.jackson.databind.JsonNode;
import com.oreo.uat.support.DatFiles;
import com.oreo.uat.support.OreoSession;
import com.oreo.uat.testdata.TestDataLoader;
import io.cucumber.java.en.Given;

/**
 * Trades a case needs before it starts, created through the API (TradeProvisioningSteps of the E2E project):
 * common_trade_action.snippet maps "a Live '$1' trade exists in the blotter" to "a live '$1' trade is provisioned
 * via playwright api". The body is the setup data {@code API-SETUP-TRADE-CREATE} with the product's ID.
 */
public class TradeProvisioningSteps {

    static final String SETUP_KEY = "API-SETUP-TRADE-CREATE";
    static final String SUBMIT_PATH = "/trades/create?tradeAction=SUBMIT";

    private final OreoSession session;

    public TradeProvisioningSteps(OreoSession session) {
        this.session = session;
    }

    @Given("a Live {string} trade exists in the blotter")
    public void aLiveTradeExists(String product) {
        provisionLiveTrade(product);
    }

    /** The maker submits the trade, the checker approves its task: the trade is LIVE. */
    public void provisionLiveTrade(String product) {
        submitTradeAsPendingApproval(product);
        approveTask(session.ctx().text("createdTaskId"), "checker");
    }

    public void submitTradeAsPendingApproval(String product) {
        String tradeJson = TestDataLoader.forKey(SETUP_KEY, product).request();
        JsonNode body = session.api().postMultipart(SUBMIT_PATH, session.config().email("maker"),
            "trade", tradeJson, "datFile", DatFiles.forProduct(product));
        session.ctx().setAttribute("createdTradeId", body.at("/data/trade/id").asText());
        session.ctx().setAttribute("createdTaskId", body.at("/data/checkerContext/taskId").asText());
    }

    /**
     * Not seen in the E2E project (the body of approveTask): taken from the browser's Network tab, POST with the body
     * {} (confirmed on the real system by the replay project).
     */
    public void approveTask(String taskId, String role) {
        session.api().postJson("/checker/tasks/" + taskId + "/approve", session.config().email(role), "{}");
    }
}
