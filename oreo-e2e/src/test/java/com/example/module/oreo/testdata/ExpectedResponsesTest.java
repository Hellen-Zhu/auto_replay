package com.example.module.oreo.testdata;

import net.javacrumbs.jsonunit.JsonAssert;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class ExpectedResponsesTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private Path root;
    private ExpectedResponses expected;
    private final CaseId id = CaseId.parse("TC-TRADE-CREATION-FX_TRF-API-001");
    private final CaseId variant = CaseId.parse("TC-TRADE-CREATION-FX_TRF-API-002");
    private final CaseId third = CaseId.parse("TC-TRADE-CREATION-FX_TRF-API-003");

    @Before
    public void setUp() {
        root = tmp.getRoot().toPath();
        expected = new ExpectedResponses(root);
    }

    @Test
    public void fileForUsesEventFolder() {
        assertEquals(root.resolve("trade_creation").resolve("TC-TRADE-CREATION-FX_TRF-API-001.json"),
                expected.fileFor(id));
    }

    @Test
    public void writeThenRead() throws IOException {
        String json = "{\n  \"a\": 1\n}\n";
        expected.write(id, json);
        assertEquals(json, expected.read(id).orElseThrow());
        String onDisk = new String(Files.readAllBytes(expected.fileFor(id)), StandardCharsets.UTF_8);
        assertFalse(onDisk.contains("\r"));
    }

    @Test
    public void readMissingIsEmpty() {
        assertTrue(expected.read(id).isEmpty());
    }

    @Test
    public void readsCrlfFile() throws IOException {
        Path file = expected.fileFor(id);
        Files.createDirectories(file.getParent());
        Files.write(file, "{\r\n  \"a\": 1\r\n}\r\n".getBytes(StandardCharsets.UTF_8));
        JsonAssert.assertJsonEquals(expected.read(id).orElseThrow(), "{\"a\":1}");
    }

    @Test
    public void updateModeSwitch() {
        assertFalse(ExpectedResponses.updateMode(null, null));
        assertTrue(ExpectedResponses.updateMode("update", null));
        assertTrue(ExpectedResponses.updateMode(null, "UPDATE"));
        assertFalse(ExpectedResponses.updateMode("", null));
    }

    @Test(expected = IllegalStateException.class)
    public void rejectsUnknownMode() {
        ExpectedResponses.updateMode("updat", null);
    }

    // ── Base and patch ───────────────────────────────────────────────────────

    private static String patchOn(String base, String ops) {
        return "{\"_base\":\"" + base + "\",\"_patch\":" + ops + "}";
    }

    private void assertResolveFails(CaseId caseId, String... messageParts) {
        try {
            expected.resolve(caseId);
            fail("expected an IllegalStateException");
        } catch (IllegalStateException e) {
            for (String part : messageParts) {
                assertTrue(e.getMessage(), e.getMessage().contains(part));
            }
        }
    }

    @Test
    public void resolvesAFullFile() {
        expected.write(id, "{\n  \"a\": 1\n}\n");
        ExpectedResponses.Resolved resolved = expected.resolve(id).orElseThrow();
        assertEquals(Json.parse("{\"a\":1}"), Json.parse(resolved.json()));
        assertNull(resolved.base());
        assertEquals(expected.fileFor(id).toString(), resolved.describe());
    }

    @Test
    public void resolvesAPatchOnItsBase() {
        expected.write(id, "{\"a\":1,\"b\":2}");
        expected.write(variant, patchOn(id.raw(), "[{\"op\":\"replace\",\"path\":\"/b\",\"value\":3}]"));
        ExpectedResponses.Resolved resolved = expected.resolve(variant).orElseThrow();
        assertEquals(Json.parse("{\"a\":1,\"b\":3}"), Json.parse(resolved.json()));
        assertEquals(id.raw(), resolved.base());
        assertTrue(resolved.describe(), resolved.describe().endsWith("(patch on " + id.raw() + ")"));
    }

    @Test
    public void patchOnAMissingBaseFails() {
        expected.write(variant, patchOn(id.raw(), "[]"));
        assertResolveFails(variant, expected.fileFor(id).toString(), "OREO_EXPECTED=update");
    }

    @Test
    public void patchOnAPatchFails() {
        expected.write(id, "{\"a\":1}");
        expected.write(variant, patchOn(id.raw(), "[]"));
        expected.write(third, patchOn(variant.raw(), "[]"));
        assertResolveFails(third, "is itself a patch", "record " + third.raw() + " again with OREO_EXPECTED=update");
    }

    @Test
    public void patchThatDoesNotApplySaysHowToRecordAgain() {
        expected.write(id, "{\"a\":1}");
        expected.write(variant, patchOn(id.raw(), "[{\"op\":\"add\",\"path\":\"/a\",\"value\":2}]"));
        assertResolveFails(variant, "op 0 (add /a)", "record " + variant.raw() + " again with OREO_EXPECTED=update");
    }

    @Test(expected = IllegalStateException.class)
    public void patchOnAnotherEventFails() {
        expected.write(variant, patchOn("TC-OTHER-EVENT-FX_TRF-API-001", "[]"));
        expected.resolve(variant);
    }

    @Test(expected = IllegalStateException.class)
    public void malformedPatchFails() {
        expected.write(variant, "{\"_base\":1,\"_patch\":[]}");
        expected.resolve(variant);
    }

    @Test
    public void isPatchNeedsExactlyTheTwoKeys() {
        assertTrue(ExpectedResponses.isPatch(Json.parse("{\"_base\":\"x\",\"_patch\":[]}")));
        assertFalse(ExpectedResponses.isPatch(Json.parse("{\"_base\":\"x\",\"_patch\":[],\"code\":200}")));
        assertFalse(ExpectedResponses.isPatch(Json.parse("{\"code\":200}")));
    }

    @Test
    public void listsEventsAndCases() {
        expected.write(variant, "{}");
        expected.write(id, "{}");
        assertEquals(List.of("trade_creation"), expected.events());
        assertEquals(List.of(id, variant), expected.cases("trade_creation"));
    }
}
