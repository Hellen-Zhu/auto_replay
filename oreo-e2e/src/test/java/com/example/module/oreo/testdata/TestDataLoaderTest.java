package com.example.module.oreo.testdata;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URISyntaxException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class TestDataLoaderTest {

    private static Path resource(String name) throws URISyntaxException {
        return Paths.get(TestDataLoaderTest.class.getClassLoader().getResource(name).toURI());
    }

    /** The new files give every trade creation and early termination case exactly the data the old YAML gave it. */
    @ParameterizedTest
    @ValueSource(strings = {
        "TC-TRADE-CREATION-FX_CO-UI-001", "TC-TRADE-CREATION-FX_TRF-UI-001", "TC-TRADE-CREATION-FX_FSB-UI-001",
        "TC-TRADE-CREATION-FX_CO-UI-002", "TC-TRADE-CREATION-FX_TRF-UI-002", "TC-TRADE-CREATION-FX_FSB-UI-002",
        "TC-TRADE-CREATION-FX_CO-UI-003", "TC-TRADE-CREATION-FX_TRF-UI-003", "TC-TRADE-CREATION-FX_FSB-UI-003",
        "TC-TRADE-EARLY-TERMINATION-FX_CO-UI-001", "TC-TRADE-EARLY-TERMINATION-FX_TRF-UI-001",
        "TC-TRADE-EARLY-TERMINATION-FX_FSB-UI-001"})
    void newFilesMatchTheOldYaml(String tcId) throws Exception {
        TestDataRecord layered = new TestDataLoader(resource("data")).resolve(tcId);
        TestDataRecord legacy = new TestDataLoader(resource("legacy-data")).resolve(tcId);
        assertEquals(legacy.requestNode(), layered.requestNode(), tcId);
        assertEquals(legacy.responseNode(), layered.responseNode(), tcId);
    }

    @Test
    void productIdComesFromTheRegistry() throws Exception {
        TestDataRecord r = new TestDataLoader(resource("data")).resolve("TC-TRADE-CREATION-FX_FSB-UI-001");
        assertEquals("FX_PSCRIPT_FSKO", r.flattenRequest().get("basic.productId"));
        assertEquals("Buy", r.flattenRequest().get("basic.direction"));
        assertNull(r.flattenRequest().get("stepIn.oldCounterpartyName"));
    }

    @Test
    void aCaseWithoutItsOwnEntryGetsTheDefaults() throws Exception {
        TestDataRecord r = new TestDataLoader(resource("data")).resolve("TC-TRADE-CREATION-FX_TRF-UI-099");
        assertEquals("10 AM NY", r.flattenRequest().get("basic.counterpartyName"));
        assertEquals("FX_TRF", r.flattenRequest().get("basic.productId"));
    }

    @Test
    void aNewProductNeedsOnlyTheRegistry() throws Exception {
        AssertionError e = assertThrows(AssertionError.class,
            () -> new TestDataLoader(resource("data")).resolve("TC-TRADE-CREATION-FX_NEW-UI-001"));
        assertTrue(e.getMessage().contains("Unknown product 'FX_NEW'"), e.getMessage());
    }

    @Test
    void aFeatureWithoutDataFails() throws Exception {
        AssertionError e = assertThrows(AssertionError.class,
            () -> new TestDataLoader(resource("data")).resolve("TC-TRADE-AMENDMENT-FX_TRF-UI-001"));
        assertTrue(e.getMessage().contains("trade_amendment.json"), e.getMessage());
    }

    @Test
    void scenarioNameToken() {
        assertEquals("TC-TRADE-CREATION-FX_CO-UI-001",
            TestDataLoader.tcKeyFromName("[TC-TRADE-CREATION-FX_CO-UI-001] Should be able to create a FX_CO Trade"));
        assertNull(TestDataLoader.tcKeyFromName("Background only"));
    }

    @Test
    void caseIdParts() {
        TestDataLoader.CaseId id = TestDataLoader.CaseId.parse("TC-TRADE-PARTIAL-NOVATION-FX_PSCRIPT_FSKO-UI-002");
        assertEquals("trade_partial_novation", id.feature);
        assertEquals("FX_PSCRIPT_FSKO", id.product);
        assertEquals("ui", id.layer);
        assertEquals("TC-TRADE-PARTIAL-NOVATION-UI-002", id.caseKey);
        assertNull(TestDataLoader.CaseId.parse("TC-LOGIN-API-001").product);
    }

    // ---- forKey: setup data for API steps

    @Test
    void setupKeyMatchesTheOldYaml() throws Exception {
        TestDataRecord layered = new TestDataLoader(resource("data")).resolveKey("API-SETUP-TRADE-CREATE", null, null);
        TestDataRecord legacy = new TestDataLoader(resource("legacy-data")).resolveKey("API-SETUP-TRADE-CREATE", null, null);
        assertEquals(legacy.requestNode(), layered.requestNode());
    }

    @Test
    void setupKeyTakesTheProductGivenOrTheCasesOwn() throws Exception {
        TestDataLoader loader = new TestDataLoader(resource("data"));
        assertEquals("FX_PSCRIPT_FSKO", loader.resolveKey("API-SETUP-TRADE-CREATE", "FX_FSB", null)
            .flattenRequest().get("basic.productId"));
        assertEquals("FX_PSCRIPT", loader.resolveKey("API-SETUP-TRADE-CREATE", null, "TC-TRADE-CREATION-FX_CO-UI-001")
            .flattenRequest().get("basic.productId"));
        assertEquals("ABS_EQF", loader.resolveKey("API-SETUP-TRADE-CREATE", "FX_FSB", null)
            .flattenRequest().get("basic.portfolioId"));
    }

    @Test
    void setupKeyAppliesTheChangesOfTheRunningCase() throws Exception {
        TestDataLoader loader = new TestDataLoader(resource("fixture-data"));

        // No running case: the entry with its byProduct
        Map<String, String> plain = loader.resolveKey("API-SETUP-TRADE-CREATE", "FX_FSB", null).flattenRequest();
        assertEquals("2,000", plain.get("basic.notional"));
        assertEquals("Buy", plain.get("basic.direction"));

        // A case of the feature without its own entry: the feature's setup change
        Map<String, String> feature = loader.resolveKey("API-SETUP-TRADE-CREATE", null, "TC-TRADE-EXAMPLE-FX_FSB-UI-001")
            .flattenRequest();
        assertEquals("Sell", feature.get("basic.direction"));
        assertEquals("2,000", feature.get("basic.notional"));
        assertEquals("FX_PSCRIPT_FSKO", feature.get("basic.productId"));

        // A case with its own setup change, and its byProduct
        assertEquals("5,000", loader.resolveKey("API-SETUP-TRADE-CREATE", null, "TC-TRADE-EXAMPLE-FX_FSB-UI-002")
            .flattenRequest().get("basic.notional"));
        assertEquals("7,000", loader.resolveKey("API-SETUP-TRADE-CREATE", null, "TC-TRADE-EXAMPLE-FX_TRF-UI-002")
            .flattenRequest().get("basic.notional"));
    }

    @Test
    void anUnknownSetupKeyFails() throws Exception {
        AssertionError e = assertThrows(AssertionError.class,
            () -> new TestDataLoader(resource("data")).resolveKey("API-SETUP-NOTHING", null, null));
        assertTrue(e.getMessage().contains("setup.API-SETUP-NOTHING"), e.getMessage());
    }
}
