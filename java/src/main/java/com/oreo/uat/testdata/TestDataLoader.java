package com.oreo.uat.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Resolves the test data of a case from layered JSON files, so a case needs an entry only when its data differs.
 *
 * <pre>
 * data/common.json              shared blocks:  { "shared": { "&lt;block&gt;": { "request": {...}, "response": {...} } } }
 * data/&lt;layer&gt;/&lt;feature&gt;.json   one per feature, found from the case ID:
 *                               TC-TRADE-CREATION-FX_FSB-UI-002 -> data/ui/trade_creation.json
 * </pre>
 *
 * A feature file:
 *
 * <pre>
 * {
 *   "use": ["trade-basic"],                       shared blocks every case of the feature starts from
 *   "productPath": "basic.productId",             where the case's product ID goes in the request (optional)
 *   "defaults": { "request": {...} },             the feature's own values
 *   "byProduct": { "FX_FSB": { "request": {...} } },
 *   "cases": {                                    only cases that differ; key = case ID without the product
 *     "TC-TRADE-CREATION-UI-002": { "use": ["step-in"], "request": {...}, "byProduct": {...} }
 *   }
 * }
 * </pre>
 *
 * Merge order, later wins, objects merged key by key: file {@code use} blocks, {@code defaults}, case {@code use}
 * blocks, case values, the product ID at {@code productPath}, file {@code byProduct}, case {@code byProduct}.
 * Keys starting with {@code _} at these levels are comments. A request is plain JSON, so a body copied from the
 * browser's Network tab pastes in as it is.
 *
 * <p>While migrating: a case whose feature has no JSON file is looked up in the old {@code data/**}{@code /*.yml}
 * files ({@code requestRef} template deep-merged with the entry's {@code request}).
 */
public final class TestDataLoader {

    private static final Pattern TC_TOKEN = Pattern.compile("\\[(TC-[^\\]]+)]");
    private static final Pattern TC_ID = Pattern.compile("^TC-(.+)-(UI|API)-(\\d+)$");
    private static final Set<String> FILE_KEYS = Set.of("use", "productPath", "defaults", "byProduct", "cases");
    private static final Set<String> CASE_KEYS = Set.of("use", "request", "response", "byProduct");
    private static final Set<String> BLOCK_KEYS = Set.of("request", "response");

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final ObjectMapper YAML = new ObjectMapper(new YAMLFactory());

    private static volatile TestDataLoader defaultLoader;

    private final Path root;
    private final Map<Path, JsonNode> files = new ConcurrentHashMap<>();
    private volatile Map<String, JsonNode> legacyEntries;

    public TestDataLoader(Path root) {
        this.root = root;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Static API, same as the E2E project's TestDataLoader

    /** The {@code TC-...} token of a scenario name ({@code [TC-...] title}), or null. */
    public static String tcKeyFromName(String scenarioName) {
        Matcher m = TC_TOKEN.matcher(scenarioName == null ? "" : scenarioName);
        return m.find() ? m.group(1) : null;
    }

    /** Test data of a case; {@link AssertionError} when neither a feature file nor an old YAML entry has it. */
    public static TestDataRecord getByTcId(String tcId) {
        return defaultLoader().resolve(tcId);
    }

    /** Data root: system property {@code oreo.testdata.dir}, otherwise {@code data/} on the classpath. */
    static TestDataLoader defaultLoader() {
        if (defaultLoader == null) {
            synchronized (TestDataLoader.class) {
                if (defaultLoader == null) {
                    defaultLoader = new TestDataLoader(defaultRoot());
                }
            }
        }
        return defaultLoader;
    }

    private static Path defaultRoot() {
        String dir = System.getProperty("oreo.testdata.dir");
        if (dir != null && !dir.isBlank()) {
            return Paths.get(dir);
        }
        URL url = Thread.currentThread().getContextClassLoader().getResource("data");
        if (url == null) {
            throw new IllegalStateException("No data/ folder on the classpath and oreo.testdata.dir is not set");
        }
        try {
            return Paths.get(url.toURI());
        } catch (URISyntaxException e) {
            throw new IllegalStateException("Cannot use the data folder " + url, e);
        }
    }

    // ------------------------------------------------------------------------------------------------------------

    public TestDataRecord resolve(String tcId) {
        CaseId id = CaseId.parse(tcId);
        Path file = root.resolve(id.layer).resolve(id.feature + ".json");
        if (Files.isRegularFile(file)) {
            return resolveLayered(id, file);
        }
        JsonNode legacy = legacyEntries().get(tcId);
        if (legacy != null) {
            return resolveLegacy(tcId, legacy);
        }
        throw new AssertionError("No test data for " + tcId + ": " + root.relativize(file)
            + " does not exist and no old YAML file under " + root + " has the key");
    }

    private TestDataRecord resolveLayered(CaseId id, Path file) {
        JsonNode feature = read(file);
        checkKeys(feature, FILE_KEYS, file.getFileName().toString());
        String where = root.relativize(file).toString();

        JsonNode record = JsonNodeFactory.instance.objectNode();
        record = applyUse(record, feature.get("use"), where);
        record = applyBlock(record, feature.get("defaults"), where + " defaults");

        JsonNode row = feature.path("cases").get(id.caseKey);
        if (row != null) {
            String rowWhere = where + " cases." + id.caseKey;
            checkKeys(row, CASE_KEYS, rowWhere);
            record = applyUse(record, row.get("use"), rowWhere);
            record = applyBlock(record, row, rowWhere);
        }

        if (id.product != null) {
            JsonNode productPath = feature.get("productPath");
            if (productPath != null) {
                record = JsonMerge.merge(record,
                    nested("request." + productPath.asText(), Products.productId(id.product)));
            }
            record = applyBlock(record, feature.path("byProduct").get(id.product), where + " byProduct." + id.product);
            if (row != null) {
                record = applyBlock(record, row.path("byProduct").get(id.product),
                    where + " cases." + id.caseKey + ".byProduct." + id.product);
            }
        }
        return new TestDataRecord(id.tcId, record.get("request"), record.get("response"));
    }

    private JsonNode applyUse(JsonNode record, JsonNode use, String where) {
        if (use == null) {
            return record;
        }
        JsonNode shared = read(root.resolve("common.json")).path("shared");
        for (JsonNode name : use) {
            JsonNode block = shared.get(name.asText());
            if (block == null) {
                throw new AssertionError(where + " uses '" + name.asText() + "', which common.json does not have");
            }
            record = applyBlock(record, block, "common.json shared." + name.asText());
        }
        return record;
    }

    private static JsonNode applyBlock(JsonNode record, JsonNode block, String where) {
        if (block == null) {
            return record;
        }
        ObjectNode values = JsonNodeFactory.instance.objectNode();
        Iterator<Map.Entry<String, JsonNode>> fields = block.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> e = fields.next();
            if (BLOCK_KEYS.contains(e.getKey())) {
                values.set(e.getKey(), e.getValue());
            } else if (!CASE_KEYS.contains(e.getKey()) && !e.getKey().startsWith("_")) {
                throw new AssertionError(where + ": unknown key '" + e.getKey() + "' (expected request / response)");
            }
        }
        return JsonMerge.merge(record, values);
    }

    private static void checkKeys(JsonNode node, Set<String> allowed, String where) {
        node.fieldNames().forEachRemaining(k -> {
            if (!allowed.contains(k) && !k.startsWith("_")) {
                throw new AssertionError(where + ": unknown key '" + k + "', expected one of " + allowed);
            }
        });
    }

    /** {@code a.b.c} = value as {@code {"a":{"b":{"c":value}}}}. */
    private static JsonNode nested(String path, String value) {
        String[] parts = path.split("\\.");
        JsonNode node = JsonNodeFactory.instance.textNode(value);
        for (int i = parts.length - 1; i >= 0; i--) {
            node = JsonNodeFactory.instance.objectNode().set(parts[i], node);
        }
        return node;
    }

    private JsonNode read(Path file) {
        return files.computeIfAbsent(file, f -> {
            try {
                return JSON.readTree(f.toFile());
            } catch (IOException e) {
                throw new UncheckedIOException("Cannot read test data " + f, e);
            }
        });
    }

    // ------------------------------------------------------------------------------------------------------------
    // Old format: data/**/*.yml, a template (REQ-TPL-...) and one entry per case with requestRef and a request text

    private TestDataRecord resolveLegacy(String tcId, JsonNode entry) {
        JsonNode request = parseText(entry.get("request"), tcId);
        JsonNode response = parseText(entry.get("response"), tcId);
        JsonNode ref = entry.get("requestRef");
        if (ref != null) {
            JsonNode template = legacyEntries().get(ref.asText());
            if (template == null) {
                throw new AssertionError(tcId + ": requestRef " + ref.asText() + " not found");
            }
            request = JsonMerge.merge(parseText(template.get("request"), ref.asText()), request);
        }
        return new TestDataRecord(tcId, request, response);
    }

    private static JsonNode parseText(JsonNode text, String key) {
        if (text == null || text.isNull() || text.asText().isBlank()) {
            return null;
        }
        try {
            return JSON.readTree(text.asText());
        } catch (IOException e) {
            throw new AssertionError(key + ": request / response is not valid JSON: " + e.getMessage(), e);
        }
    }

    private Map<String, JsonNode> legacyEntries() {
        if (legacyEntries == null) {
            Map<String, JsonNode> entries = new ConcurrentHashMap<>();
            if (Files.isDirectory(root)) {
                List<Path> yamlFiles;
                try (Stream<Path> walk = Files.walk(root)) {
                    yamlFiles = walk.filter(p -> p.toString().endsWith(".yml") || p.toString().endsWith(".yaml"))
                        .sorted().collect(Collectors.toList());
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
                for (Path p : yamlFiles) {
                    try {
                        YAML.readTree(p.toFile()).fields().forEachRemaining(e -> entries.put(e.getKey(), e.getValue()));
                    } catch (IOException e) {
                        throw new UncheckedIOException("Cannot read " + p, e);
                    }
                }
            }
            legacyEntries = entries;
        }
        return legacyEntries;
    }

    // ------------------------------------------------------------------------------------------------------------

    /**
     * {@code TC-TRADE-CREATION-FX_FSB-UI-002}: feature {@code trade_creation}, product {@code FX_FSB}, layer
     * {@code ui}, case key {@code TC-TRADE-CREATION-UI-002}. A product name has underscores, a feature only dashes;
     * an ID without a product ({@code TC-LOGIN-UI-001}) has no product.
     */
    static final class CaseId {
        final String tcId;
        final String feature;
        final String product;
        final String layer;
        final String caseKey;

        private CaseId(String tcId, String feature, String product, String layer, String caseKey) {
            this.tcId = tcId;
            this.feature = feature;
            this.product = product;
            this.layer = layer;
            this.caseKey = caseKey;
        }

        static CaseId parse(String tcId) {
            Matcher m = TC_ID.matcher(tcId == null ? "" : tcId);
            if (!m.matches()) {
                throw new AssertionError("Case ID '" + tcId + "' is not TC-<FEATURE>[-<PRODUCT>]-<UI|API>-<NNN>");
            }
            String middle = m.group(1);
            String product = null;
            int dash = middle.lastIndexOf('-');
            String last = middle.substring(dash + 1);
            if (dash > 0 && last.contains("_")) {
                product = last;
                middle = middle.substring(0, dash);
                Products.productId(product); // fails early for a product that is not registered
            }
            String layer = m.group(2);
            return new CaseId(tcId, middle.toLowerCase(Locale.ROOT).replace('-', '_'), product,
                layer.toLowerCase(Locale.ROOT), "TC-" + middle + "-" + layer + "-" + m.group(3));
        }
    }
}
