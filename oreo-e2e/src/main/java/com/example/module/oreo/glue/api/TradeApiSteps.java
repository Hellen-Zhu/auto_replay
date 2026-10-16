package com.example.module.oreo.glue.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.example.module.oreo.testdata.ProductDatFiles;
import com.example.module.oreo.testdata.TestDataLoader;
import com.example.module.oreo.testdata.TestDataRecord;
import cucumber.api.Scenario;
import cucumber.api.java.Before;
import cucumber.api.java.en.Given;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.net.URL;
import java.nio.file.Paths;

public class TradeApiSteps {

    private static final Logger log = LoggerFactory.getLogger(TradeApiSteps.class);
    private static final ObjectMapper JSON_MAPPER = new ObjectMapper();
    private RestServiceResolver.Context ctx;

    @Before
    public void beforeScenario(Scenario scenario) {
        this.ctx = RestServiceResolver.from(scenario);
    }

    @Given("^set multi-part form parameter '(.+)' for product '([^']*)' from test data '([^']*)'$")
    public void setMultiPartFormParameterFromTestData(String partName, String product, String key) {
        TestDataRecord record = TestDataLoader.forKey(key);
        if (!record.hasRequest()) {
            throw new AssertionError(
                    "[TradeApiSteps] Test data '" + key + "' has no 'request:' node.");
        }
        String requestWithProductId = setBasicProductId(record.request(), product, key);
        ctx.helper().request().multiPart(partName, requestWithProductId, "application/json");
        log.info("[TradeApiSteps] set multi-part form parameter '{}' from test data '{}' as '{}'", partName, key,requestWithProductId);
    }

    /**
     *
     * <pre>And set multi-part form parameter 'trade' from current scenario</pre>
     */
    @Given("^set multi-part form parameter '(.+)' for product '([^']*)' from current scenario$")
    public void setMultiPartFormParameterFromCurrentScenario(String partName, String product) {
        String requestBody = ctx.get("_tc.request");
        String requestWithProductId = setBasicProductId(requestBody, product, ctx.get("_tc.key"));
        ctx.helper().request().multiPart(partName, requestWithProductId, "application/json");
        log.info("[TradeApiSteps] set multi-part form parameter '{}' from current scenario ('{}') as '{}'",
                partName, ctx.get("_tc.key"),requestWithProductId);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Multipart — dat file by product
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Attaches the dat file for the given product as the {@code datFile} multipart part.
     * The product name maps to a {@link ProductDatFiles} enum constant (case-insensitive,
     * spaces replaced with underscores).
     *
     * <p>Adding a new product requires only a new {@link ProductDatFiles} constant — no new
     * step needed.
     *
     * <pre>And set multi-part dat file for product 'FX_TRF'</pre>
     */
    @Given("^set multi-part dat file for product '([^']*)'$")
    public void setMultiPartDatFileForProduct(String product) {
        String enumName = product.trim().toUpperCase().replace(' ', '_');
        ProductDatFiles datFile;
        try {
            datFile = ProductDatFiles.valueOf(enumName);
        } catch (IllegalArgumentException e) {
            throw new AssertionError(
                    "[TradeApiSteps] Unknown product '" + product + "' — add '"
                    + enumName + "' to the ProductDatFiles enum first.");
        }
        attachDatFile(datFile.path());
    }

    // ─────────────────────────────────────────────────────────────────────
    // Private
    // ─────────────────────────────────────────────────────────────────────

    private void attachDatFile(String classpathPath) {
        ClassLoader cl = Thread.currentThread().getContextClassLoader();
        if (cl == null) cl = getClass().getClassLoader();
        URL resource = cl.getResource(classpathPath);
        if (resource == null) {
            throw new AssertionError(
                    "[TradeApiSteps] dat file '" + classpathPath + "' not found on classpath.");
        }
        try {
            ctx.helper().request().multiPart("datFile", Paths.get(resource.toURI()).toFile());
        } catch (Exception e) {
            throw new AssertionError(
                    "[TradeApiSteps] Failed to attach dat file '" + classpathPath + "': " + e.getMessage(), e);
        }
        log.info("[TradeApiSteps] attached dat file '{}'", classpathPath);
    }

    private String setBasicProductId(String requestJson, String productId, String key) {
        try {
            JsonNode rootNode = JSON_MAPPER.readTree(requestJson);
            if (!(rootNode instanceof ObjectNode rootObject)) {
                throw new AssertionError("[TradeApiSteps] request for key '" + key + "' must be a JSON object.");
            }

            ObjectNode basicNode;
            JsonNode existingBasicNode = rootObject.get("basic");
            if (existingBasicNode == null || existingBasicNode.isNull()) {
                basicNode = rootObject.putObject("basic");
            } else if (existingBasicNode instanceof ObjectNode objNode) {
                basicNode = objNode;
            } else {
                throw new AssertionError(
                        "[TradeApiSteps] request.basic for key '" + key + "' must be a JSON object.");
            }

            basicNode.put("productId", productId);
            return JSON_MAPPER.writeValueAsString(rootObject);
        } catch (Exception e) {
            throw new AssertionError(
                    "[TradeApiSteps] Failed to inject basic.productId for key '" + key + "': " + e.getMessage(), e);
        }
    }
}
