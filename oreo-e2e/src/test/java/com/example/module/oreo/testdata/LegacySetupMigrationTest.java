package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** The setup payloads of the old YAML: their files, the renamed uses and the KNOWN_MISSING line. */
public class LegacySetupMigrationTest {

    private static final LegacyData FIXTURE = new LegacyData(LegacyData.FIXTURE);
    private static final String KNOWN_MISSING_LINE =
            "    private static final Set<String> KNOWN_MISSING = Set.of(\"trade-cancellation\", \"trade-amendment\");";
    private static final String VALIDATION_TEST =
            "src/test/java/com/example/module/oreo/testdata/TestDataValidationTest.java";
    private static final Set<String> FIXTURE_NAMES = Set.of("trade-create", "trade-create-stepin-partial",
            "trade-create-stepin-full", "user-preference-defaults", "risk-calc-success-mock",
            "risk-calc-partial-success-mock");

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    @Test
    public void setupNamesFollowTheTable() {
        assertEquals(List.of("API-SETUP-TRADE-CREATE", "API-SETUP-STEPIN-PARTIAL-TRADE-CREATE",
                "API-SETUP-STEPIN-FULL-TRADE-CREATE", "SETUP-USER-PREFERENCE-CONFIG-DEFAULTS",
                "UI-SETUP-RISK-CALC-NEW-SUCCESS", "UI-SETUP-RISK-CALC-PARTIAL-SUCCESS", "API-SETUP-TRADE-CANCELLATION",
                "UI-SETUP-AMENDMENT"), new ArrayList<>(LegacyMigration.SETUP_NAMES.keySet()));
        assertEquals("trade-cancellation", LegacyMigration.setupName("API-SETUP-TRADE-CANCELLATION"));
        assertEquals("trade-amendment", LegacyMigration.setupName("UI-SETUP-AMENDMENT"));
        assertEquals("foo-bar", LegacyMigration.setupName("API-SETUP-FOO-BAR"));
        assertEquals("x", LegacyMigration.setupName("SETUP-X"));
    }

    @Test
    public void fixtureWritesSixFiles() throws IOException {
        LegacyMigration.SetupPlan plan = LegacyMigration.planSetup(new LegacyMigration.Sources(FIXTURE, project()));
        assertEquals(List.of(), plan.stops());
        assertEquals(FIXTURE_NAMES, names(plan));
        plan.files().forEach(f -> assertNotNull(f.name(), f.text()));
        JsonNode tradeCreate = Json.parse(file(plan, "trade-create").text());
        assertEquals("ABS_EQF", tradeCreate.path("request").path("basic").path("portfolioId").asText());
        assertFalse(tradeCreate.path("request").path("basic").has("productId"));
        assertTrue(tradeCreate.get("_comment").asText(), tradeCreate.get("_comment").asText()
                .contains("API-SETUP-TRADE-CREATE (api/trade_creation.yml)"));
    }

    @Test
    public void fixtureKeepsTheHandMigratedFiles() throws IOException {
        Path project = project();
        try (Stream<Path> files = Files.list(repositorySetupFiles())) {
            for (Path file : files.toList()) {
                Path target = project.resolve("src/test/resources/data/setup").resolve(file.getFileName().toString());
                Files.copy(file, target);
            }
        }
        LegacyMigration.SetupPlan plan = LegacyMigration.planSetup(new LegacyMigration.Sources(FIXTURE, project));
        assertEquals(List.of(), plan.stops());
        assertEquals(FIXTURE_NAMES, names(plan));
        plan.files().forEach(f -> assertNull(f.name(), f.text()));
    }

    @Test
    public void anotherPayloadStops() throws IOException {
        Path project = project();
        write(project, "src/test/resources/data/setup/trade-create.json",
                "{\"request\":{\"basic\":{\"portfolioId\":\"PF_B\"}}}");
        LegacyMigration.SetupPlan plan = LegacyMigration.planSetup(new LegacyMigration.Sources(FIXTURE, project));
        assertTrue(plan.stops().toString(), String.join("\n", plan.stops()).contains("data/setup/trade-create.json"));
    }

