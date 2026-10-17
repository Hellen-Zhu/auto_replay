package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.DoubleNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Assume;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * While YAML files exist, the new data gives each case what the old data gave it (spec section 4). Run with the
 * offline tests; skipped when there is no YAML file under {@code data/}.
 *
 * <p>Floating-point numbers are compared as doubles: the old loader rewrote every merged entry through a plain
 * {@code ObjectMapper}, which rounded long decimals; the new files keep the digits as written.
 */
public class LegacyEquivalenceTest {

    private static final LegacyData FIXTURE = new LegacyData(LegacyData.FIXTURE);
    private static final List<String> PRODUCTS = List.of("FX_TRF", "FX_PSCRIPT", "FX_PSCRIPT_FSKO", "FX_PSCRIPT_TRF");

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    @Test
    public void newDataGivesWhatTheOldDataGave() {
        LegacyData legacy = LegacyData.standard();
        Assume.assumeFalse("no YAML file under data/: nothing to compare", legacy.isEmpty());
        List<String> notMigrated = new ArrayList<>();
        List<String> differences = differences(legacy, ProjectPaths.projectRoot().resolve("src/test/resources"),
                notMigrated);
        if (!notMigrated.isEmpty()) {
            System.out.println("[LegacyEquivalenceTest] not migrated yet: " + String.join(", ", notMigrated));
        }
        if (!differences.isEmpty()) {
            throw new AssertionError(differences.size() + " difference(s) between the old YAML and the new data:\n  "
                    + String.join("\n  ", differences));
        }
    }

    @Test
    public void migratedFixtureIsEquivalent() throws IOException {
        LegacyMigration.Sources sources = migrated("setup", "trade_creation", "trade_early_termination");
        List<String> notMigrated = new ArrayList<>();
        assertEquals(List.of(), differences(FIXTURE, sources.resources(), notMigrated));
        assertEquals(List.of(), notMigrated);
    }

    @Test
    public void aChangedCaseValueIsNamed() throws IOException {
        LegacyMigration.Sources sources = migrated("trade_early_termination");
        Path file = sources.data().resolve("ui/trade_early_termination.json");
        String text = Files.readString(file, StandardCharsets.UTF_8);
        assertTrue(text, text.contains("\"amount\": \"100\""));
        Files.writeString(file, text.replace("\"amount\": \"100\"", "\"amount\": \"200\""), StandardCharsets.UTF_8);

        List<String> lines = differences(FIXTURE, sources.resources(), new ArrayList<>());
        assertEquals(String.join("\n", lines), 4, lines.size());
        for (String product : PRODUCTS) {
            String id = "TC-TRADE-EARLY-TERMINATION-" + product + "-UI-001";
            assertTrue(id + " in " + lines, lines.stream()
                    .anyMatch(line -> line.startsWith(id + ":") && line.contains("earlyTermination.amount")));
        }
    }

    @Test
    public void aChangedSetupPayloadIsNamed() throws IOException {
        LegacyMigration.Sources sources = migrated("setup");
        Path file = sources.data().resolve("setup/trade-create.json");
        ObjectNode setup = (ObjectNode) Json.parse(Files.readString(file, StandardCharsets.UTF_8));
        ((ObjectNode) setup.get("request").get("basic")).put("portfolioId", "PF_B");
        Files.writeString(file, Json.pretty(setup), StandardCharsets.UTF_8);

        List<String> lines = differences(FIXTURE, sources.resources(), new ArrayList<>());
        assertEquals(String.join("\n", lines), 1, lines.size());
        assertTrue(lines.get(0), lines.get(0).contains("API-SETUP-TRADE-CREATE -> trade-create"));
        assertTrue(lines.get(0), lines.get(0).contains("basic.portfolioId"));
    }

    @Test
    public void eventsWithoutEventFileAreNotMigrated() throws IOException {
        LegacyMigration.Sources sources = migrated("trade_early_termination");
        List<String> notMigrated = new ArrayList<>();
        assertEquals(List.of(), differences(FIXTURE, sources.resources(), notMigrated));
        assertEquals(List.of("trade_creation (api)", "trade_creation (ui)"), notMigrated.stream().sorted().toList());
    }

    // ── The comparison ───────────────────────────────────────────────────────

    /**
     * One line per difference: each feature case of an event with its event file in {@code resources} gets the
     * request its old key gave (spec 3.3 applied), or none without an old key; each old non-case key whose setup name
     * has a file in {@code data/setup/} has the same payload (request without {@code basic.productId}).
     * {@code notMigrated} receives {@code <event> (<channel>)} of the old case keys whose event has no event file.
     */
    static List<String> differences(LegacyData legacy, Path resources, List<String> notMigrated) {
        List<String> keys = legacy.keys();   // read before the class loader changes: the fixture is on the test one
        List<FeatureCases.FeatureCase> cases = FeatureCases.load(resources.resolve("features"));
        Set<String> missing = new LinkedHashSet<>();
        for (String key : keys) {
            CaseId id = caseId(key.substring(key.lastIndexOf('.') + 1));
            if (id != null && !Files.exists(eventFile(resources, id))) {
                missing.add(id.eventFile() + " (" + id.channelDir() + ")");
            }
        }
        notMigrated.addAll(missing);
        return LegacyMigration.withClasspath(resources, () -> {
            TestDataRepository repository = new TestDataRepository("data/");
            List<String> lines = new ArrayList<>();
            for (FeatureCases.FeatureCase c : cases) {
                CaseId id = caseId(c.caseId());
                if (id == null || !Files.exists(eventFile(resources, id))) continue;
                String line = caseDifference(legacy, repository, id);
                if (line != null) lines.add(line);
            }
            for (String key : keys) {
                if (key.substring(key.lastIndexOf('.') + 1).startsWith("TC-")) continue;
                String name = LegacyMigration.setupName(key);
                if (!Files.isRegularFile(resources.resolve("data/setup").resolve(name + ".json"))) continue;
                lines.addAll(setupDifferences(legacy, repository, key, name));
            }
            return lines;
        });
    }

