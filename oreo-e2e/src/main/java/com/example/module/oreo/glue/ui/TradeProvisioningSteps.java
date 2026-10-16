package com.example.module.oreo.glue.ui;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.example.genie.module.rest.service.RequestResponseHelper;
import com.example.module.oreo.testdata.ProductDatFiles;
import com.example.module.oreo.testdata.TestData;
import com.example.module.oreo.testdata.TradeRequests;
import com.example.module.oreo.utils.RestApiUtil;
import cucumber.api.java.Before;
import cucumber.api.java.en.Given;
import cucumber.api.Scenario;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URL;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

public class TradeProvisioningSteps {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final Logger log = LoggerFactory.getLogger(TradeProvisioningSteps.class);
    private RequestResponseHelper helper;
    private PlaywrightServiceResolver.Context ctx;

    @Before({"@playwright"})
    public void beforeScenario(Scenario scenario) {
        this.ctx = PlaywrightServiceResolver.from(scenario);
        this.helper = RestApiUtil.helperFromScenario(scenario);
    }

    @Given("^a draft pending approval '([^']*)' trade is provisioned via playwright api$")
    public void provisionPendingTrade(String product) throws Exception {
        submitTradeAsPendingApproval("createdTradeId", "createdTaskId", "trade-create",
                ProductDatFiles.valueOf(product));
    }

    @Given("^a draft pending approval '([^']*)' stepin full trade is provisioned via playwright api$")
    public void provisionPendingStepInFullTrade(String product) throws Exception {
        submitTradeAsPendingApproval("createdTradeId", "createdTaskId", "trade-create-stepin-full", ProductDatFiles.valueOf(product));
    }

    @Given("^a draft pending approval '([^']*)' stepin partial trade is provisioned via playwright api$")
    public void provisionPendingStepInPartialTrade(String product) throws Exception {
        submitTradeAsPendingApproval("createdTradeId", "createdTaskId", "trade-create-stepin-partial", ProductDatFiles.valueOf(product));
    }

    @Given("^a live '([^']*)' trade is provisioned via playwright api$")
    public void provisionLiveTradeByProduct(String product) throws Exception {
        provisionLiveTradeAs("createdTradeId", "createdTaskId", "trade-create", ProductDatFiles.valueOf(product));
    }

    @Given("^a '([^']*)' trade with pending cancellation is provisioned via playwright api$")
    public void provisionPendingCancellation(String product) throws Exception {
        provisionLiveTradeAs("createdTradeId", "createdTaskId", "trade-create", ProductDatFiles.valueOf(product));
        provisionLifecycleEvent("createdTradeId", "createdTaskId", "trade-cancellation");
    }

    @Given("^multiple '([^']*)' trades with pending cancellation are provisioned via playwright api$")
    public void provisionMultiplePendingCancellation(String product) throws Exception {
        provisionLiveTradeAs("createdTradeId1", "createdTaskId1", "trade-create", ProductDatFiles.valueOf(product));
        provisionLifecycleEvent("createdTradeId1", "createdTaskId1", "trade-cancellation");
        provisionLiveTradeAs("createdTradeId2", "createdTaskId2", "trade-create", ProductDatFiles.valueOf(product));
        provisionLifecycleEvent("createdTradeId2", "createdTaskId2", "trade-cancellation");
    }

    @Given("^a dead '([^']*)' trade is provisioned via playwright api$")
    public void provisionDeadTrade(String product) throws Exception {
        provisionLiveTradeAs("createdTradeId", "createdTaskId", "trade-create", ProductDatFiles.valueOf(product));
        provisionLifecycleEvent("createdTradeId", "createdTaskId", "trade-cancellation");
        approveTask(ctx.get("createdTaskId"), "checker@example.com");
    }

    @Given("^a draft '([^']*)' trade is provisioned via playwright api$")
    public void provisionDraftTrade(String product) throws Exception {
        provisionLiveTradeAs("createdTradeId", "createdTaskId", "trade-create", ProductDatFiles.valueOf(product));
        provisionLifecycleEvent("createdTradeId", "createdTaskId", "trade-cancellation");
        rejectTask(ctx.get("createdTaskId"), "checker@example.com");
    }

    @Given("^amendment for stored trade is submitted as maker via playwright api$")
    public void submitAmendmentForStoredTrade() {
        submitAmendment("createdTradeId", "trade-amendment", "maker@example.com");
    }

    private void provisionLiveTradeAs(String tradeIdVar, String taskIdVar, String testDataKey, ProductDatFiles datFile) throws Exception {
        log.info("[TradeProvisioningSteps] Provisioning live trade: tradeIdVar='{}', taskIdVar='{}', testDataKey='{}', datFile='{}'",
                tradeIdVar, taskIdVar, testDataKey, datFile);
        submitTradeAsPendingApproval(tradeIdVar, taskIdVar, testDataKey, datFile);
        String taskId = ctx.get(taskIdVar);
        log.info("[TradeProvisioningSteps] Approving checker task for live trade: taskIdVar='{}', taskId='{}'", taskIdVar, taskId);
        approveTask(taskId, "checker@example.com");
        log.info("[TradeProvisioningSteps] Live trade provisioned successfully: tradeId='{}', taskId='{}'",
                ctx.get(tradeIdVar), ctx.get(taskIdVar));
    }

