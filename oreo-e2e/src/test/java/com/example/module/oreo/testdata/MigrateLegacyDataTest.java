package com.example.module.oreo.testdata;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.stream.Stream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

/** The tool's scopes on the fixture of real old data: plan, write on request, stops, {@code all} and setup. */
public class MigrateLegacyDataTest {

    private static final LegacyData FIXTURE = new LegacyData(LegacyData.FIXTURE);
    private static final String VALIDATION_TEST =
            "src/test/java/com/example/module/oreo/testdata/TestDataValidationTest.java";

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    @Test
    public void plansWithoutWriting() throws IOException {
        LegacyMigration.Sources sources = new LegacyMigration.Sources(FIXTURE, fixtureProject(tmp));
        String text = MigrateLegacyData.run(sources, "trade_early_termination", false);
        assertTrue(text, text.contains("Plan only"));
        assertEquals(0, count(sources.data().resolve("ui")));
    }

    @Test
    public void writesOnRequest() throws IOException {
        LegacyMigration.Sources sources = new LegacyMigration.Sources(FIXTURE, fixtureProject(tmp));
        String text = MigrateLegacyData.run(sources, "trade_early_termination", true);
        assertTrue(Files.exists(sources.data().resolve("ui/trade_early_termination.json")));
        assertTrue(text, text.contains("Written"));
    }

    @Test
    public void stoppedPlanWritesNothing() throws IOException {
        LegacyMigration.Sources sources = new LegacyMigration.Sources(FIXTURE, fixtureProject(tmp));
        Files.writeString(sources.data().resolve("ui/trade_creation.json"), "{}", StandardCharsets.UTF_8);
        AssertionError e = assertThrows(AssertionError.class,
                () -> MigrateLegacyData.run(sources, "trade_creation", true));
        assertTrue(e.getMessage(), e.getMessage().contains("Nothing written"));
        assertEquals(0, count(sources.data().resolve("api")));
    }

    @Test
    public void allOnlyPlans() throws IOException {
        LegacyMigration.Sources sources = new LegacyMigration.Sources(FIXTURE, fixtureProject(tmp));
        AssertionError e = assertThrows(AssertionError.class, () -> MigrateLegacyData.run(sources, "all", true));
        assertTrue(e.getMessage(), e.getMessage().contains("-Doreo.migrate=all only plans"));
        assertEquals(0, count(sources.data()));
    }

    @Test
    public void allListsEveryFeature() throws IOException {
        LegacyMigration.Sources sources = new LegacyMigration.Sources(FIXTURE, fixtureProject(tmp));
        String text = MigrateLegacyData.run(sources, "all", false);
        assertTrue(text, text.contains("trade_creation: ready"));
        assertTrue(text, text.contains("trade_early_termination: ready"));
        assertTrue(text, text.contains("2 to migrate, 0 stopped, 0 with nothing to migrate"));
        assertEquals(0, count(sources.data()));
    }

    @Test
    public void allSkipsAMigratedFeatureWhoseUiHasNoData() throws IOException {
        Path old = tmp.newFolder("old").toPath();
        Files.createDirectories(old.resolve("api"));
        Files.writeString(old.resolve("api/trade_x.yml"), "TC-TRADE-X-API-001:\n  request: |\n    {\"a\":1}\n"
                + "  response: |\n    {\"code\":200}\n", StandardCharsets.UTF_8);
        Path project = fixtureProject(tmp);
        feature(project, "api", "trade_x", "TC-TRADE-X-API-001");
        feature(project, "ui", "trade_x", "TC-TRADE-X-UI-001");
        LegacyMigration.Sources sources = new LegacyMigration.Sources(LegacyData.in(old), project);
        MigrateLegacyData.run(sources, "trade_x", true);
        assertTrue(Files.exists(sources.data().resolve("api/trade_x.json")));
        assertFalse(Files.exists(sources.data().resolve("ui/trade_x.json")));
        String text = MigrateLegacyData.run(sources, "all", false);
        assertFalse(text, text.contains("trade_x"));
    }

    @Test
    public void setupScope() throws IOException {
        LegacyMigration.Sources sources = new LegacyMigration.Sources(FIXTURE, fixtureProject(tmp));
        MigrateLegacyData.run(sources, "setup", true);
        assertEquals(6, count(sources.data().resolve("setup")));
        String again = MigrateLegacyData.run(sources, "setup", true);
        assertTrue(again, again.contains("0 setup file(s) written"));
        assertEquals(6, count(sources.data().resolve("setup")));
    }

    @Test
    public void unknownFeatureStops() throws IOException {
        LegacyMigration.Sources sources = new LegacyMigration.Sources(FIXTURE, fixtureProject(tmp));
        AssertionError e = assertThrows(AssertionError.class,
                () -> MigrateLegacyData.run(sources, "trade_nothing", false));
        assertTrue(e.getMessage(), e.getMessage().contains("trade_nothing.feature"));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * A project folder: the fixture features, empty {@code data/api}, {@code data/ui} and {@code src/main/java}, and a
     * TestDataValidationTest holding only the KNOWN_MISSING line (for the setup scope).
     */
    static Path fixtureProject(TemporaryFolder tmp) throws IOException {
        Path project = tmp.newFolder("project").toPath();
        Path resources = project.resolve("src/test/resources");
        copyTree(fixtureFeatures(), resources.resolve("features"));
        Files.createDirectories(resources.resolve("data/api"));
        Files.createDirectories(resources.resolve("data/ui"));
        Files.createDirectories(project.resolve("src/main/java"));
        Path validationTest = project.resolve(VALIDATION_TEST);
        Files.createDirectories(validationTest.getParent());
        Files.writeString(validationTest, "package com.example.module.oreo.testdata;\n\n"
                + "public class TestDataValidationTest {\n\n"
                + "    private static final Set<String> KNOWN_MISSING = Set.of(\"trade-cancellation\");\n}\n",
                StandardCharsets.UTF_8);
        return project;
    }

    private static Path fixtureFeatures() {
        try {
            return Paths.get(Thread.currentThread().getContextClassLoader()
                    .getResource("testdata-fixtures/legacy/features").toURI());
        } catch (URISyntaxException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void copyTree(Path from, Path to) throws IOException {
        try (Stream<Path> walk = Files.walk(from)) {
            for (Path path : walk.toList()) {
                Path target = to.resolve(from.relativize(path).toString());
                if (Files.isDirectory(path)) {
                    Files.createDirectories(target);
                } else {
                    Files.copy(path, target);
                }
            }
        }
    }

    /** The regular files below {@code dir}; 0 when it does not exist. */
    private static long count(Path dir) throws IOException {
        if (!Files.isDirectory(dir)) return 0;
        try (Stream<Path> walk = Files.walk(dir)) {
            return walk.filter(Files::isRegularFile).count();
        }
    }

    private static void feature(Path project, String dir, String name, String caseId) throws IOException {
        Path path = project.resolve("src/test/resources/features/" + dir + "/trading/" + name + ".feature");
        Files.createDirectories(path.getParent());
        Files.writeString(path, "Feature: " + name + "\n\n  Scenario: [" + caseId + "] does it\n    Given a step\n",
                StandardCharsets.UTF_8);
    }
}
