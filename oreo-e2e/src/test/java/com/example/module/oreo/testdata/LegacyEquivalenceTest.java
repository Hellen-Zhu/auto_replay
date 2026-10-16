package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.DoubleNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.dataformat.yaml.YAMLMapper;
import org.junit.Test;

import java.io.IOException;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * Migration check, removed with the YAML files: the new JSON data gives what the old YAML gave, except
 * {@code basic.productId} (now set by the step) and the UI portfolio ({@code ABS_EQF} instead of
 * {@code CM_OIL_CRU_OPT}).
 *
 * <p>Floating-point numbers are compared as doubles: the old loader rewrote every merged entry through a plain
 * {@code ObjectMapper}, which rounded the 18-digit pnl values of the partial risk mock; the new files keep the
 * digits as written.
 */
public class LegacyEquivalenceTest {

    private static final YAMLMapper YAML = new YAMLMapper();

    private record Key(String channel, String key) {}

    @Test
    public void caseRequestsAreUnchanged() throws Exception {
        List<Key> keys = caseKeys(null);
        assertFalse("no TC-* keys found in data/**/*.yml", keys.isEmpty());
        for (Key k : keys) {
            TestDataRecord old = TestDataLoader.forKey(k.key());
            CaseData now = TestData.forCase(k.key());
            if (!old.hasRequest()) {
                assertFalse(k.key(), now.hasRequest());
                continue;
            }
            ObjectNode expected = withoutProductId(old.request());
            if (k.channel().equals("ui")) {
                JsonNode basic = expected.get("basic");
                if (basic instanceof ObjectNode b && "CM_OIL_CRU_OPT".equals(b.path("portfolioId").asText(null))) {
                    b.put("portfolioId", "ABS_EQF");
                }
            }
            assertEquals(k.key() + " " + now.layers(), viaDouble(expected), viaDouble(Json.parse(now.request())));
        }
    }

    @Test
    public void setupPayloadsAreUnchanged() {
        Map<String, String> requests = Map.of(
                "API-SETUP-TRADE-CREATE", "trade-create",
                "API-SETUP-STEPIN-PARTIAL-TRADE-CREATE", "trade-create-stepin-partial",
                "API-SETUP-STEPIN-FULL-TRADE-CREATE", "trade-create-stepin-full",
                "SETUP-USER-PREFERENCE-CONFIG-DEFAULTS", "user-preference-defaults");
        for (Map.Entry<String, String> pair : requests.entrySet()) {
            String oldRequest = TestDataLoader.forKey(pair.getKey()).request();
            SetupData now = TestData.setup(pair.getValue());
            assertTrue(pair.getValue(), now.hasRequest());
            assertEquals(pair.getKey() + " -> " + pair.getValue(),
                    viaDouble(withoutProductId(oldRequest)), viaDouble(Json.parse(now.request())));
        }
        Map<String, String> responses = Map.of(
                "UI-SETUP-RISK-CALC-NEW-SUCCESS", "risk-calc-success-mock",
                "UI-SETUP-RISK-CALC-PARTIAL-SUCCESS", "risk-calc-partial-success-mock");
        for (Map.Entry<String, String> pair : responses.entrySet()) {
            String oldResponse = TestDataLoader.forKey(pair.getKey()).response();
            SetupData now = TestData.setup(pair.getValue());
            assertTrue(pair.getValue(), now.hasResponse());
            assertEquals(pair.getKey() + " -> " + pair.getValue(),
                    viaDouble(Json.parse(oldResponse)), viaDouble(Json.parse(now.response())));
        }
    }

    @Test
    public void expectedFilesAreTheOldResponses() throws Exception {
        ExpectedResponses expected = ExpectedResponses.standard();
        List<Key> keys = caseKeys("api");
        assertFalse("no TC-* keys found in data/api/*.yml", keys.isEmpty());
        for (Key k : keys) {
            CaseId id = CaseId.parse(k.key());
            String file = expected.read(id).orElseThrow(() ->
                    new AssertionError(k.key() + ": no expected file " + expected.fileFor(id)));
            assertEquals(k.key(), viaDouble(Json.parse(TestDataLoader.forKey(k.key()).response())),
                    viaDouble(Json.parse(file)));
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Every {@code TC-*} top-level key of {@code data/<channel>/*.yml} ({@code null}: api and ui). */
    private static List<Key> caseKeys(String channel) throws Exception {
        URL data = Thread.currentThread().getContextClassLoader().getResource("data");
        Path dataDir = Paths.get(data.toURI());
        List<Key> keys = new ArrayList<>();
        for (String dir : channel == null ? List.of("api", "ui") : List.of(channel)) {
            List<Path> files;
            try (Stream<Path> listing = Files.list(dataDir.resolve(dir))) {
                files = listing.filter(p -> p.getFileName().toString().endsWith(".yml")).sorted().toList();
            }
            for (Path file : files) {
                JsonNode root = readYaml(file);
                root.fieldNames().forEachRemaining(key -> {
                    if (key.startsWith("TC-")) keys.add(new Key(dir, key));
                });
            }
        }
        return keys;
    }

    private static JsonNode readYaml(Path file) throws IOException {
        JsonNode root = YAML.readTree(file.toFile());
        return root == null ? YAML.createObjectNode() : root;
    }

    private static ObjectNode withoutProductId(String json) {
        ObjectNode root = (ObjectNode) Json.parse(json);
        if (root.get("basic") instanceof ObjectNode basic) {
            basic.remove("productId");
        }
        return root;
    }

    /** A copy with every floating-point number as a double (see the class comment). */
    private static JsonNode viaDouble(JsonNode node) {
        if (node.isObject()) {
            ObjectNode copy = Json.MAPPER.createObjectNode();
            node.properties().forEach(e -> copy.set(e.getKey(), viaDouble(e.getValue())));
            return copy;
        }
        if (node.isArray()) {
            ArrayNode copy = Json.MAPPER.createArrayNode();
            node.forEach(e -> copy.add(viaDouble(e)));
            return copy;
        }
        return node.isFloatingPointNumber() ? DoubleNode.valueOf(node.doubleValue()) : node;
    }
}
