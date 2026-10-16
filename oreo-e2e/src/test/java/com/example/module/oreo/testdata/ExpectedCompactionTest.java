package com.example.module.oreo.testdata;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class ExpectedCompactionTest {

    private static final String EVENT = "sample_event";
    private static final String C1 = "TC-SAMPLE-EVENT-FX_TRF-API-001";
    private static final String C2 = "TC-SAMPLE-EVENT-FX_TRF-API-002";
    private static final String C3 = "TC-SAMPLE-EVENT-FX_TRF-API-003";
    private static final String C4 = "TC-SAMPLE-EVENT-API-004";
    private static final String C5 = "TC-SAMPLE-EVENT-FX_TRF-API-005";

    private static final String BASE = "{\"code\":200,\"status\":\"SUCCESS\",\"msg\":\"ok\",\"data\":{\"trade\":{"
            + "\"id\":\"${json-unit.any-string}\",\"basic\":{\"productId\":\"FX_TRF\",\"direction\":\"Buy\","
            + "\"notional\":1000000,\"ccy\":\"USD\",\"rate\":7.1234,\"eventStatus\":\"New\"}}}}";
    private static final String VARIANT = BASE.replace("\"New\"", "\"StepInPartial\"");
    private static final String NEAR_VARIANT = VARIANT.replace("7.1234", "7.2");
    private static final String VARIANT_PATCH = "{\"_base\":\"" + C1 + "\",\"_patch\":[{\"op\":\"replace\","
            + "\"path\":\"/data/trade/basic/eventStatus\",\"value\":\"StepInPartial\"}]}";

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private ExpectedResponses files;
    private final Map<String, String> bases = new HashMap<>();

    @Before
    public void setUp() {
        files = new ExpectedResponses(tmp.getRoot().toPath());
        put(C1, BASE);
        put(C2, VARIANT);
        put(C3, "{\"x\":1}");
        put(C4, "{\"code\":400}");
        bases.put(C2, C1);
        bases.put(C3, C1);
    }

    private void put(String caseId, String json) {
        files.write(CaseId.parse(caseId), Json.pretty(Json.parse(json)));
    }

    private String text(String caseId) {
        return files.read(CaseId.parse(caseId)).orElseThrow();
    }

    private ExpectedCompaction.Plan plan() {
        return plan(id -> bases.get(id.raw()));
    }

    private ExpectedCompaction.Plan plan(Function<CaseId, String> declaredBase) {
        return ExpectedCompaction.plan(files, EVENT, declaredBase);
    }

    private static ExpectedCompaction.Entry entry(ExpectedCompaction.Plan plan, String caseId) {
        return plan.entries().stream().filter(e -> e.id().raw().equals(caseId)).findFirst()
                .orElseThrow(() -> new AssertionError("no entry for " + caseId + " in " + plan));
    }

    private static void assertErrorsContain(ExpectedCompaction.Plan plan, String... parts) {
        String errors = String.join("\n", plan.errors());
        for (String part : parts) {
            assertTrue(errors, errors.contains(part));
        }
    }

    @Test
    public void variantBecomesAPatch() {
        ExpectedCompaction.Plan plan = plan();
        assertTrue(plan.errors().toString(), plan.errors().isEmpty());
        ExpectedCompaction.write(files, plan);
        assertEquals(Json.parse(VARIANT_PATCH), Json.parse(text(C2)));
        assertEquals("patch on " + C1 + ", 1 ops", entry(plan, C2).note());
        for (String unchanged : List.of(C1, C4)) {
            assertFalse(unchanged, entry(plan, unchanged).changed());
            assertEquals("full (no base)", entry(plan, unchanged).note());
        }
    }

    @Test
    public void keepsFullWhenThePatchIsNotShorter() {
        ExpectedCompaction.Plan plan = plan();
        assertFalse(entry(plan, C3).changed());
        assertEquals("full (patch not shorter)", entry(plan, C3).note());
    }

    @Test
    public void caseWithoutBaseExpandsAPatch() {
        put(C2, VARIANT_PATCH);
        bases.remove(C2);
        ExpectedCompaction.write(files, plan());
        assertEquals(Json.parse(VARIANT), Json.parse(text(C2)));
    }

    @Test
    public void patchFollowsANewBase() {
        put(C2, VARIANT_PATCH);
        put(C5, NEAR_VARIANT);
        bases.put(C2, C5);
        ExpectedCompaction.write(files, plan());
        assertEquals(C5, Json.parse(text(C2)).get("_base").asText());
        assertEquals(Json.parse(VARIANT), Json.parse(files.resolve(CaseId.parse(C2)).orElseThrow().json()));
    }

    @Test
    public void secondRunChangesNothing() {
        ExpectedCompaction.write(files, plan());
        for (ExpectedCompaction.Entry e : plan().entries()) {
            assertFalse(e.id().raw(), e.changed());
        }
    }

    @Test
    public void errorWritesNothing() throws IOException {
        Files.delete(files.fileFor(CaseId.parse(C1)));
        String before2 = text(C2);
        String before3 = text(C3);
        ExpectedCompaction.Plan plan = plan();
        assertErrorsContain(plan, C1);
        try {
            ExpectedCompaction.write(files, plan);
            fail("expected an IllegalStateException");
        } catch (IllegalStateException expected) {
            // nothing written
        }
        assertEquals(before2, text(C2));
        assertEquals(before3, text(C3));
    }

    @Test
    public void chainedBaseIsAnError() {
        bases.put(C1, C4);
        assertErrorsContain(plan(), C1, "declares a base of its own");
    }

    @Test
    public void dataErrorIsListed() {
        ExpectedCompaction.Plan plan = plan(id -> {
            if (id.raw().equals(C4)) throw new IllegalStateException("broken data");
            return bases.get(id.raw());
        });
        assertErrorsContain(plan, C4, "broken data");
    }
}
