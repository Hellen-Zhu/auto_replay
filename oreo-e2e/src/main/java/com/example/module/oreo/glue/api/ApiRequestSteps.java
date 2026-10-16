package com.example.module.oreo.glue.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.example.module.oreo.testdata.TestDataLoader;
import com.example.module.oreo.testdata.TestDataRecord;
import cucumber.api.Scenario;
import cucumber.api.java.Before;
import cucumber.api.java.en.Given;
import cucumber.api.java.en.Then;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ApiRequestSteps {

    private static final Logger log = LoggerFactory.getLogger(ApiRequestSteps.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private RestServiceResolver.Context ctx;

    @Before
    public void beforeScenario(Scenario scenario) {
        this.ctx = RestServiceResolver.from(scenario);
    }

    /**
     * Extracts a value from the response body by JSONPath and stores it as a scenario variable.
     *
     * <pre>Given store response field 'data.id' as 'reasonId'</pre>
     */
    @Given("^store response field '(.+)' as '(.+)'$")
    public void storeResponseField(String jsonPath, String varName) {
        Object value = ctx.helper().response().extract().path(jsonPath);
        if (value == null) {
            throw new AssertionError(
                    "[ApiRequestSteps] JSONPath '" + jsonPath + "' returned null — cannot store as '" + varName + "'");
        }
        String stringValue = String.valueOf(value);
        ctx.set(varName, stringValue);
        ctx.write("[stored] " + varName + " = " + stringValue);
        log.info("[ApiRequestSteps] stored '{}' = '{}'", varName, stringValue);
    }

    /**
     * Stores a literal value as a scenario variable.
     *
     * <pre>Given store api variable value 'NON-EXISTENT' as 'nonExistentTradeId'</pre>
     */
    @Given("^store api variable value '(.+)' as '(.+)'$")
    public void storeLiteralValue(String value, String varName) {
        ctx.set(varName, value);
        ctx.write("[stored] " + varName + " = " + value);
        log.info("[ApiRequestSteps] stored '{}' = '{}'", varName, value);
    }

    @Given("^set path parameter '(.+)' from stored variable '(.+)'$")
    public void setPathParamFromStoredVariable(String paramName, String varName) {
        String value = ctx.get(varName);
        setPathParam(paramName, value, "stored variable '" + varName + "'");
    }

    @Given("^set path parameter '(.+)' to '(.+)'$")
    public void setPathParamToValue(String paramName, String value) {
        setPathParam(paramName, value, "literal value");
    }

    @Given("^set query parameter '(.+)' as '(.+)'$")
    public void setQueryParamAsValue(String paramName, String value) {
        setQueryParam(paramName, value, "literal value");
    }

    @Given("^set query parameter '(.+)' from stored variable '(.+)'$")
    public void setQueryParamFromStoredVariable(String paramName, String varName) {
        String value = ctx.get(varName);
        setQueryParam(paramName, value, "stored variable '" + varName + "'");
    }

    /**
     * Promotes a stored scenario variable into a DatabaseGlue query token
     * ({@code queryToken.<name>}) so it can be referenced as {@code ${name}} in SQL DataTables.
     *
     * <pre>Given set query token 'tradeId' from stored variable 'createdTradeId'</pre>
     */
    @Given("^set query token '(.+)' from stored variable '(.+)'$")
    public void setQueryTokenFromStoredVariable(String tokenName, String varName) {
        String value = ctx.get(varName);
        ctx.set("queryToken." + tokenName, value);
        ctx.write("[query token] " + tokenName + " = " + value);
        log.info("[ApiRequestSteps] set query token '{}' = '{}'", tokenName, value);
    }

    @Given("^set request body from test data '([^']*)'$")
    public void setRequestBodyFromTestData(String key) {
        setRequestBody(
                requestBodyFromTestData(key),
                "test data '" + key + "'"
        );
    }

    @Given("^set request body from current scenario$")
    public void setRequestBodyFromCurrentScenario() {
        setRequestBody(
                requestBodyFromCurrentScenario(),
                currentScenarioLabel()
        );
    }

    @Given("^set json request body from current scenario with trade id from stored variable '([^']*)'$")
    public void setEventRequestBodyFromCurrentScenarioWithTradeId(String varName) {
        setJsonRequestBodyWithTradeId(
                requestBodyFromCurrentScenario(),
                ctx.get(varName),
                currentScenarioLabel(),
                varName
        );
    }

    @Given("^set json request body from test data '([^']*)' with trade id from stored variable '([^']*)'$")
    public void setEventRequestBodyFromTestDataWithTradeId(String key, String varName) {
        setJsonRequestBodyWithTradeId(
                requestBodyFromTestData(key),
                ctx.get(varName),
                "test data '" + key + "'",
                varName
        );
    }

    @Given("^set json request body from current scenario with task ids from stored variables '([^']*)' and '([^']*)'$")
    public void setJsonRequestBodyFromCurrentScenarioWithTaskIds(String varName1, String varName2) {
        String requestBody = ctx.get("_tc.request");
        String taskId1 = ctx.get(varName1);
        String taskId2 = ctx.get(varName2);
        try {
            ObjectNode body = (ObjectNode) MAPPER.readTree(requestBody);
            body.putArray("taskIds").add(taskId1).add(taskId2);
            ctx.helper().request().body(MAPPER.writeValueAsString(body));
            log.info("[ApiRequestSteps] set bulk task request body from current scenario ('{}') with taskIds from '{}' and '{}'",
                    ctx.get("_tc.key"), varName1, varName2);
        } catch (Exception e) {
            throw new AssertionError(
                    "[ApiRequestSteps] Failed to inject task IDs into bulk request body for scenario key '"
                    + ctx.get("_tc.key") + "': " + e.getMessage(), e);
        }
    }

    private void setPathParam(String paramName, String value, String valueSourceLabel) {
        if (value == null || value.isBlank()) {
            throw new AssertionError(
                    "[ApiRequestSteps] " + valueSourceLabel
                    + " is null/blank — cannot set path parameter '" + paramName + "'");
        }
        ctx.write("[request:path] " + paramName + " = " + value);
        ctx.helper().request().pathParam(paramName, value);
        log.info("[ApiRequestSteps] set path param '{}' = '{}'", paramName, value);
    }

    private void setQueryParam(String paramName, String value, String valueSourceLabel) {
        if (value == null || value.isBlank()) {
            throw new AssertionError(
                    "[ApiRequestSteps] " + valueSourceLabel
                    + " is null/blank — cannot set query parameter '" + paramName + "'");
        }
        ctx.write("[request:query] " + paramName + " = " + value);
        ctx.helper().request().queryParam(paramName, value);
        log.info("[ApiRequestSteps] set query param '{}' = '{}'", paramName, value);
    }

    private String requestBodyFromTestData(String key) {
        TestDataRecord record = TestDataLoader.forKey(key);
        if (!record.hasRequest()) {
            throw new AssertionError(
                    "[ApiRequestSteps] Test data '" + key + "' has no 'request:' node.");
        }
        return requireRequestBody(record.request(), "test data '" + key + "'");
    }

    private String requestBodyFromCurrentScenario() {
        String tcKey = ctx.get("_tc.key");
        String requestBody = ctx.get("_tc.request");
        return requireRequestBody(requestBody, "current scenario (TC-ID='" + tcKey + "')");
    }

    private String requireRequestBody(String requestBody, String sourceLabel) {
        if (requestBody == null || requestBody.isBlank()) {
            throw new AssertionError(
                    "[ApiRequestSteps] No request body found from " + sourceLabel + ".");
        }
        return requestBody;
    }

    private void setRequestBody(String requestBody, String sourceLabel) {
        ctx.helper().request().body(requestBody);
        ctx.write("[request:body] source=" + sourceLabel + "\n" + requestBody);
        log.info("[ApiRequestSteps] set request body from {}: {}", sourceLabel, requestBody);
    }

    private String currentScenarioLabel() {
        return "current scenario (TC-ID='" + ctx.get("_tc.key") + "')";
    }

    private void setJsonRequestBodyWithTradeId(
            String requestBody,
            String tradeId,
            String sourceLabel,
            String varName) {
        if (tradeId == null || tradeId.isBlank()) {
            throw new AssertionError(
                    "[ApiRequestSteps] stored variable '" + varName
                    + "' is null/blank — cannot inject tradeId into request body from " + sourceLabel);
        }

        try {
            ObjectNode body = (ObjectNode) MAPPER.readTree(requestBody);
            body.putArray("tradeIds").add(tradeId);
            String finalRequestBody = MAPPER.writeValueAsString(body);

            ctx.helper().request().body(finalRequestBody);
            ctx.write("[request:body] source=" + sourceLabel + "\n" + finalRequestBody);
            log.info("[ApiRequestSteps] set event request body from {} with tradeId='{}' (varName='{}'): {}",
                    sourceLabel, tradeId, varName, finalRequestBody);
        } catch (Exception e) {
            throw new AssertionError(
                    "[ApiRequestSteps] Failed to inject tradeId into request body from "
                    + sourceLabel + ": " + e.getMessage(), e);
        }
    }
}
