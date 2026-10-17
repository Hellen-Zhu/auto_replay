package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import java.util.List;
import java.util.stream.Stream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

/** The plan of a feature's request data: on the fixture of real old data and on small synthetic features. */
public class LegacyMigrationTest {

    private static final LegacyData FIXTURE = new LegacyData(LegacyData.FIXTURE);

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    @Test
    public void earlyTerminationGetsDefaultsOnly() throws IOException {
        LegacyMigration.Plan plan = plan(FIXTURE, project(), "trade_early_termination");
        assertEquals(List.of(), plan.stops());
        assertEquals(1, plan.channels().size());
        LegacyMigration.Channel ui = plan.channels().get(0);
        assertEquals("ui", ui.dir());
        assertEquals("{\n"
                + "  \"_comment\": \"features/ui/trading/trade_early_termination.feature\",\n"
                + "  \"defaults\": {\n"
                + "    \"request\": {\n"
                + "      \"earlyTermination\": {\n"
                + "        \"direction\": \"Pay\",\n"
                + "        \"amount\": \"100\",\n"
                + "        \"ccy\": \"USD\"\n"
                + "      }\n"
                + "    }\n"
                + "  }\n"
                + "}\n", Json.pretty(ui.eventFile()));
    }

    @Test
    public void uiCreationRequestsAreLayered() throws IOException {
        LegacyMigration.Channel ui = channel(plan(FIXTURE, project(), "trade_creation"), "ui");
        assertEquals(Json.parse("{\"basic\":{\"portfolioId\":\"ABS_EQF\",\"counterpartyFmId\":\"300036958\","
                        + "\"counterpartyName\":\"10 AM NY\",\"direction\":\"Buy\"},"
                        + "\"stepIn\":{\"oldCounterpartyName\":\"10 AM JAK\"}}"),
                ui.eventFile().path("defaults").path("request"));
        assertEquals(Json.parse("[{\"id\":\"TC-TRADE-CREATION-<product_type>-UI-001\","
                        + "\"_comment\":\"Should be able to create a <product_type> Trade\","
                        + "\"request\":{\"stepIn\":null}}]"),
                ui.eventFile().get("cases"));
    }

    @Test
    public void apiCreationRequestsAreLayered() throws IOException {
        LegacyMigration.Channel api = channel(plan(FIXTURE, project(), "trade_creation"), "api");
        assertEquals(Json.parse("{\"basic\":{\"direction\":\"Sell\",\"premiumAmount\":null,\"premiumCurrency\":null}}"),
                api.eventFile().path("byProduct").path("FX_PSCRIPT_TRF").path("request"));
        List<String> withRequest = new ArrayList<>();
        api.eventFile().path("cases").forEach(row -> {
            if (row.has("request")) withRequest.add(row.get("id").asText());
        });
        assertEquals(List.of("TC-TRADE-CREATION-<product_type>-API-002", "TC-TRADE-CREATION-<product_type>-API-003",
                "TC-TRADE-CREATION-API-004", "TC-TRADE-CREATION-API-005"), withRequest);
        assertEquals("Buy", row(api, "TC-TRADE-CREATION-<product_type>-API-003")
                .path("request").path("basic").path("direction").asText());
        assertEquals(Json.parse("{\"basic\":{\"notionalCurrency\":\"\"}}"),
                row(api, "TC-TRADE-CREATION-<product_type>-API-002")
                        .path("byProduct").path("FX_PSCRIPT_TRF").path("request"));
    }

    @Test
    public void everyFixtureCasePassesTheSelfCheck() throws IOException {
        Path project = project();
        LegacyMigration.Plan creation = plan(FIXTURE, project, "trade_creation");
        assertEquals(List.of(), creation.stops());
        LegacyMigration.Channel api = channel(creation, "api");
        assertEquals(15, api.caseLines().size());
        assertEquals(12, channel(creation, "ui").caseLines().size());
        assertTrue(api.caseLines().toString(), api.caseLines().contains("TC-TRADE-CREATION-FX_PSCRIPT_TRF-API-002: "
                + "trade_creation.json defaults, trade_creation.json byProduct FX_PSCRIPT_TRF, "
                + "row TC-TRADE-CREATION-<product_type>-API-002, "
                + "row TC-TRADE-CREATION-<product_type>-API-002 byProduct FX_PSCRIPT_TRF"));
        LegacyMigration.Plan earlyTermination = plan(FIXTURE, project, "trade_early_termination");
        assertEquals(List.of(), earlyTermination.stops());
        assertEquals(4, channel(earlyTermination, "ui").caseLines().size());
    }

