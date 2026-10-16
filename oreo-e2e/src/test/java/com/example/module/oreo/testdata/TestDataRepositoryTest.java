package com.example.module.oreo.testdata;

import org.junit.Test;

import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class TestDataRepositoryTest {

    private final TestDataRepository repo = new TestDataRepository("testdata-fixtures/data/");

    private static void assertJson(String expected, String actual) {
        assertEquals(Json.parse(expected), Json.parse(actual));
    }

    @Test
    public void caseWithoutRowRunsOnDefaults() {
        CaseData data = repo.forCase("TC-SAMPLE-EVENT-FX_TRF-API-001");
        assertJson("{\"basic\":{\"a\":\"1\",\"premium\":10}}", data.request());
        assertEquals(Map.of("data.id", "type"), data.dynamicFields());
        assertEquals(List.of("sample_event.json defaults (use base)"), data.layers());
    }

    @Test
    public void allLayersInOrder() {
        CaseData data = repo.forCase("TC-SAMPLE-EVENT-FX_PSCRIPT_TRF-API-002");
        assertJson("{\"basic\":{\"a\":\"1\",\"udf\":[\"x\"],\"ccy\":\"\"}}", data.request());
        assertEquals(List.of(
                "sample_event.json defaults (use base)",
                "sample_event.json byProduct FX_PSCRIPT_TRF",
                "row TC-SAMPLE-EVENT-<product_type>-API-002 (use extra)",
                "row TC-SAMPLE-EVENT-<product_type>-API-002 byProduct FX_PSCRIPT_TRF"), data.layers());
        assertEquals(Map.of("data.id", "type", "msg", "type"), data.dynamicFields());
    }

    @Test
    public void caseWithoutProductSkipsByProduct() {
        CaseData data = repo.forCase("TC-SAMPLE-EVENT-API-004");
        assertJson("{\"basic\":{\"a\":\"2\",\"premium\":10}}", data.request());
        assertTrue(data.dynamicFields().isEmpty());
    }

    @Test
    public void missingEventFileMeansNoData() {
        CaseData data = repo.forCase("TC-NO-SUCH-EVENT-FX_TRF-UI-001");
        assertFalse(data.hasRequest());
        assertEquals("{}", data.request());
        assertTrue(data.layers().isEmpty());
    }

    @Test
    public void flattensLikeTheOldRecord() {
        Map<String, String> fields = repo.forCase("TC-FLATTEN-EVENT-FX_TRF-UI-001").flattenRequest();
        assertEquals(Map.of("basic.a", "1", "udf[0].k", "v"), fields);
    }

    @Test(expected = IllegalStateException.class)
    public void unknownKeyIsAnError() {
        repo.forCase("TC-BAD-KEY-FX_TRF-API-001");
    }

    @Test(expected = IllegalStateException.class)
    public void twoMatchingRowsIsAnError() {
        repo.forCase("TC-TWO-ROWS-FX_TRF-API-001");
    }

    @Test(expected = IllegalStateException.class)
    public void unknownSharedBlockIsAnError() {
        repo.forCase("TC-BAD-USE-API-009");
    }

    @Test(expected = IllegalStateException.class)
    public void dynamicFieldsRejectedInUi() {
        repo.forCase("TC-UI-EVENT-FX_TRF-UI-001");
    }

    @Test
    public void expectedBaseFollowsTheProduct() {
        assertEquals("TC-SAMPLE-EVENT-FX_TRF-API-001", repo.forCase("TC-SAMPLE-EVENT-FX_TRF-API-002").expectedBase());
    }

    @Test
    public void baseCaseHasNoBase() {
        assertNull(repo.forCase("TC-SAMPLE-EVENT-FX_TRF-API-001").expectedBase());
    }

    @Test
    public void caseWithoutProductHasNoBase() {
        assertNull(repo.forCase("TC-SAMPLE-EVENT-API-004").expectedBase());
    }

    @Test
    public void nullRemovesTheBase() {
        assertNull(repo.forCase("TC-SAMPLE-EVENT-FX_PSCRIPT_TRF-API-002").expectedBase());
    }

    @Test(expected = IllegalStateException.class)
    public void baseInAnotherEventIsAnError() {
        repo.forCase("TC-BAD-BASE-FX_TRF-API-002");
    }

    @Test(expected = IllegalStateException.class)
    public void expectedBaseRejectedInUi() {
        repo.forCase("TC-UI-BASE-FX_TRF-UI-002");
    }

    @Test
    public void setupExtends() {
        SetupData setup = repo.setup("child-setup");
        assertJson("{\"basic\":{\"a\":\"1\",\"b\":\"2\"}}", setup.request());
        assertFalse(setup.hasResponse());
    }

    @Test(expected = IllegalStateException.class)
    public void setupCycleIsAnError() {
        repo.setup("loop-a");
    }

    @Test
    public void missingSetupNamesTheFolder() {
        try {
            repo.setup("nope");
            fail("expected an IllegalStateException");
        } catch (IllegalStateException e) {
            assertTrue(e.getMessage(), e.getMessage().contains("data/setup/nope.json"));
        }
    }
}
