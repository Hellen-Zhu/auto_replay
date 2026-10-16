package com.example.module.oreo.glue.api;

import com.example.module.oreo.testdata.CaseId;
import com.example.module.oreo.testdata.ExpectedResponses;
import com.example.module.oreo.testdata.ResponseMasker;
import com.example.module.oreo.testdata.SetupData;
import com.example.module.oreo.testdata.TestData;
import cucumber.api.Scenario;
import cucumber.api.java.Before;
import cucumber.api.java.en.Then;
import io.restassured.path.json.JsonPath;
import net.javacrumbs.jsonunit.JsonAssert;
import org.hamcrest.Matchers;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

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
        assertResponseFieldEquals(jsonPath, expected);
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

    /** Strict comparison with the {@code response} of setup file {@code data/setup/<key>.json}; never records. */
    @Then("^response matches expected from test data '([^']*)'$")
    public void responseMatchesExpectedFromTestData(String key) {
        SetupData setup = TestData.setup(key);
        if (!setup.hasResponse()) {
            throw new AssertionError("[ApiResponseAssertionSteps] Setup data '" + key + "' has no response.");
        }
        assertResponseMatches(setup.response(), "setup data '" + key + "'");
    }

    /**
     * Strict comparison with the recorded response of the case, {@code data/api/expected/<event>/<caseId>.json}
     * (a patch file is applied to its base first). A missing file is recorded (the actual response with the case's
     * {@code dynamicFields} masked, in full) and the scenario fails once, so the recording is reviewed; with
     * {@code OREO_EXPECTED=update} (or {@code -Doreo.expected=update}) the file is rewritten without being read and
     * the step passes.
     */
    @Then("^response matches current scenario$")
    public void responseMatchesCurrentScenario() {
        String tcKey = ctx.find("_tc.key");
        if (tcKey == null) {
            throw new AssertionError("[ApiResponseAssertionSteps] No [TC-...] case ID in the scenario name");
        }
        CaseId id = CaseId.parse(tcKey);
        ExpectedResponses expectedResponses = ExpectedResponses.standard();
        Path file = expectedResponses.fileFor(id);
        String actual = ctx.helper().response().extract().asString();
        boolean update = ExpectedResponses.updateMode();
        Optional<ExpectedResponses.Resolved> recorded = update ? Optional.empty() : expectedResponses.resolve(id);

        if (update || recorded.isEmpty()) {
            String masked = ResponseMasker.mask(actual, TestData.forCase(tcKey).dynamicFields(), tcKey);
            expectedResponses.write(id, masked);
            if (recorded.isEmpty() && !update) {
                ctx.write("[expected:recorded] " + file + "\n" + masked);
                throw new AssertionError("Expected response recorded to " + file
                        + ": review it against the requirement, commit it, run again.");
            }
            ctx.write("[expected:updated] " + file + "\n" + masked);
            log.info("[ApiResponseAssertionSteps] expected response of {} updated: {}", tcKey, file);
            return;
        }

        ExpectedResponses.Resolved expected = recorded.get();
        log.info("[ApiResponseAssertionSteps] comparing the response of {} with {}", tcKey, expected.describe());
        try {
            JsonAssert.assertJsonEquals(expected.json(), actual);
        } catch (AssertionError e) {
            throw new AssertionError(e.getMessage() + "\nExpected file: " + expected.describe()
                    + "\nIf the change is intended, run again with OREO_EXPECTED=update, compact with"
                    + " mvn test -Dtest=CompactExpectedFiles -Doreo.compact=" + id.eventFile()
                    + ", and review the diff.", e);
        }
    }

    private void assertResponseMatches(String expected, String sourceLabel) {
        String actual = ctx.helper().response().extract().asString();
        log.info("[ApiResponseAssertionSteps] comparing response snapshot for {}", sourceLabel);
        JsonAssert.assertJsonEquals(expected, actual);
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
}