    @Test
    public void usesAreRenamed() throws IOException {
        Path project = project();
        write(project, "src/main/resources/snippet/api/x.snippet", "@Given \"^build a trade for product '([^']*)'$\"\n"
                + "  Given build json request with body from test data 'API-SETUP-TRADE-CREATE' for product '$1'\n");
        write(project, "src/main/java/x/Steps.java", "package x;\n\nclass Steps {\n"
                + "    void s(Object p) { submitTradeAsPendingApproval(\"a\", \"b\", "
                + "\"API-SETUP-STEPIN-FULL-TRADE-CREATE\", p); }\n"
                + "}\n");
        String tag = "@x from test data 'API-SETUP-TRADE-CREATE'";
        write(project, "src/test/resources/features/ui/trading/trade_x.feature", tag + "\nFeature: x\n\n"
                + "  Scenario: [TC-TRADE-X-UI-001] does x\n"
                + "    And the page answers from test data 'UI-SETUP-RISK-CALC-NEW-SUCCESS'\n");
        LegacyMigration.Sources sources = new LegacyMigration.Sources(FIXTURE, project);
        LegacyMigration.SetupPlan plan = LegacyMigration.planSetup(sources);
        assertEquals(List.of(), plan.stops());
        assertEquals(Set.of(
                new LegacyMigration.Rename("src/main/java/x/Steps.java", 4, "API-SETUP-STEPIN-FULL-TRADE-CREATE",
                        "trade-create-stepin-full"),
                new LegacyMigration.Rename("src/main/resources/snippet/api/x.snippet", 2, "API-SETUP-TRADE-CREATE",
                        "trade-create"),
                new LegacyMigration.Rename("src/test/resources/features/ui/trading/trade_x.feature", 5,
                        "UI-SETUP-RISK-CALC-NEW-SUCCESS", "risk-calc-success-mock")), new HashSet<>(plan.renames()));
        assertEquals(3, plan.renames().size());

        LegacyMigration.writeSetup(sources, plan);
        assertTrue(read(project, "src/main/resources/snippet/api/x.snippet")
                .contains("from test data 'trade-create' for"));
        assertTrue(read(project, "src/main/java/x/Steps.java").contains("\"b\", \"trade-create-stepin-full\", p"));
        String feature = read(project, "src/test/resources/features/ui/trading/trade_x.feature");
        assertTrue(feature, feature.startsWith(tag + "\n"));
        assertTrue(feature, feature.contains("from test data 'risk-calc-success-mock'"));
        assertTrue(Files.isRegularFile(project.resolve("src/test/resources/data/setup/trade-create.json")));
    }