    @Test
    public void writtenFilesLoadThroughTheRealLoader() throws IOException {
        LegacyMigration.Sources sources = new LegacyMigration.Sources(FIXTURE, project());
        LegacyMigration.Plan plan = LegacyMigration.plan(sources, "trade_creation");
        LegacyMigration.write(sources, plan);
        assertTrue(plan.files().toString(),
                plan.files().containsAll(List.of("data/api/trade_creation.json", "data/ui/trade_creation.json")));

        CaseData api = load(sources, "TC-TRADE-CREATION-FX_PSCRIPT_TRF-API-002");
        ObjectNode old = (ObjectNode) Json.parse(FIXTURE.forKey("TC-TRADE-CREATION-FX_PSCRIPT_TRF-API-002").request());
        ((ObjectNode) old.get("basic")).remove("productId");
        assertEquals(old, Json.parse(api.request()));

        CaseData ui = load(sources, "TC-TRADE-CREATION-FX_TRF-UI-001");
        assertTrue(ui.hasRequest());
        assertFalse(ui.request(), Json.parse(ui.request()).has("stepIn"));
    }

    @Test
    public void anExistingEventFileStops() throws IOException {
        LegacyMigration.Sources sources = new LegacyMigration.Sources(FIXTURE, project());
        LegacyMigration.write(sources, LegacyMigration.plan(sources, "trade_early_termination"));
        LegacyMigration.Plan again = LegacyMigration.plan(sources, "trade_early_termination");
        assertTrue(stops(again), stops(again).contains("data/ui/trade_early_termination.json exists"));
        assertEquals(List.of(), again.files());
        assertThrows(IllegalStateException.class, () -> LegacyMigration.write(sources, again));
    }

    @Test
    public void caseIdOfAnotherEventStops() throws IOException {
        Path project = project();
        feature(project, "ui", "trade_allocation", scenario("TC-ALLOC-UI-001", "allocates a trade"));
        LegacyMigration.Plan plan = plan(FIXTURE, project, "trade_allocation");
        String stops = stops(plan);
        assertTrue(stops, stops.contains("TC-ALLOC-UI-001"));
        assertTrue(stops, stops.contains("alloc.json"));
        assertTrue(stops, stops.contains("trade_allocation"));
        assertEquals(List.of(), plan.files());
    }

    @Test
    public void oldLoaderFailureStops() throws IOException {
        Path project = project();
        Path old = tmp.newFolder("old").toPath();
        yaml(old, "ui/trade_x.yml", "TC-TRADE-X-UI-001:\n  requestRef: NOWHERE\n");
        feature(project, "ui", "trade_x", scenario("TC-TRADE-X-UI-001", "does x"));
        LegacyMigration.Plan plan = plan(LegacyData.in(old), project, "trade_x");
        assertTrue(stops(plan), stops(plan).contains("references missing requestRef"));
    }

    @Test
    public void unparsableOldJsonStops() throws IOException {
        Path project = project();
        Path old = tmp.newFolder("old").toPath();
        yaml(old, "ui/trade_x.yml", entry("TC-TRADE-X-UI-001", "{\"a\": 1,}"));
        feature(project, "ui", "trade_x", scenario("TC-TRADE-X-UI-001", "does x"));
        LegacyMigration.Plan plan = plan(LegacyData.in(old), project, "trade_x");
        assertTrue(stops(plan), stops(plan).contains("TC-TRADE-X-UI-001"));
        assertTrue(stops(plan), stops(plan).contains("ui/trade_x.yml"));
    }

    @Test
    public void mainCodeCallingTheOldLoaderStops() throws IOException {
        Path project = project();
        Path steps = project.resolve("src/main/java/x/Steps.java");
        Files.createDirectories(steps.getParent());
        Files.writeString(steps, "package x;\n\nclass Steps { Object k = TestDataLoader.forKey(\"K\"); }\n",
                StandardCharsets.UTF_8);
        LegacyMigration.Plan plan = plan(FIXTURE, project, "trade_early_termination");
        assertTrue(stops(plan), stops(plan).contains("x/Steps.java:3"));
        assertEquals(List.of(), plan.files());
    }

    @Test
    public void twoPrefixedKeysStop() throws IOException {
        Path project = project();
        Path old = tmp.newFolder("old").toPath();
        yaml(old, "ui/trade_x.yml", entry("A.TC-TRADE-X-UI-001", "{}") + entry("B.TC-TRADE-X-UI-001", "{}"));
        feature(project, "ui", "trade_x", scenario("TC-TRADE-X-UI-001", "does x"));
        LegacyMigration.Plan plan = plan(LegacyData.in(old), project, "trade_x");
        assertTrue(stops(plan), stops(plan).contains("A.TC-TRADE-X-UI-001"));
        assertTrue(stops(plan), stops(plan).contains("B.TC-TRADE-X-UI-001"));
    }

