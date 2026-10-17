package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

/** The old YAML loader, back in test scope for the migration: on the fixture of real old data and on small files. */
public class LegacyDataTest {

    private static final LegacyData FIXTURE = new LegacyData(LegacyData.FIXTURE);

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    @Test
    public void resolvesReferencesAndLocalPatches() {
        assertEquals(Json.parse("{\"earlyTermination\":{\"direction\":\"Pay\",\"amount\":\"100\",\"ccy\":\"USD\"}}"),
                Json.parse(FIXTURE.forKey("TC-TRADE-EARLY-TERMINATION-FX_TRF-UI-001").request()));
        JsonNode risk = Json.parse(FIXTURE.forKey("UI-SETUP-RISK-CALC-NEW-SUCCESS").response());
        assertEquals(200, risk.get("code").asInt());
        assertEquals("SUCCESS", risk.get("status").asText());
        assertEquals("", risk.get("msg").asText());
        assertEquals("Cortex-QR", risk.path("data").get("riskEngine").asText());
    }

    @Test
    public void mergedEntryKeepsItsDigits() {
        String response = FIXTURE.forKey("UI-SETUP-RISK-CALC-PARTIAL-SUCCESS").response();
        assertTrue(response, response.contains("20150.8410403754144"));
    }

    @Test
    public void listsKeysWithTheirFiles() {
        assertEquals(47, FIXTURE.keys().size());
        assertEquals(31, FIXTURE.keys().stream().filter(k -> k.startsWith("TC-")).count());
        assertEquals("ui/user_preference_config.yml", FIXTURE.fileOf("SETUP-USER-PREFERENCE-CONFIG-DEFAULTS"));
        assertEquals("api/trade_creation.yml", FIXTURE.fileOf("TC-TRADE-CREATION-API-006"));
        assertFalse(FIXTURE.isEmpty());
    }

    @Test
    public void keyForCaseTriesTheKeyThenAPrefixedKey() throws IOException {
        Path dir = tmp.newFolder("data").toPath();
        yaml(dir, "api/x.yml", entry("TRADE.TC-X-API-001") + entry("TC-Y-API-001") + entry("A.TC-Y-API-001"));
        LegacyData legacy = LegacyData.in(dir);
        assertEquals(Optional.of("TRADE.TC-X-API-001"), legacy.keyForCase("TC-X-API-001"));
        assertEquals(Optional.of("TC-Y-API-001"), legacy.keyForCase("TC-Y-API-001"));
        assertEquals(Optional.empty(), legacy.keyForCase("TC-Z-API-001"));
    }

    @Test
    public void twoPrefixedKeysForOneCaseAreAnError() throws IOException {
        Path dir = tmp.newFolder("data").toPath();
        yaml(dir, "api/x.yml", entry("A.TC-X-API-001") + entry("B.TC-X-API-001"));
        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> LegacyData.in(dir).keyForCase("TC-X-API-001"));
        assertTrue(e.getMessage(), e.getMessage().contains("A.TC-X-API-001"));
        assertTrue(e.getMessage(), e.getMessage().contains("B.TC-X-API-001"));
    }

    @Test
    public void oldLoaderErrorsStay() throws IOException {
        Path duplicate = tmp.newFolder("duplicate").toPath();
        yaml(duplicate, "api/a.yml", entry("K"));
        yaml(duplicate, "ui/b.yml", entry("K"));
        assertFailure(duplicate, "Duplicate key");

        Path missing = tmp.newFolder("missing").toPath();
        yaml(missing, "api/a.yml", "K:\n  requestRef: NOWHERE\n");
        assertFailure(missing, "references missing requestRef");

        Path cycle = tmp.newFolder("cycle").toPath();
        yaml(cycle, "api/a.yml", "A:\n  requestRef: B\nB:\n  requestRef: A\n");
        assertFailure(cycle, "Circular");

        Path mapping = tmp.newFolder("mapping").toPath();
        yaml(mapping, "api/a.yml", "K:\n  request: {}\n");
        assertFailure(mapping, "is a YAML mapping");
    }

    @Test
    public void folderWithoutYamlIsEmpty() throws IOException {
        LegacyData legacy = LegacyData.in(tmp.newFolder("data").toPath());
        assertTrue(legacy.isEmpty());
        assertTrue(legacy.keys().isEmpty());
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static String entry(String key) {
        return key + ":\n  request: |\n    {\"a\": 1}\n";
    }

    private static void yaml(Path dir, String file, String text) throws IOException {
        Path path = dir.resolve(file);
        Files.createDirectories(path.getParent());
        Files.writeString(path, text, StandardCharsets.UTF_8);
    }

    private static void assertFailure(Path dir, String message) {
        IllegalStateException e = assertThrows(IllegalStateException.class, () -> LegacyData.in(dir).keys());
        assertTrue(e.getMessage(), e.getMessage().contains(message));
    }
}