    private void submitTradeAsPendingApproval(String tradeIdVar, String taskIdVar, String testDataKey, ProductDatFiles datFile) throws Exception {
        log.info("[TradeProvisioningSteps] Submitting trade as pending approval: tradeIdVar='{}', taskIdVar='{}', testDataKey='{}', datFile='{}'",
                tradeIdVar, taskIdVar, testDataKey, datFile);

        JsonNode body = submitTrade("maker@example.com", testDataKey, datFile);
        String tradeId = body.at("/data/trade/id").asText();
        String taskId = body.at("/data/checkerContext/taskId").asText();

        log.info("[TradeProvisioningSteps] Trade submitted: extracted tradeId='{}', taskId='{}'", tradeId, taskId);

        ctx.set(tradeIdVar, tradeId);
        ctx.write("Trade created with id: " + tradeId);
        ctx.set(taskIdVar, taskId);
    }

    private void provisionLifecycleEvent(String tradeIdVar, String taskIdVar, String testDataKey) throws Exception {
        String tradeId = ctx.get(tradeIdVar);
        log.info("[TradeProvisioningSteps] Provisioning lifecycle event: tradeIdVar='{}', tradeId='{}', taskIdVar='{}', testDataKey='{}'",
                tradeIdVar, tradeId, taskIdVar, testDataKey);

        JsonNode body = triggerEvent(List.of(tradeId), "maker@example.com", testDataKey);
        String taskId = body.at("/data/results/0/checkerTaskId").asText();

        log.info("[TradeProvisioningSteps] Lifecycle event submitted: extracted checkerTaskId='{}'", taskId);

        ctx.set(taskIdVar, taskId);
    }

    private JsonNode submitTrade(String userId, String testDataKey, ProductDatFiles datFile) throws Exception {
        // The setup body carries no product: it is set from the dat file's product
        String tradeJson = TradeRequests.withProductId(setupRequest(testDataKey), datFile.name());
        URL resource = getClass().getClassLoader().getResource(datFile.path());

        log.info("[TradeProvisioningSteps] submitTrade: userId='{}', testDataKey='{}', datFile='{}', endpoint='{}'",
                userId, testDataKey, datFile, "/trades/create?tradeAction=SUBMIT");

        Path datFilePath = Paths.get(resource.toURI());

        JsonNode response = RestApiUtil.postMultipart(
                helper,
                "/trades/create?tradeAction=SUBMIT",
                userId,
                "trade",
                tradeJson,
                "datFile",
                datFilePath
        );

        log.info("[TradeProvisioningSteps] submitTrade completed successfully for testDataKey='{}'", testDataKey);
        return response;
    }

    private void submitAmendment(String tradeIdVar, String testDataKey, String userId) {
        String tradeId = ctx.get(tradeIdVar);
        String payload = setupRequest(testDataKey);

        log.info("[TradeProvisioningSteps] submitAmendment: tradeIdVar='{}', tradeId='{}', testDataKey='{}', userId='{}', endpoint='{}'",
                tradeIdVar, tradeId, testDataKey, userId, "/trades/" + tradeId + "/update");

        RestApiUtil.post(helper, "/trades/" + tradeId + "/update", userId, payload);

        log.info("[TradeProvisioningSteps] submitAmendment completed for tradeId='{}'", tradeId);
    }

    private JsonNode triggerEvent(List<String> tradeIds, String userId, String testDataKey) throws Exception {
        String raw = setupRequest(testDataKey);
        ObjectNode body = (ObjectNode) OBJECT_MAPPER.readTree(raw);
        ArrayNode arr = OBJECT_MAPPER.createArrayNode();
        tradeIds.forEach(arr::add);
        body.set("tradeIds", arr);

        log.info("[TradeProvisioningSteps] triggerEvent: tradeIds='{}', userId='{}', testDataKey='{}', endpoint='{}'",
                tradeIds, userId, testDataKey, "/trades/trigger-event");

        JsonNode response = RestApiUtil.post(
                helper,
                "/trades/trigger-event",
                userId,
                OBJECT_MAPPER.writeValueAsString(body)
        );

        log.info("[TradeProvisioningSteps] triggerEvent completed for tradeIds='{}'", tradeIds);
        return response;
    }

    /** The {@code request} of setup file {@code data/setup/<name>.json}. */
    private static String setupRequest(String name) {
        String request = TestData.setup(name).request();
        if (request == null) {
            throw new AssertionError("[TradeProvisioningSteps] Setup data '" + name + "' has no request.");
        }
        return request;
    }

    private JsonNode approveTask(String taskId, String userId) {
        log.info("[TradeProvisioningSteps] approveTask: taskId='{}', userId='{}', endpoint='{}'",
                taskId, userId, "/checker/tasks/" + taskId + "/approve");

        JsonNode response = RestApiUtil.post(helper, "/checker/tasks/" + taskId + "/approve", userId);

        log.info("[TradeProvisioningSteps] approveTask completed: taskId='{}'", taskId);
        return response;
    }

    private JsonNode rejectTask(String taskId, String userId) {
        log.info("[TradeProvisioningSteps] rejectTask: taskId='{}', userId='{}', endpoint='{}'",
                taskId, userId, "/checker/tasks/" + taskId + "/reject");

        JsonNode response = RestApiUtil.post(helper, "/checker/tasks/" + taskId + "/reject", userId);

        log.info("[TradeProvisioningSteps] rejectTask completed: taskId='{}'", taskId);
        return response;
    }
}