    @Test
    public void inexpressibleValueStops() throws IOException {
        Path project = project();
        Path old = tmp.newFolder("old").toPath();
        yaml(old, "ui/trade_x.yml", entry("TC-TRADE-X-UI-001", "{\"s\":{\"a\":1}}")
                + entry("TC-TRADE-X-UI-002", "{\"s\":{\"a\":1}}") + entry("TC-TRADE-X-UI-003", "{\"s\":{\"a\":1}}")
                + entry("TC-TRADE-X-UI-004", "{\"s\":{}}"));
        feature(project, "ui", "trade_x", scenario("TC-TRADE-X-UI-001", "one") + scenario("TC-TRADE-X-UI-002", "two")
                + scenario("TC-TRADE-X-UI-003", "three") + scenario("TC-TRADE-X-UI-004", "four"));
        LegacyMigration.Plan plan = plan(LegacyData.in(old), project, "trade_x");
        assertTrue(stops(plan), stops(plan).contains("TC-TRADE-X-UI-004"));
        assertTrue(stops(plan), stops(plan).contains("self-check"));
        assertEquals(List.of(), plan.files());
    }

    @Test
    public void uiCaseWithoutOldDataKeepsHavingNone() throws IOException {
        Path project = project();
        Path old = tmp.newFolder("old").toPath();
        yaml(old, "ui/trade_x.yml", entry("TC-TRADE-X-UI-001", "{\"a\":{\"b\":1}}"));
        feature(project, "ui", "trade_x", scenario("TC-TRADE-X-UI-001", "does x")
                + scenario("TC-TRADE-X-UI-002", "does y"));
        LegacyMigration.Sources sources = new LegacyMigration.Sources(LegacyData.in(old), project);
        LegacyMigration.Plan plan = LegacyMigration.plan(sources, "trade_x");
        assertEquals(List.of(), plan.stops());
        assertEquals(Json.parse("[{\"id\":\"TC-TRADE-X-UI-002\",\"_comment\":\"does y; no case data in the old YAML\","
                + "\"request\":{\"a\":null}}]"), channel(plan, "ui").eventFile().get("cases"));
        LegacyMigration.write(sources, plan);
        assertFalse(load(sources, "TC-TRADE-X-UI-002").hasRequest());
    }

    @Test
    public void uiFeatureWithoutOldDataGetsNoEventFile() throws IOException {
        Path project = project();
        feature(project, "ui", "trade_x", scenario("TC-TRADE-X-UI-001", "does x"));
        LegacyMigration.Plan plan = plan(LegacyData.in(tmp.newFolder("old").toPath()), project, "trade_x");
        assertEquals(List.of(), plan.stops());
        assertNull(channel(plan, "ui").eventFile());
        assertEquals(List.of(), plan.files());
    }

    @Test
    public void orphansAreListed() throws IOException {
        Path project = project();
        Path old = tmp.newFolder("old").toPath();
        yaml(old, "ui/trade_x.yml", entry("TC-TRADE-X-UI-001", "{\"a\":1}") + entry("TC-TRADE-X-UI-009", "{\"a\":2}")
                + entry("TC-TRADE-Y-UI-001", "{}") + entry("REQ-TPL-TRADE-X-UI-001", "{}"));
        yaml(old, "api/trade_x.yml", entry("TC-TRADE-X-API-009", "{}"));
        feature(project, "ui", "trade_x", scenario("TC-TRADE-X-UI-001", "does x"));
        LegacyMigration.Plan plan = plan(LegacyData.in(old), project, "trade_x");
        assertEquals(List.of("TC-TRADE-X-UI-009 (ui/trade_x.yml)"), channel(plan, "ui").orphans());
    }

    @Test
    public void uiPortfolioIsReplacedAndOthersListed() throws IOException {
        Path project = project();
        Path old = tmp.newFolder("old").toPath();
        yaml(old, "ui/trade_x.yml", entry("TC-TRADE-X-UI-001", "{\"basic\":{\"portfolioId\":\"CM_OIL_CRU_OPT\"}}")
                + entry("TC-TRADE-X-UI-002", "{\"basic\":{\"portfolioId\":\"PF_B\"}}"));
        yaml(old, "api/trade_x.yml", "TC-TRADE-X-API-001:\n"
                + "  request: |\n    {\"basic\":{\"portfolioId\":\"CM_OIL_CRU_OPT\"}}\n"
                + "  response: |\n    {\"code\":200}\n");
        feature(project, "ui", "trade_x", scenario("TC-TRADE-X-UI-001", "does x")
                + scenario("TC-TRADE-X-UI-002", "does y"));
        feature(project, "api", "trade_x", scenario("TC-TRADE-X-API-001", "posts x"));
        LegacyMigration.Plan plan = plan(LegacyData.in(old), project, "trade_x");
        assertEquals(List.of(), plan.stops());

        LegacyMigration.Channel ui = channel(plan, "ui");
        assertEquals("ABS_EQF",
                row(ui, "TC-TRADE-X-UI-001").path("request").path("basic").path("portfolioId").asText());
        assertEquals(List.of("TC-TRADE-X-UI-002: basic.portfolioId = PF_B"), ui.portfolios());

        LegacyMigration.Channel api = channel(plan, "api");
        assertEquals("CM_OIL_CRU_OPT",
                api.eventFile().path("defaults").path("request").path("basic").path("portfolioId").asText());
        assertEquals(List.of("TC-TRADE-X-API-001: basic.portfolioId = CM_OIL_CRU_OPT"), api.portfolios());
    }

