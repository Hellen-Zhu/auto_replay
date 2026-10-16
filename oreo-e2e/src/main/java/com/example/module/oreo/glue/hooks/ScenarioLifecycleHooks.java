package com.example.module.oreo.glue.hooks;

import com.example.module.oreo.glue.ScenarioContext;
import com.example.module.oreo.testdata.TestDataLoader;
import com.example.module.oreo.testdata.TestDataRecord;
import com.fasterxml.jackson.databind.JsonNode;
import io.cucumber.java.After;
import io.cucumber.java.Before;
import io.cucumber.java.Scenario;
import java.util.Map;

/**
 * Same injection as the E2E project's ScenarioLifecycleHooks.injectTestDataIntoContext: only where the record comes
 * from changed (TestDataLoader resolves the layered files). The ctx keys stay {@code _tc.key}, {@code _tc.request},
 * {@code _tc.response}, {@code _tc.request.<field>} (JsonNode) and the flattened leaves ({@code basic.productId}).
 *
 * <p>One difference: a scenario whose feature has a data file always gets its data (the defaults when the case has
 * no entry of its own), so "no matching YAML entry" can only mean a feature without any data.
 */
public class ScenarioLifecycleHooks {

    private final ScenarioContext ctx;

    public ScenarioLifecycleHooks(ScenarioContext ctx) {
        this.ctx = ctx;
    }

    @Before(order = 1)
    public void injectTestDataIntoContext(Scenario scenario) {
        String tcId = TestDataLoader.tcKeyFromName(scenario.getName());
        if (tcId == null) {
            return; // no [TC-...] token: background-only or infrastructure scenario
        }
        // TestDataLoader.forKey(...) in an API setup step then applies this case's setup changes and product
        TestDataLoader.setCurrentCase(tcId);

        TestDataRecord record;
        try {
            record = TestDataLoader.getByTcId(tcId);
        } catch (AssertionError e) {
            scenario.log("[ScenarioLifecycleHooks] " + e.getMessage() + " - ctx injection skipped");
            return;
        }

        ctx.setAttribute("_tc.key", tcId);
        ctx.setAttribute("_tc.request", record.request());
        ctx.setAttribute("_tc.response", record.response());
        if (record.request() != null) {
            scenario.log("[test-data:request] source=current scenario (TC-ID='" + tcId + "')\n" + record.request());
        }
        if (record.response() != null) {
            scenario.log("[test-data:response] source=current scenario (TC-ID='" + tcId + "')\n" + record.response());
        }

        // Each top-level request field as a JsonNode: ctx.get("_tc.request.basic")
        JsonNode request = record.requestNode();
        if (request != null) {
            request.fields().forEachRemaining(e -> ctx.setAttribute("_tc.request." + e.getKey(), e.getValue()));
        }

        // Flattened leaves for snippets: 'basic.counterpartyName'
        Map<String, String> fields = record.flattenRequest();
        fields.forEach(ctx::setAttribute);
    }

    @After(order = 1)
    public void clearCurrentCase() {
        TestDataLoader.clearCurrentCase();
    }
}
