package com.example.module.oreo.glue.ui;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.microsoft.playwright.Locator;
import cucumber.api.Scenario;
import cucumber.api.java.Before;
import cucumber.api.java.en.And;
import cucumber.api.java.en.When;
import io.restassured.path.json.JsonPath;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CommonE2EInteraction {

    private static final Logger log = LoggerFactory.getLogger(CommonE2EInteraction.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private PlaywrightServiceResolver.Context ctx;

    @Before({"@playwright"})
    public void beforeScenario(Scenario scenario) { this.ctx = PlaywrightServiceResolver.from(scenario); }

    /**
     * Stores a literal value as a scenario variable.
     *
     * <pre>Given store literal value 'NON-EXISTENT' as 'nonExistentTradeId'</pre>
     */
    @When("^store e2e variable value '(.+)' as '(.+)'$")
    public void storeE2EVariableValue(String value, String varName) {
        ctx.set(varName, value);
        ctx.write("Stored E2E variable " + varName + " = " + value);
        log.info("[CommonE2EInteraction] stored '{}' = '{}'", varName, value);
    }

    @And("^click option '(.+)'$")
    public void clickOption(String name) { ctx.clickOption(name); }

    @And("^click option from stored variable '(.+)'$")
    public void clickOptionFromCtx(String ctxKey) {
        String option = ctx.get(ctxKey);
        ctx.write("Option from scenario context variable '" + ctxKey + "' is: " + option);
        ctx.clickOption(option);
    }

    @When("^store e2e response field '(.+)' from stored variable '([^']*)' as '([^']*)'$")
    public void storeResponseFieldFromStoredVariable(String jsonPath, String responseCtxKey, String targetVarName) {
        String responseBody = ctx.get(responseCtxKey);
        try {
            MAPPER.readTree(responseBody);
        } catch (Exception e) {
            throw new AssertionError(
                    "Stored variable '" + responseCtxKey + "' is not valid JSON response content.",
                    e
            );
        }

        Object value = JsonPath.from(responseBody).get(jsonPath);
        if (value == null) {
            throw new AssertionError(
                    "JSONPath '" + jsonPath + "' returned null from stored variable '" + responseCtxKey + "'."
            );
        }

        String stringValue = String.valueOf(value);
        ctx.set(targetVarName, stringValue);
        ctx.write("[stored] " + targetVarName + " = " + stringValue);
        log.info("[CommonE2EInteraction] stored '{}' = '{}' from '{}.{}'", targetVarName, stringValue, responseCtxKey, jsonPath);
    }

    @When("^type value '([^']*)' into '([^']*)'$")
    public void typeValueIntoInnerInput(String input, String elementKey) {
        Locator innerInput = ctx.service().getLocator(elementKey).locator("input[part='input'], textarea[part='input']");
        innerInput.fill(input);
    }

    @When("^type '([^']*)' from stored variable into '([^']*)'$")
    public void typeStoredVariableInto(String ctxKey, String elementKey) {
        String value = ctx.get(ctxKey);
        ctx.write("Typing value from scenario context: " + value);
        ctx.service().getLocator(elementKey).fill(value);
    }

    @When("^type inner value '([^']*)' from stored variable into '([^']*)'$")
    public void typeInnerValueFromStoredVariable(String ctxKey, String elementKey) {
        String value = ctx.get(ctxKey);
        ctx.write("Typing inner value from stored variable request: " + value);
        // [not in the photos: the rest of this method]
    }

    @When("^type inner value '([^']*)' from stored variable into '([^']*)' with dynamic value from stored variable '([^']*)'$")
    public void typeInnerValueFromStoredVariableWithDynamicValue(String ctxKey, String elementKey, String dynamicCtxKey) {
        String value = ctx.get(ctxKey);
        String dynamicValue = ctx.get(dynamicCtxKey);
        ctx.write("Typing inner value from stored variable request: " + value);
        ctx.write("Dynamic value from scenario context variable '" + dynamicCtxKey + "' is: " + dynamicValue);
        Locator innerInput = ctx.getLocatorWithParam(elementKey, dynamicValue)
                .locator("input[part='input'], textarea[part='input']");
        innerInput.fill(value);
    }

    @When("^click element '([^']*)' with dynamic value '([^']*)'$")
    public void clickElementWithDynamicValue(String locatorName, String value) {
        ctx.getLocatorWithParam(locatorName, value).click();
    }

    @When("^click element '([^']*)' with dynamic value from stored variable '([^']*)'$")
    public void clickElementWithDynamicValueFromCtx(String locatorName, String ctxKey) {
        String value = ctx.get(ctxKey);
        ctx.write("Dynamic value from scenario context variable '" + ctxKey + "' is: " + value);
        ctx.getLocatorWithParam(locatorName, value).click();
    }

    @When("^hover element '([^']*)' with dynamic value from stored variable '([^']*)'$")
    public void hoverElementWithDynamicValueFromCtx(String locatorName, String ctxKey) {
        String value = ctx.get(ctxKey);
        ctx.write("Dynamic value from scenario context variable '" + ctxKey + "' is: " + value);
        ctx.getLocatorWithParam(locatorName, value).hover();
    }

    @When("^click element '([^']*)' with dynamic value from stored variable '([^']*)' and wait for product page ready$")
    public void clickElementWithDynamicValueFromCtxAndWaitForResponse(
            String locatorName, String ctxKey) {
        String value = ctx.get(ctxKey);
        ctx.write("Dynamic value from scenario context variable '" + ctxKey + "' is: " + value);
        ctx.clickAndWaitForResponse(ctx.getLocatorWithParam(locatorName, value), "/api/v1/products/productId/" + value, "GET");
    }

    @When("^atomic refresh webpage and wait for page ready$")
    public void refreshWebpageAndWaitForTradesApi() { ctx.refreshAndWaitForResponse("/api/v1/blotter/trades", "POST"); }
}
