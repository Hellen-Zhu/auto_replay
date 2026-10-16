package com.example.module.oreo.testdata;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class CaseIdTest {

    @Test
    public void parsesOutlineCase() {
        CaseId id = CaseId.parse("TC-TRADE-CREATION-FX_PSCRIPT_TRF-API-002");
        assertEquals("TRADE-CREATION", id.event());
        assertEquals("FX_PSCRIPT_TRF", id.product());
        assertEquals("API", id.channel());
        assertEquals("002", id.number());
        assertEquals("trade_creation", id.eventFile());
        assertEquals("api", id.channelDir());
    }

    @Test
    public void parsesCaseWithoutProduct() {
        CaseId id = CaseId.parse("TC-TRADE-CREATION-API-004");
        assertNull(id.product());
        assertEquals("TRADE-CREATION", id.event());
    }

    @Test
    public void parsesUiEvent() {
        assertEquals("trade_early_termination",
                CaseId.parse("TC-TRADE-EARLY-TERMINATION-FX_TRF-UI-001").eventFile());
    }

    @Test(expected = IllegalArgumentException.class)
    public void unregisteredProductTokenIsAnError() {
        CaseId.parse("TC-TRADE-CREATION-FX_NEW-API-001");
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsMissingChannel() {
        CaseId.parse("TC-TRADE-CREATION-001");
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsMissingPrefix() {
        CaseId.parse("TRADE-CREATION-API-001");
    }

    @Test
    public void outlineRowMatchesEveryProduct() {
        String row = "TC-TRADE-CREATION-<product_type>-API-002";
        assertTrue(CaseId.parse("TC-TRADE-CREATION-FX_TRF-API-002").matchesRow(row));
        assertTrue(CaseId.parse("TC-TRADE-CREATION-FX_PSCRIPT_TRF-API-002").matchesRow(row));
        assertFalse(CaseId.parse("TC-TRADE-CREATION-FX_TRF-API-003").matchesRow(row));
        assertFalse(CaseId.parse("TC-TRADE-CREATION-API-002").matchesRow(row));
    }

    @Test
    public void plainRowMatchesItsCaseOnly() {
        assertTrue(CaseId.parse("TC-TRADE-CREATION-API-004").matchesRow("TC-TRADE-CREATION-API-004"));
        assertFalse(CaseId.parse("TC-TRADE-CREATION-FX_TRF-API-004").matchesRow("TC-TRADE-CREATION-API-004"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void placeholderOnlyAtProductPosition() {
        CaseId.checkRowId("TC-<event>-FX_TRF-API-001");
    }

    @Test
    public void caseIdFromScenarioName() {
        assertEquals("TC-TRADE-CREATION-FX_TRF-API-001",
                CaseId.fromScenarioName("[TC-TRADE-CREATION-FX_TRF-API-001] Valid FX_TRF trade submission"));
        assertNull(CaseId.fromScenarioName("[ADO-1] no case id"));
    }
}
