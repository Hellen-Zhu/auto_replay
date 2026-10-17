package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Migrates one feature's case data from the old YAML ({@link LegacyData}) to event files of the layered mechanism
 * (docs/superpowers/specs/2026-10-17-oreo-e2e-legacy-data-migration-design.md, section 3). {@link #plan} computes the
 * files and checks every case through the real loader; {@link #write} writes them. A problem is a stop: the plan says
 * why, and nothing of the feature is written.
 */
final class LegacyMigration {

    static final String NO_DATA = "no case data in the old YAML";

    private static final List<String> CHANNELS = List.of("api", "ui");
    private static final List<String> PRODUCTS = Arrays.stream(ProductDatFiles.values()).map(Enum::name).toList();
    private static final Pattern OLD_LOADER_CALL = Pattern.compile("\\bTestDataLoader\\s*\\.");
    private static final String OLD_UI_PORTFOLIO = "CM_OIL_CRU_OPT";
    private static final String UI_PORTFOLIO = "ABS_EQF";

    /**
     * @param legacy  the old YAML
     * @param project the {@code oreo-e2e} folder
     */
    record Sources(LegacyData legacy, Path project) {

        static Sources standard() {
            return new Sources(LegacyData.standard(), ProjectPaths.projectRoot());
        }

        Path resources() {
            return project.resolve("src/test/resources");
        }

        Path features() {
            return resources().resolve("features");
        }

        Path data() {
            return resources().resolve("data");
        }
    }

    /**
     * One channel of the feature.
     *
     * @param dir                     {@code api} or {@code ui}
     * @param featureFile             the feature file below the resources, e.g. {@code features/ui/trading/x.feature}
     * @param eventFile               the event file to write; null: none (a UI feature without old data)
     * @param expected                case ID -> expected file text (API)
     * @param caseLines               {@code <case ID>: <its layers>}
     * @param orphans                 old keys of this event and channel that no case matches, {@code <key> (<file>)}
     * @param placeholdersWithoutRule placeholder paths of the old responses that get no rule (API)
     * @param portfolios              portfolio values kept, {@code <case ID>: <path> = <value>}
     */
    record Channel(String dir, String featureFile, ObjectNode eventFile, Map<String, String> expected,
                   List<String> caseLines, List<String> orphans, List<String> placeholdersWithoutRule,
                   List<String> portfolios) {}

    /**
     * @param name         the feature name, e.g. {@code trade_creation}
     * @param capabilities capability proposals (spec 3.9)
     * @param stops        why the feature is not migrated; empty when it can be
     */
    record Plan(String name, List<Channel> channels, List<String> capabilities, List<String> stops) {

        Plan {
            channels = List.copyOf(channels);
            capabilities = List.copyOf(capabilities);
            stops = List.copyOf(stops);
        }

        boolean stopped() {
            return !stops.isEmpty();
        }

        /** What {@link #write} creates, below the resources; empty when stopped. */
        List<String> files() {
            if (stopped()) return List.of();
            return channels.stream().filter(c -> c.eventFile() != null)
                    .map(c -> "data/" + c.dir() + "/" + name + ".json").toList();
        }

        /** The report of the plan, which has written nothing. */
        String report() {
            return report(false);
        }

        /** The report; its last line says that nothing was written unless {@code written}. */
        String report(boolean written) {
            StringBuilder out = new StringBuilder(name).append('\n');
            for (Channel c : channels) {
                out.append(c.dir()).append(": ").append(c.eventFile() == null
                        ? "no event file (" + NO_DATA + ")"
                        : "data/" + c.dir() + "/" + name + ".json").append('\n');
                if (c.eventFile() != null) out.append("  leaves: ").append(leafCounts(c.eventFile())).append('\n');
                c.caseLines().forEach(line -> out.append("  ").append(line).append('\n'));
                list(out, "  ", "orphans, not migrated", c.orphans());
                list(out, "  ", "placeholders without a rule", c.placeholdersWithoutRule());
                list(out, "  ", "portfolio values kept", c.portfolios());
            }
            list(out, "", "capability proposals", capabilities);
            list(out, "", "stops", stops);
            if (!written) out.append("Plan only: nothing written.\n");
            return out.toString();
        }

        private static void list(StringBuilder out, String indent, String title, List<String> lines) {
            if (lines.isEmpty()) return;
            out.append(indent).append(title).append(":\n");
            lines.forEach(line -> out.append(indent).append("  ").append(line).append('\n'));
        }
    }

    /** A feature file of one channel, read. */
    private record Source(String dir, String featureFile, FeatureFile feature, List<FeatureCases.FeatureCase> cases) {}

    /** A case with its request (spec 3.3); {@code hasData}: the old YAML has a record for it. */
    private record Item(FeatureCases.FeatureCase featureCase, String product, ObjectNode request, boolean hasData) {

        String caseId() {
            return featureCase.caseId();
        }
    }

    private LegacyMigration() {}

    // ── Plan ─────────────────────────────────────────────────────────────────

    static Plan plan(Sources sources, String name) {
        List<String> stops = new ArrayList<>(oldLoaderCalls(sources.project().resolve("src/main/java")));
        if (!stops.isEmpty()) return new Plan(name, List.of(), List.of(), stops);

        List<String> capabilities = new ArrayList<>();
        List<Source> features = features(sources, name, capabilities, stops);
        if (!stops.isEmpty()) return new Plan(name, List.of(), capabilities, stops);

        Map<Source, List<Item>> items = new LinkedHashMap<>();
        for (Source source : features) {
            items.put(source, items(sources.legacy(), source, stops));
        }
        if (!stops.isEmpty()) return new Plan(name, List.of(), capabilities, stops);

        List<Channel> channels = new ArrayList<>();
        for (Source source : features) {
            channels.add(channel(sources.legacy(), name, source, items.get(source), stops));
        }
        return new Plan(name, channels, capabilities, stops);
    }

    /** Stop 6: {@code <path below src/main/java>:<line>} of each call of the old loader. */
    private static List<String> oldLoaderCalls(Path mainJava) {
        List<String> stops = new ArrayList<>();
        for (Path file : filesEndingWith(mainJava, ".java")) {
            String[] lines = read(file).split("\r?\n|\r", -1);
            for (int i = 0; i < lines.length; i++) {
                if (OLD_LOADER_CALL.matcher(lines[i]).find()) {
                    stops.add(slashes(mainJava.relativize(file)) + ":" + (i + 1)
                            + " still calls TestDataLoader, which no longer exists: move it to TestData first");
                }
            }
        }
        return stops;
    }

    /** The files {@code features/<api|ui>/**}{@code /<name>.feature}, read: stops 1 and 4, capability proposals. */
    private static List<Source> features(Sources sources, String name, List<String> capabilities, List<String> stops) {
        List<Source> found = new ArrayList<>();
        for (String dir : CHANNELS) {
            List<Path> files = filesEndingWith(sources.features().resolve(dir), ".feature").stream()
                    .filter(f -> baseName(f).equals(name)).toList();
            if (files.isEmpty()) continue;
            if (files.size() > 1) {
                stops.add("two feature files " + name + ".feature in features/" + dir + ": "
                        + files.stream().map(f -> slashes(sources.resources().relativize(f))).toList());
                continue;
            }
            String featureFile = slashes(sources.resources().relativize(files.get(0)));
            FeatureFile feature;
            List<FeatureCases.FeatureCase> cases;
            try {
                feature = FeatureFile.read(files.get(0));
                capabilities.addAll(capabilityProposals(name, feature, featureFile));
                cases = FeatureCases.cases(feature, dir);
            } catch (RuntimeException e) {
                stops.add(featureFile + ": " + e.getMessage());
                continue;
            }
            for (FeatureCases.FeatureCase c : cases) {
                try {
                    String event = CaseId.parse(c.caseId()).eventFile();
                    if (!event.equals(name)) {
                        stops.add(c.caseId() + " in " + featureFile + ": its event file is " + event + ".json, not "
                                + name + ".json (the loader finds a case's data by its ID): rename the feature file"
                                + " or the case IDs first, your decision");
                    }
                } catch (IllegalArgumentException e) {
                    stops.add(featureFile + ": " + e.getMessage());
                }
            }
            String target = "data/" + dir + "/" + name + ".json";
            if (Files.exists(sources.resources().resolve(target))) {
                stops.add(target + " exists: migrated before; delete it to migrate again");
            }
            found.add(new Source(dir, featureFile, feature, cases));
        }
        if (found.isEmpty() && stops.isEmpty()) {
            stops.add("no feature file " + name + ".feature under features/api or features/ui");
        }
        return found;
    }

    /** Spec 3.9: each product Outline without a capability tag. */
    private static List<String> capabilityProposals(String name, FeatureFile feature, String featureFile) {
        List<String> proposals = new ArrayList<>();
        for (FeatureFile.Block block : feature.blocks()) {
            if (block.kind() != FeatureFile.Kind.OUTLINE || block.rowId() == null
                    || !block.rowId().contains(FeatureCases.PRODUCT_PLACEHOLDER)) continue;
            if (block.tags().stream().anyMatch(t -> t.startsWith(Capability.TAG_PREFIX))) continue;
            List<String> products = block.examples().stream()
                    .flatMap(t -> t.column("product_type").stream()).distinct().toList();
            proposals.add(featureFile + " " + block.rowId() + ": " + Capability.TAG_PREFIX + camelCase(name) + " on "
                    + String.join(", ", products) + ": add the Capability constant, the tag and the products'"
                    + " capability by hand; SyncProductExamples must then say unchanged");
        }
        return proposals;
    }

    /** {@code trade_partial_termination} -> {@code partialTermination}. */
    private static String camelCase(String name) {
        String[] words = name.replaceFirst("^trade_", "").split("_");
        StringBuilder out = new StringBuilder(words[0]);
        for (int i = 1; i < words.length; i++) {
            if (words[i].isEmpty()) continue;
            out.append(Character.toUpperCase(words[i].charAt(0))).append(words[i].substring(1));
        }
        return out.toString();
    }

    /** The cases with their old requests; stop 3 and unreadable requests. */
    private static List<Item> items(LegacyData legacy, Source source, List<String> stops) {
        List<Item> items = new ArrayList<>();
        for (FeatureCases.FeatureCase c : source.cases()) {
            String product = CaseId.parse(c.caseId()).product();
            Optional<String> key;
            try {
                key = legacy.keyForCase(c.caseId());
            } catch (IllegalStateException e) {
                if (!stops.contains(e.getMessage())) stops.add(e.getMessage());
                continue;
            }
            if (key.isEmpty()) {
                items.add(new Item(c, product, Json.MAPPER.createObjectNode(), false));
                continue;
            }
            String text = legacy.forKey(key.get()).request();
            ObjectNode old = Json.MAPPER.createObjectNode();
            if (text != null && !text.isBlank()) {
                String problem = null;
                try {
                    JsonNode parsed = Json.parse(text);
                    if (parsed instanceof ObjectNode object) {
                        old = object;
                    } else {
                        problem = "is not a JSON object";
                    }
                } catch (IllegalStateException e) {
                    problem = "is not valid JSON: " + e.getMessage();
                }
                if (problem != null) {
                    stops.add(c.caseId() + ": the request of the old key " + key.get() + " ("
                            + legacy.fileOf(key.get()) + ") " + problem);
                    continue;
                }
            }
            items.add(new Item(c, product, request(old, source.dir()), true));
        }
        return items;
    }

    /** Spec 3.3: without {@code basic.productId}; in the UI channel the old portfolio replaced. */
    private static ObjectNode request(ObjectNode old, String dir) {
        ObjectNode request = old.deepCopy();
        if (request.get("basic") instanceof ObjectNode basic) {
            basic.remove("productId");
            if (dir.equals("ui") && OLD_UI_PORTFOLIO.equals(basic.path("portfolioId").textValue())) {
                basic.put("portfolioId", UI_PORTFOLIO);
            }
        }
        return request;
    }

    /** The channel: its event file, self-checked (stop 5), with its lists. */
    private static Channel channel(LegacyData legacy, String name, Source source, List<Item> items,
                                   List<String> stops) {
        List<String> portfolios = new ArrayList<>();
        items.forEach(item -> keptPortfolios(item.caseId(), item.request(), "", portfolios));
        List<String> orphans = orphans(legacy, name, source);
        List<String> caseLines = new ArrayList<>();

        if (source.dir().equals("ui") && items.stream().noneMatch(Item::hasData)) {
            items.forEach(item -> caseLines.add(item.caseId() + ": " + NO_DATA));
            return new Channel(source.dir(), source.featureFile(), null, Map.of(), caseLines, orphans, List.of(),
                    portfolios);
        }
        List<Layering.Case> cases = items.stream().map(item -> new Layering.Case(item.caseId(),
                item.featureCase().rowId(), item.product(), item.request(), item.hasData())).toList();
        ObjectNode eventFile = eventFile(source, items, Layering.layer(cases, PRODUCTS, false));
        stops.addAll(selfCheck(name, source.dir(), eventFile, items, caseLines));
        return new Channel(source.dir(), source.featureFile(), eventFile, Map.of(), caseLines, orphans, List.of(),
                portfolios);
    }

    /** Plan decision 6: every leaf whose key contains "portfolio" with a value other than the UI portfolio. */
    private static void keptPortfolios(String caseId, JsonNode node, String path, List<String> out) {
        if (node.isObject()) {
            for (Map.Entry<String, JsonNode> field : node.properties()) {
                String at = path.isEmpty() ? field.getKey() : path + "." + field.getKey();
                JsonNode value = field.getValue();
                if (value.isContainerNode()) {
                    keptPortfolios(caseId, value, at, out);
                } else if (field.getKey().toLowerCase(Locale.ROOT).contains("portfolio")
                        && !UI_PORTFOLIO.equals(value.textValue())) {
                    out.add(caseId + ": " + at + " = " + (value.isTextual() ? value.textValue() : Json.compact(value)));
                }
            }
        } else if (node.isArray()) {
            for (int i = 0; i < node.size(); i++) {
                keptPortfolios(caseId, node.get(i), path + "[" + i + "]", out);
            }
        }
    }

    /** Old keys whose case ID (after the last {@code .}) has this event and channel and matches no case. */
    private static List<String> orphans(LegacyData legacy, String name, Source source) {
        Set<String> ids = new LinkedHashSet<>();
        source.cases().forEach(c -> ids.add(c.caseId()));
        List<String> orphans = new ArrayList<>();
        for (String key : legacy.keys()) {
            String id = key.substring(key.lastIndexOf('.') + 1);
            CaseId caseId;
            try {
                caseId = CaseId.parse(id);
            } catch (IllegalArgumentException e) {
                continue;
            }
            if (caseId.eventFile().equals(name) && caseId.channelDir().equals(source.dir()) && !ids.contains(id)) {
                orphans.add(key + " (" + legacy.fileOf(key) + ")");
            }
        }
        return orphans;
    }

    /** The event file: parts in the loader's order, empty parts left out, rows in feature order. */
    private static ObjectNode eventFile(Source source, List<Item> items, Layering.Layers layers) {
        ObjectNode file = Json.MAPPER.createObjectNode();
        file.put(JsonLayers.COMMENT, source.featureFile());
        if (!layers.defaults().isEmpty()) {
            file.putObject("defaults").set("request", layers.defaults());
        }
        if (!layers.byProduct().isEmpty()) {
            ObjectNode byProduct = file.putObject("byProduct");
            layers.byProduct().forEach((product, patch) -> byProduct.putObject(product).set("request", patch));
        }
        ArrayNode rows = Json.MAPPER.createArrayNode();
        for (String rowId : items.stream().map(i -> i.featureCase().rowId()).distinct().toList()) {
            JsonNode row = layers.rows().get(rowId);
            Map<String, JsonNode> rest = layers.rowByProduct().getOrDefault(rowId, Map.of());
            if (row == null && rest.isEmpty()) continue;
            List<Item> mine = items.stream().filter(i -> i.featureCase().rowId().equals(rowId)).toList();
            String scenario = scenarioName(source.feature(), rowId);
            boolean nullsNoData = row != null && mine.stream().anyMatch(i -> !i.hasData());
            ObjectNode out = rows.addObject();
            out.put("id", rowId);
            out.put(JsonLayers.COMMENT, !nullsNoData ? scenario
                    : scenario.isEmpty() ? NO_DATA : scenario + "; " + NO_DATA);
            if (row != null) out.set("request", row);
            if (!rest.isEmpty()) {
                ObjectNode byProduct = out.putObject("byProduct");
                rest.forEach((product, patch) -> {
                    ObjectNode entry = byProduct.putObject(product);
                    if (mine.stream().anyMatch(i -> product.equals(i.product()) && !i.hasData())) {
                        entry.put(JsonLayers.COMMENT, NO_DATA);
                    }
                    entry.set("request", patch);
                });
            }
        }
        if (!rows.isEmpty()) file.set("cases", rows);
        return file;
    }

    /** The scenario line's text after {@code [<row ID>]}, trimmed. */
    private static String scenarioName(FeatureFile feature, String rowId) {
        for (FeatureFile.Block block : feature.blocks()) {
            if (!rowId.equals(block.rowId())) continue;
            String line = feature.lines().get(block.line());
            int at = line.indexOf("[" + rowId + "]");
            return at < 0 ? "" : line.substring(at + rowId.length() + 2).trim();
        }
        return "";
    }

    /**
     * Spec 3.8: the event file loaded by the real loader from a temporary folder; each case's request and rules
     * compared with the planned ones. Fills {@code caseLines}; returns the differences as stops.
     */
    private static List<String> selfCheck(String name, String dir, ObjectNode eventFile, List<Item> items,
                                          List<String> caseLines) {
        Path root = null;
        try {
            root = Files.createTempDirectory("legacy-migration");
            Path file = root.resolve("data").resolve(dir).resolve(name + ".json");
            Files.createDirectories(file.getParent());
            Files.writeString(file, Json.pretty(eventFile), StandardCharsets.UTF_8);
            return withClasspath(root, () -> {
                TestDataRepository repository = new TestDataRepository("data/");
                List<String> stops = new ArrayList<>();
                for (Item item : items) {
                    CaseData data;
                    try {
                        data = repository.forCase(item.caseId());
                    } catch (IllegalStateException e) {
                        stops.add("self-check: " + item.caseId() + ": " + e.getMessage());
                        break;
                    }
                    String layers = data.layers().isEmpty() ? "no layer" : String.join(", ", data.layers());
                    caseLines.add(item.caseId() + ": " + layers);
                    JsonNode request = Json.parse(data.request());
                    if (!request.equals(item.request())) {
                        stops.add("self-check: " + item.caseId() + " (" + layers + "): the request should be "
                                + Json.compact(item.request()) + ", the layers give " + data.request());
                    }
                    if (!data.dynamicFields().isEmpty()) {
                        stops.add("self-check: " + item.caseId() + " (" + layers + "): dynamicFields should be {},"
                                + " the layers give " + data.dynamicFields());
                    }
                }
                return stops;
            });
        } catch (IOException e) {
            throw new UncheckedIOException("[LegacyMigration] cannot write the self-check file", e);
        } finally {
            if (root != null) deleteTree(root);
        }
    }

    // ── Write ────────────────────────────────────────────────────────────────

    /** Writes the planned files; a stopped plan, or a target that exists, is an error and nothing is written. */
    static void write(Sources sources, Plan plan) {
        if (plan.stopped()) {
            throw new IllegalStateException("[LegacyMigration] " + plan.name() + " is stopped, nothing written: "
                    + plan.stops());
        }
        List<String> existing = plan.files().stream()
                .filter(f -> Files.exists(sources.resources().resolve(f))).toList();
        if (!existing.isEmpty()) {
            throw new IllegalStateException("[LegacyMigration] " + existing + " exist, nothing written");
        }
        for (Channel channel : plan.channels()) {
            if (channel.eventFile() == null) continue;
            Path file = sources.data().resolve(channel.dir()).resolve(plan.name() + ".json");
            try {
                Files.createDirectories(file.getParent());
                Files.writeString(file, Json.pretty(channel.eventFile()), StandardCharsets.UTF_8);
            } catch (IOException e) {
                throw new UncheckedIOException("[LegacyMigration] cannot write " + file, e);
            }
        }
    }

    /** The names of the feature files lacking their event file in a channel they are in, sorted. */
    static List<String> featureNames(Sources sources) {
        Set<String> names = new TreeSet<>();
        for (String dir : CHANNELS) {
            for (Path file : filesEndingWith(sources.features().resolve(dir), ".feature")) {
                String name = baseName(file);
                if (!Files.exists(sources.data().resolve(dir).resolve(name + ".json"))) names.add(name);
            }
        }
        return List.copyOf(names);
    }

    /** Runs {@code action} with a context class loader that sees only {@code root}; the previous one is restored. */
    static <T> T withClasspath(Path root, Supplier<T> action) {
        Thread thread = Thread.currentThread();
        ClassLoader previous = thread.getContextClassLoader();
        String uri = root.toAbsolutePath().toUri().toString();
        try (URLClassLoader loader = new URLClassLoader(
                new URL[]{URI.create(uri.endsWith("/") ? uri : uri + "/").toURL()}, null)) {
            thread.setContextClassLoader(loader);
            return action.get();
        } catch (IOException e) {
            throw new UncheckedIOException("[LegacyMigration] cannot use " + root + " as the classpath", e);
        } finally {
            thread.setContextClassLoader(previous);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** The leaves of each layer's request and rules, for the report. */
    private static String leafCounts(ObjectNode eventFile) {
        int byProduct = 0;
        for (JsonNode layer : eventFile.path("byProduct")) byProduct += leaves(layer);
        int rows = 0;
        int rowsByProduct = 0;
        for (JsonNode row : eventFile.path("cases")) {
            rows += leaves(row);
            for (JsonNode layer : row.path("byProduct")) rowsByProduct += leaves(layer);
        }
        return "defaults " + leaves(eventFile.path("defaults")) + ", byProduct " + byProduct + ", rows " + rows
                + ", rows' byProduct " + rowsByProduct;
    }

    private static int leaves(JsonNode layer) {
        return count(layer.get("request")) + count(layer.get("dynamicFields"));
    }

    private static int count(JsonNode node) {
        if (node == null) return 0;
        if (!(node instanceof ObjectNode object) || object.isEmpty()) return 1;
        int n = 0;
        for (JsonNode child : object) n += count(child);
        return n;
    }

    private static List<Path> filesEndingWith(Path dir, String suffix) {
        if (!Files.isDirectory(dir)) return List.of();
        try (Stream<Path> walk = Files.walk(dir)) {
            return walk.filter(p -> p.getFileName().toString().endsWith(suffix) && Files.isRegularFile(p))
                    .sorted().toList();
        } catch (IOException e) {
            throw new UncheckedIOException("[LegacyMigration] cannot list " + dir, e);
        }
    }

    private static String baseName(Path file) {
        String name = file.getFileName().toString();
        return name.substring(0, name.lastIndexOf('.'));
    }

    private static String slashes(Path path) {
        return path.toString().replace('\\', '/');
    }

    /** UTF-8, a malformed byte read as a replacement character. */
    private static String read(Path file) {
        try {
            return new String(Files.readAllBytes(file), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("[LegacyMigration] cannot read " + file, e);
        }
    }

    private static void deleteTree(Path root) {
        try (Stream<Path> walk = Files.walk(root)) {
            for (Path path : walk.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("[LegacyMigration] cannot delete " + root, e);
        }
    }
}