    @Test
    public void untaggedOutlineGetsACapabilityProposal() throws IOException {
        Path project = project();
        feature(project, "ui", "trade_partial_termination", "  @ADO#positive\n"
                + "  Scenario Outline: [TC-TRADE-PARTIAL-TERMINATION-<product_type>-UI-001] terminates a part\n"
                + "    Given a step\n\n"
                + "    Examples:\n"
                + "      | product_type |\n"
                + "      | FX_TRF       |\n"
                + "      | FX_PSCRIPT   |\n");
        LegacyMigration.Plan plan = plan(FIXTURE, project, "trade_partial_termination");
        assertEquals(1, plan.capabilities().size());
        String proposal = plan.capabilities().get(0);
        assertTrue(proposal, proposal.contains("@capability#partialTermination"));
        assertTrue(proposal, proposal.contains("FX_TRF, FX_PSCRIPT"));
        assertEquals(List.of(), plan(FIXTURE, project, "trade_creation").capabilities());
    }

    @Test
    public void featureNamesAreThoseWithoutTheirEventFile() throws IOException {
        LegacyMigration.Sources sources = new LegacyMigration.Sources(FIXTURE, project());
        assertEquals(List.of("trade_creation", "trade_early_termination"), LegacyMigration.featureNames(sources));
        LegacyMigration.write(sources, LegacyMigration.plan(sources, "trade_early_termination"));
        assertEquals(List.of("trade_creation"), LegacyMigration.featureNames(sources));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** A project folder: the fixture features, empty {@code data/api}, {@code data/ui} and {@code src/main/java}. */
    private Path project() throws IOException {
        Path project = tmp.newFolder("project").toPath();
        Path resources = project.resolve("src/test/resources");
        copyTree(fixtureFeatures(), resources.resolve("features"));
        Files.createDirectories(resources.resolve("data/api"));
        Files.createDirectories(resources.resolve("data/ui"));
        Files.createDirectories(project.resolve("src/main/java"));
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

    private static LegacyMigration.Plan plan(LegacyData legacy, Path project, String name) {
        return LegacyMigration.plan(new LegacyMigration.Sources(legacy, project), name);
    }

    private static LegacyMigration.Channel channel(LegacyMigration.Plan plan, String dir) {
        return plan.channels().stream().filter(c -> c.dir().equals(dir)).findFirst()
                .orElseThrow(() -> new AssertionError("no channel " + dir + " in " + plan.channels()));
    }

    private static JsonNode row(LegacyMigration.Channel channel, String id) {
        for (JsonNode row : channel.eventFile().path("cases")) {
            if (row.get("id").asText().equals(id)) return row;
        }
        throw new AssertionError("no row " + id + " in " + channel.eventFile());
    }

    private static String stops(LegacyMigration.Plan plan) {
        return String.join("\n", plan.stops());
    }

    private static CaseData load(LegacyMigration.Sources sources, String caseId) {
        return LegacyMigration.withClasspath(sources.resources(),
                () -> new TestDataRepository("data/").forCase(caseId));
    }

    private static String entry(String key, String request) {
        return key + ":\n  request: |\n    " + request + "\n";
    }

    private static void yaml(Path dir, String file, String text) throws IOException {
        Path path = dir.resolve(file);
        Files.createDirectories(path.getParent());
        Files.writeString(path, text, StandardCharsets.UTF_8);
    }

    private static String scenario(String id, String name) {
        return "  Scenario: [" + id + "] " + name + "\n    Given a step\n\n";
    }

    private static void feature(Path project, String dir, String name, String scenarios) throws IOException {
        Path path = project.resolve("src/test/resources/features/" + dir + "/trading/" + name + ".feature");
        Files.createDirectories(path.getParent());
        Files.writeString(path, "Feature: " + name + "\n\n" + scenarios, StandardCharsets.UTF_8);
    }
}
