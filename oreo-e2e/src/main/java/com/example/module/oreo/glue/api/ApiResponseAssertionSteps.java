package com.example.module.oreo.glue.api;

import com.example.module.oreo.testdata.TestDataLoader;
import com.example.module.oreo.testdata.TestDataRecord;
import cucumber.api.Scenario;
import cucumber.api.java.Before;
import cucumber.api.java.en.Then;
import io.restassured.path.json.JsonPath;
import net.javacrumbs.jsonunit.JsonAssert;
import org.hamcrest.Matchers;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;

/**
 * Framework-level API response assertions.
 */
public class ApiResponseAssertionSteps {

    private static final Logger log = LoggerFactory.getLogger(ApiResponseAssertionSteps.class);

    private RestServiceResolver.Context ctx;

    @Before
    public void beforeScenario(Scenario scenario) {
        this.ctx = RestServiceResolver.from(scenario);
    }

    @Then("^response body contains a key '(.+)' as '(.+)'$")
    public void responseBodyContainsKeyAs(String jsonPath, String expectedLiteral) {
        assertResponseFieldEquals(jsonPath, expectedLiteral);
    }

    @Then("^response body contains a key '(.+)' with stored variable '(.+)'$")
    public void responseBodyContainsKeyWithStoredVariable(String jsonPath, String varName) {
        String expected = ctx.get(varName);
    }

    @Then("^response body contains a non-empty value at key '(.+)'$")
    public void responseBodyContainsNonEmptyValueAtKey(String jsonPath) {
        Object value = ctx.helper().response().extract().path(jsonPath);
        if (value == null) {
            throw new AssertionError(
                    "Expected JSONPath '" + jsonPath + "' to resolve to a non-null value, but got null.");
        }
        if (value instanceof String stringValue && stringValue.trim().isEmpty()) {
            throw new AssertionError(
                    "Expected JSONPath '" + jsonPath + "' to resolve to a non-empty string, but got blank.");
        }
        if (value instanceof List<?> listValue && listValue.isEmpty()) {
            throw new AssertionError(
                    "Expected JSONPath '" + jsonPath + "' to resolve to a non-empty list, but it was empty.");
        }
        if (value instanceof Map<?, ?> mapValue && mapValue.isEmpty()) {
            throw new AssertionError(
                    "Expected JSONPath '" + jsonPath + "' to resolve to a non-empty object, but it was empty.");
        }
        log.info("[ApiResponseAssertionSteps] asserted '{}' resolves to a non-empty value", jsonPath);
    }

    @Then("^response body contains an element in '(.+)' with key '(.+)' with stored variable '(.+)'$")
    public void responseBodyContainsElementInArrayWithKeyFromStoredVariable(String arrayPath, String key, String varName) {
        String expected = ctx.get(varName);
        assertResponseArrayContainsElementWithKey(arrayPath, key, expected);
    }

    @Then("^response matches expected from test data '([^']*)'$")
    public void responseMatchesExpectedFromTestData(String key) {
        assertResponseMatches(
                expectedResponseFromTestData(key),
    }

    @Then("^response matches current scenario$")
    public void responseMatchesCurrentScenario() {
        String tcKey = ctx.get("_tc.key");
        assertResponseMatches(
                expectedResponseFromCurrentScenario(),
                "current scenario (TC-ID='" + tcKey + "')"
        );
    }

    private String expectedResponseFromTestData(String key) {
        TestDataRecord record = TestDataLoader.forKey(key);
        if (!record.hasResponse()) {
            throw new AssertionError(
                    "[ApiResponseAssertionSteps] Test data '" + key + "' has no 'response:' node.");
        }
        return requireExpectedResponse(record.response(), "test data '" + key + "'");
    }

    private String expectedResponseFromCurrentScenario() {
        String expected = ctx.get("_tc.response");
        return requireExpectedResponse(expected, currentScenarioLabel());
    }

    private String requireExpectedResponse(String expected, String sourceLabel) {
        if (expected == null || expected.trim().isEmpty()) {
            throw new AssertionError(
                    "[ApiResponseAssertionSteps] No expected response found from " + sourceLabel + ".");
        }
        return expected;
    }

    private void assertResponseMatches(String expected, String sourceLabel) {
    }

    private void assertResponseFieldEquals(String jsonPath, String expected) {
        ctx.helper().response().body(jsonPath, Matchers.hasToString(expected));
        log.info("[ApiResponseAssertionSteps] asserted '{}' = '{}'", jsonPath, expected);
    }

    private void assertResponseArrayContainsElementWithKey(String arrayPath, String key, String expected) {
        String actualBody = ctx.helper().response().extract().asString();
        Object extracted = JsonPath.from(actualBody).get(arrayPath);

        if (!(extracted instanceof List<?> elements)) {
            throw new AssertionError(
                    "Expected JSONPath '" + arrayPath + "' to resolve to a list, but got: "
                            + (extracted == null ? "null" : extracted.getClass().getSimpleName())
            );
        }

        boolean matchFound = elements.stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(element -> element.get(key))
                .anyMatch(value -> value != null && expected.equals(String.valueOf(value)));

        if (!matchFound) {
            throw new AssertionError(
                    "Expected array '" + arrayPath + "' to contain an element with key '" + key
                            + "' = '" + expected + "', but none was found. Response body: " + actualBody
            );
        }

        log.info("[ApiResponseAssertionSteps] asserted array '{}' contains key '{}' = '{}'", arrayPath, key, expected);
    }

    private String currentScenarioLabel() {
        return "current scenario (TC-ID='" + ctx.get("_tc.key") + "')";
    }
}
