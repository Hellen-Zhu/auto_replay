package com.oreo.uat.testdata;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URISyntaxException;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class TestDataLoaderTest {

    private static Path resource(String name) throws URISyntaxException {
        return Paths.get(TestDataLoaderTest.class.getClassLoader().getResource(name).toURI());
    }

    /** The new files give every trade creation case exactly the data the old YAML gave it. */
    @ParameterizedTest
    @ValueSource(strings = {
        "TC-TRADE-CREATION-FX_CO-UI-001", "TC-TRADE-CREATION-FX_TRF-UI-001", "TC-TRADE-CREATION-FX_FSB-UI-001",
        "TC-TRADE-CREATION-FX_CO-UI-002", "TC-TRADE-CREATION-FX_TRF-UI-002", "TC-TRADE-CREATION-FX_FSB-UI-002",
        "TC-TRADE-CREATION-FX_CO-UI-003", "TC-TRADE-CREATION-FX_TRF-UI-003", "TC-TRADE-CREATION-FX_FSB-UI-003"})
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
}