    @Test
    public void renamingKeepsLineEndsAndBom() throws IOException {
        Path project = project();
        String snippet = "@Given \"^build a trade$\"\r\n"
                + "  Given build json request with body from test data 'API-SETUP-TRADE-CREATE'\r\n";
        Path file = project.resolve("src/main/resources/snippet/api/x.snippet");
        Files.createDirectories(file.getParent());
        Files.write(file, ("\uFEFF" + snippet).getBytes(StandardCharsets.UTF_8));
        LegacyMigration.Sources sources = new LegacyMigration.Sources(FIXTURE, project);
        LegacyMigration.writeSetup(sources, LegacyMigration.planSetup(sources));
        byte[] bytes = Files.readAllBytes(file);
        assertArrayEquals(new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF}, Arrays.copyOf(bytes, 3));
        assertEquals("\uFEFF" + snippet.replace("'API-SETUP-TRADE-CREATE'", "'trade-create'"),
                new String(bytes, StandardCharsets.UTF_8));
    }

    @Test
    public void aKeyUsedByNameIsASetupKey() throws IOException {
        Path project = project();
        Path old = tmp.newFolder("old").toPath();
        yaml(old, "ui/x.yml", "UI-SETUP-FOO:\n  request: |\n    {\"a\": 1}\nREQ-TPL-X:\n  request: |\n    {}\n");
        write(project, "src/main/java/x/Steps.java", "class Steps { String k = \"UI-SETUP-FOO\"; }\n");
        LegacyMigration.SetupPlan plan = LegacyMigration.planSetup(
                new LegacyMigration.Sources(LegacyData.in(old), project));
        assertEquals(List.of(), plan.stops());
        assertEquals(Set.of("foo"), names(plan));
    }

    @Test
    public void twoKeysForOneNameStop() throws IOException {
        Path project = project();
        Path old = tmp.newFolder("old").toPath();
        yaml(old, "ui/x.yml", "API-SETUP-FOO:\n  request: |\n    {\"a\": 1}\n"
                + "UI-SETUP-FOO:\n  request: |\n    {\"a\": 2}\n");
        write(project, "src/main/java/x/Steps.java",
                "class Steps { String a = \"API-SETUP-FOO\"; String b = \"UI-SETUP-FOO\"; }\n");
        LegacyMigration.SetupPlan plan = LegacyMigration.planSetup(
                new LegacyMigration.Sources(LegacyData.in(old), project));
        String stops = String.join("\n", plan.stops());
        assertTrue(stops, stops.contains("API-SETUP-FOO"));
        assertTrue(stops, stops.contains("UI-SETUP-FOO"));
        assertTrue(stops, stops.contains("foo"));
    }

    @Test
    public void knownMissingLosesTheWrittenNames() throws IOException {
        Path project = project();
        Path old = tmp.newFolder("old").toPath();
        yaml(old, "api/x.yml", "API-SETUP-TRADE-CANCELLATION:\n  request: |\n    {\"cancel\": {\"reason\": \"x\"}}\n");
        LegacyMigration.Sources sources = new LegacyMigration.Sources(LegacyData.in(old), project);
        LegacyMigration.SetupPlan plan = LegacyMigration.planSetup(sources);
        assertEquals(List.of(), plan.stops());
        assertEquals(List.of("trade-amendment"), plan.knownMissing());
        LegacyMigration.writeSetup(sources, plan);
        assertTrue(read(project, VALIDATION_TEST).contains(
                "    private static final Set<String> KNOWN_MISSING = Set.of(\"trade-amendment\");\n"));
    }

    @Test
    public void secondRunChangesNothing() throws IOException {
        Path project = project();
        write(project, "src/main/resources/snippet/api/x.snippet",
                "  Given build json request with body from test data 'API-SETUP-TRADE-CREATE'\n");
        LegacyMigration.Sources sources = new LegacyMigration.Sources(FIXTURE, project);
        LegacyMigration.writeSetup(sources, LegacyMigration.planSetup(sources));
        LegacyMigration.SetupPlan again = LegacyMigration.planSetup(sources);
        assertEquals(List.of(), again.stops());
        assertEquals(FIXTURE_NAMES, names(again));
        again.files().forEach(f -> assertNull(f.name(), f.text()));
        assertEquals(List.of(), again.renames());
        assertTrue(again.rewrites().isEmpty());
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * A project folder: empty {@code data/setup}, {@code features}, {@code src/main/java} and
     * {@code src/main/resources/snippet}, and a TestDataValidationTest holding only the KNOWN_MISSING line.
     */
    private Path project() throws IOException {
        Path project = tmp.newFolder("project").toPath();
        Files.createDirectories(project.resolve("src/test/resources/data/setup"));
        Files.createDirectories(project.resolve("src/test/resources/features"));
        Files.createDirectories(project.resolve("src/main/java"));
        Files.createDirectories(project.resolve("src/main/resources/snippet"));
        write(project, VALIDATION_TEST, "package com.example.module.oreo.testdata;\n\n"
                + "public class TestDataValidationTest {\n\n" + KNOWN_MISSING_LINE + "\n}\n");
        return project;
    }

    private static Path repositorySetupFiles() {
        try {
            return Paths.get(Thread.currentThread().getContextClassLoader().getResource("data/setup").toURI());
        } catch (URISyntaxException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Set<String> names(LegacyMigration.SetupPlan plan) {
        Set<String> names = new HashSet<>();
        plan.files().forEach(f -> names.add(f.name()));
        return names;
    }

    private static LegacyMigration.SetupFile file(LegacyMigration.SetupPlan plan, String name) {
        return plan.files().stream().filter(f -> f.name().equals(name)).findFirst()
                .orElseThrow(() -> new AssertionError("no setup file " + name + " in " + plan.files()));
    }

    private static void write(Path project, String file, String text) throws IOException {
        Path path = project.resolve(file);
        Files.createDirectories(path.getParent());
        Files.writeString(path, text, StandardCharsets.UTF_8);
    }

    private static String read(Path project, String file) throws IOException {
        return Files.readString(project.resolve(file), StandardCharsets.UTF_8);
    }

    private static void yaml(Path dir, String file, String text) throws IOException {
        Path path = dir.resolve(file);
        Files.createDirectories(path.getParent());
        Files.writeString(path, text, StandardCharsets.UTF_8);
    }
}