    /** The difference of one case, or null. */
    private static String caseDifference(LegacyData legacy, TestDataRepository repository, CaseId id) {
        String caseId = id.raw();
        CaseData now;
        Optional<String> key;
        try {
            now = repository.forCase(caseId);
            key = legacy.keyForCase(caseId);
        } catch (IllegalStateException e) {
            return caseId + ": " + e.getMessage();
        }
        String layers = " (" + (now.layers().isEmpty() ? "no layer" : String.join(", ", now.layers())) + ")";
        if (key.isEmpty() || !legacy.forKey(key.get()).hasRequest()) {
            String why = key.isEmpty() ? "no old key" : "the old key " + key.get() + " has no request";
            return now.hasRequest() ? caseId + ": " + why + ", the new data gives " + now.request() + layers : null;
        }
        JsonNode old;
        try {
            old = Json.parse(legacy.forKey(key.get()).request());
        } catch (IllegalStateException e) {
            return caseId + ": the request of the old key " + key.get() + " is not valid JSON: " + e.getMessage();
        }
        if (!(old instanceof ObjectNode object)) {
            return caseId + ": the request of the old key " + key.get() + " is not a JSON object";
        }
        String difference = difference(viaDouble(LegacyMigration.request(object, id.channelDir())),
                viaDouble(Json.parse(now.request())), "");
        return difference == null ? null : caseId + ": " + difference + layers;
    }

    /** The differences of one setup payload, part by part. */
    private static List<String> setupDifferences(LegacyData legacy, TestDataRepository repository, String key,
                                                 String name) {
        String prefix = key + " -> " + name + ": ";
        SetupData now;
        try {
            now = repository.setup(name);
        } catch (IllegalStateException e) {
            return List.of(prefix + e.getMessage());
        }
        LegacyData.Record old = legacy.forKey(key);
        List<String> lines = new ArrayList<>();
        for (String part : List.of("request", "response")) {
            String oldText = part.equals("request") ? old.request() : old.response();
            JsonNode newNode = part.equals("request") ? now.requestNode() : now.responseNode();
            boolean oldHas = oldText != null && !oldText.isBlank();
            if (!oldHas && newNode == null) continue;
            if (!oldHas || newNode == null) {
                lines.add(prefix + (oldHas ? "the file has no " + part + ", the old key has one"
                        : "the old key has no " + part + ", the file has one"));
                continue;
            }
            JsonNode oldNode;
            try {
                oldNode = Json.parse(oldText);
            } catch (IllegalStateException e) {
                lines.add(prefix + "the old " + part + " is not valid JSON: " + e.getMessage());
                continue;
            }
            if (part.equals("request") && oldNode.get("basic") instanceof ObjectNode basic) {
                basic.remove("productId");
            }
            String difference = difference(viaDouble(oldNode), viaDouble(newNode), "");
            if (difference != null) lines.add(prefix + "the " + part + " differs at " + difference);
        }
        return lines;
    }

    /** The first difference, {@code <path>: old <value>, new <value>}; null when equal. */
    private static String difference(JsonNode old, JsonNode now, String path) {
        if (old.equals(now)) return null;
        if (old.isObject() && now.isObject()) {
            Set<String> names = new LinkedHashSet<>();
            old.fieldNames().forEachRemaining(names::add);
            now.fieldNames().forEachRemaining(names::add);
            for (String name : names) {
                String at = path.isEmpty() ? name : path + "." + name;
                if (!old.has(name)) return at + ": absent in the old data, new " + Json.compact(now.get(name));
                if (!now.has(name)) return at + ": old " + Json.compact(old.get(name)) + ", absent in the new data";
                String difference = difference(old.get(name), now.get(name), at);
                if (difference != null) return difference;
            }
        }
        if (old.isArray() && now.isArray() && old.size() == now.size()) {
            for (int i = 0; i < old.size(); i++) {
                String difference = difference(old.get(i), now.get(i), path + "[" + i + "]");
                if (difference != null) return difference;
            }
        }
        String at = path.isEmpty() ? "the whole value" : path;
        return at + ": old " + Json.compact(old) + ", new " + Json.compact(now);
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

    /** The case ID, or null when {@code text} is not one. */
    private static CaseId caseId(String text) {
        if (!text.startsWith("TC-")) return null;
        try {
            return CaseId.parse(text);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static Path eventFile(Path resources, CaseId id) {
        return resources.resolve("data").resolve(id.channelDir()).resolve(id.eventFile() + ".json");
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** The fixture project with the scopes written by the tool, in this order. */
    private LegacyMigration.Sources migrated(String... scopes) throws IOException {
        LegacyMigration.Sources sources =
                new LegacyMigration.Sources(FIXTURE, MigrateLegacyDataTest.fixtureProject(tmp));
        for (String scope : scopes) {
            MigrateLegacyData.run(sources, scope, true);
        }
        return sources;
    }
}
