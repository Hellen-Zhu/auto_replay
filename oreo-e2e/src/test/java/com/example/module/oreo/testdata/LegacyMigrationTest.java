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
import java.util.Map;
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

    @Test
    public void regexPlaceholderBecomesARule() throws IOException {
        LegacyMigration.Channel api = channel(plan(FIXTURE, project(), "trade_creation"), "api");
        String msg = Json.parse(FIXTURE.forKey("TC-TRADE-CREATION-FX_TRF-API-001").response()).get("msg").asText();
        assertTrue(msg, msg.startsWith("${json-unit.regex}"));
        assertEquals(Json.MAPPER.createObjectNode().put("msg", "regex:" + msg.substring("${json-unit.regex}".length())),
                api.eventFile().path("defaults").path("dynamicFields"));
        assertEquals(Json.parse("{\"msg\":null}"),
                api.eventFile().path("byProduct").path("FX_PSCRIPT_TRF").path("dynamicFields"));
        for (String id : List.of("TC-TRADE-CREATION-API-004", "TC-TRADE-CREATION-API-005",
                "TC-TRADE-CREATION-API-006")) {
            assertTrue(id, row(api, id).has("dynamicFields") && row(api, id).get("dynamicFields").isNull());
        }
        assertEquals(List.of("id", "_comment", "dynamicFields"), keys(row(api, "TC-TRADE-CREATION-API-006")));
    }

    @Test
    public void otherPlaceholdersAreListed() throws IOException {
        LegacyMigration.Channel api = channel(plan(FIXTURE, project(), "trade_creation"), "api");
        assertEquals(1, api.placeholdersWithoutRule().stream().filter(l -> l.startsWith("data.trade.id ")).count());
        assertFalse(Json.compact(api.eventFile()).contains("\"data.trade.id\""));
    }

    @Test
    public void knownRulePathIsReused() throws IOException {
        Path project = project();
        json(project, "data/api/trade_cancellation.json",
                "{\"defaults\":{\"dynamicFields\":{\"data.trade.id\":\"type\"}}}");
        LegacyMigration.Plan plan = plan(FIXTURE, project, "trade_creation");
        assertEquals(List.of(), plan.stops());
        LegacyMigration.Channel api = channel(plan, "api");
        assertEquals("type", api.eventFile().path("defaults").path("dynamicFields").path("data.trade.id").asText());
        assertTrue(api.placeholdersWithoutRule().stream().noneMatch(l -> l.startsWith("data.trade.id ")));
    }

    @Test
    public void knownRuleWithAnyIndexMatches() throws IOException {
        Path project = project();
        json(project, "data/api/trade_y.json", "{\"defaults\":{\"dynamicFields\":{\"data.items[*].id\":\"type\"}}}");
        Path old = tmp.newFolder("old").toPath();
        yaml(old, "api/trade_x.yml", apiEntry("TC-TRADE-X-API-001", "{\"a\":1}",
                "{\"data\":{\"items\":[{\"id\":\"${json-unit.any-string}\"},{\"id\":\"${json-unit.any-string}\"}]}}"));
        feature(project, "api", "trade_x", scenario("TC-TRADE-X-API-001", "posts x"));
        LegacyMigration.Plan plan = plan(LegacyData.in(old), project, "trade_x");
        assertEquals(List.of(), plan.stops());
        LegacyMigration.Channel api = channel(plan, "api");
        assertEquals(Json.parse("{\"data.items[*].id\":\"type\"}"),
                api.eventFile().path("defaults").path("dynamicFields"));
        assertEquals(List.of(), api.placeholdersWithoutRule());
    }

    @Test
    public void conflictingKnownRulesGiveNone() throws IOException {
        Path project = project();
        json(project, "data/api/trade_y.json", "{\"defaults\":{\"dynamicFields\":{\"data.trade.id\":\"type\"}}}");
        json(project, "data/api/trade_z.json",
                "{\"cases\":[{\"id\":\"TC-TRADE-Z-API-001\",\"dynamicFields\":{\"data.trade.id\":\"ignore\"}}]}");
        Path old = tmp.newFolder("old").toPath();
        yaml(old, "api/trade_x.yml", apiEntry("TC-TRADE-X-API-001", "{\"a\":1}",
                "{\"data\":{\"trade\":{\"id\":\"${json-unit.any-string}\"}}}"));
        feature(project, "api", "trade_x", scenario("TC-TRADE-X-API-001", "posts x"));
        LegacyMigration.Plan plan = plan(LegacyData.in(old), project, "trade_x");
        assertEquals(List.of(), plan.stops());
        LegacyMigration.Channel api = channel(plan, "api");
        assertFalse(api.eventFile().path("defaults").has("dynamicFields"));
        assertEquals(1, api.placeholdersWithoutRule().size());
        String line = api.placeholdersWithoutRule().get(0);
        assertTrue(line, line.startsWith("data.trade.id "));
        assertTrue(line, line.contains("= type"));
        assertTrue(line, line.contains("= ignore"));
    }

    @Test
    public void knownRegexRuleIsNotReused() throws IOException {
        Path project = project();
        json(project, "data/api/trade_y.json", "{\"defaults\":{\"dynamicFields\":{\"msg\":\"regex:Done\\\\..*\"}}}");
        Path old = tmp.newFolder("old").toPath();
        yaml(old, "api/trade_x.yml", apiEntry("TC-TRADE-X-API-001", "{\"a\":1}",
                "{\"msg\":\"${json-unit.any-string}\"}"));
        feature(project, "api", "trade_x", scenario("TC-TRADE-X-API-001", "posts x"));
        LegacyMigration.Plan plan = plan(LegacyData.in(old), project, "trade_x");
        assertEquals(List.of(), plan.stops());
        LegacyMigration.Channel api = channel(plan, "api");
        assertFalse(api.eventFile().path("defaults").has("dynamicFields"));
        assertEquals(1, api.placeholdersWithoutRule().size());
        String line = api.placeholdersWithoutRule().get(0);
        assertTrue(line, line.startsWith("msg "));
        assertTrue(line, line.contains("regex:Done") && line.contains("trade_y.json"));
    }

    @Test
    public void existingExpectedFileStops() throws IOException {
        Path project = project();
        Files.createDirectories(project.resolve("src/test/resources/data/api/expected/trade_creation"));
        json(project, "data/api/expected/trade_creation/TC-TRADE-CREATION-FX_TRF-API-001.json", "{}");
        LegacyMigration.Plan plan = plan(FIXTURE, project, "trade_creation");
        assertTrue(stops(plan), stops(plan).contains("data/api/expected/trade_creation/"));
        assertTrue(stops(plan), stops(plan).contains("TC-TRADE-CREATION-FX_TRF-API-001.json"));
        assertEquals(List.of(), plan.files());
    }

    @Test
    public void productIdRemovalIsListed() throws IOException {
        LegacyMigration.Plan plan = plan(FIXTURE, project(), "trade_creation");
        assertEquals(List.of("FX_TRF in 12 case(s)", "FX_PSCRIPT_TRF in 3 case(s)"), channel(plan, "api").productIds());
        assertEquals(List.of("FX_TRF in 12 case(s)"), channel(plan, "ui").productIds());
        assertTrue(plan.report(), plan.report().contains("basic.productId removed"));
    }

    @Test
    public void expectedFilesAreTheOldResponses() throws IOException {
        LegacyMigration.Sources sources = new LegacyMigration.Sources(FIXTURE, project());
        LegacyMigration.Plan plan = LegacyMigration.plan(sources, "trade_creation");
        LegacyMigration.Channel api = channel(plan, "api");
        assertEquals(15, api.expected().size());
        api.expected().forEach((id, text) ->
                assertEquals(id, Json.parse(FIXTURE.forKey(id).response()), Json.parse(text)));
        LegacyMigration.write(sources, plan);
        try (Stream<Path> files = Files.list(sources.data().resolve("api/expected/trade_creation"))) {
            assertEquals(15, files.count());
        }
        assertTrue(Files.isRegularFile(
                sources.data().resolve("api/expected/trade_creation/TC-TRADE-CREATION-API-004.json")));
    }

    @Test
    public void expectedBaseIsTheFirstProductOutline() throws IOException {
        Path project = project();
        LegacyMigration.Channel creation = channel(plan(FIXTURE, project, "trade_creation"), "api");
        assertEquals("TC-TRADE-CREATION-<product_type>-API-001",
                creation.eventFile().path("defaults").path("expectedBase").asText());

        Path old = tmp.newFolder("old").toPath();
        yaml(old, "api/trade_x.yml", apiEntry("TC-TRADE-X-FX_TRF-API-001", "{\"a\":1}", "{\"code\":200}")
                + apiEntry("TC-TRADE-X-FX_PSCRIPT-API-001", "{\"a\":1}", "{\"code\":200}"));
        feature(project, "api", "trade_x", outline("TC-TRADE-X-<product_type>-API-001", "FX_TRF", "FX_PSCRIPT"));
        LegacyMigration.Plan plan = plan(LegacyData.in(old), project, "trade_x");
        assertEquals(List.of(), plan.stops());
        assertFalse(channel(plan, "api").eventFile().path("defaults").has("expectedBase"));
    }

    @Test
    public void apiCaseWithoutOldDataStops() throws IOException {
        Path project = project();
        Path old = tmp.newFolder("old").toPath();
        yaml(old, "api/trade_x.yml", apiEntry("TC-TRADE-X-API-001", "{\"a\":1}", "{\"code\":200}"));
        feature(project, "api", "trade_x", scenario("TC-TRADE-X-API-001", "posts x")
                + scenario("TC-TRADE-X-API-002", "posts y"));
        LegacyMigration.Plan plan = plan(LegacyData.in(old), project, "trade_x");
        assertTrue(stops(plan), stops(plan).contains("TC-TRADE-X-API-002"));
        assertTrue(stops(plan), stops(plan).contains("expected file"));
        assertEquals(List.of(), plan.files());
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

    private static String apiEntry(String key, String request, String response) {
        return entry(key, request) + "  response: |\n    " + response + "\n";
    }

    private static void json(Path project, String file, String text) throws IOException {
        Files.writeString(project.resolve("src/test/resources").resolve(file), text, StandardCharsets.UTF_8);
    }

    private static List<String> keys(JsonNode node) {
        return node.properties().stream().map(Map.Entry::getKey).toList();
    }

    private static void yaml(Path dir, String file, String text) throws IOException {
        Path path = dir.resolve(file);
        Files.createDirectories(path.getParent());
        Files.writeString(path, text, StandardCharsets.UTF_8);
    }

    private static String scenario(String id, String name) {
        return "  Scenario: [" + id + "] " + name + "\n    Given a step\n\n";
    }

    private static String outline(String rowId, String... products) {
        StringBuilder text = new StringBuilder("  Scenario Outline: [" + rowId + "] does it\n    Given a step\n\n"
                + "    Examples:\n      | product_type |\n");
        for (String product : products) text.append("      | ").append(product).append(" |\n");
        return text.append('\n').toString();
    }

    private static void feature(Path project, String dir, String name, String scenarios) throws IOException {
        Path path = project.resolve("src/test/resources/features/" + dir + "/trading/" + name + ".feature");
        Files.createDirectories(path.getParent());
        Files.writeString(path, "Feature: " + name + "\n\n" + scenarios, StandardCharsets.UTF_8);
    }
}
