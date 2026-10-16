package com.example.module.oreo.testdata;

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
 * Resolves test data from layered JSON files, so a case needs an entry only when its data differs. Two kinds of
 * data: a case's own data ({@link #getByTcId}, injected by the hook) and named setup data that a step sends to the
 * API to create what the case needs ({@link #forKey}, e.g. {@code API-SETUP-TRADE-CREATE}).
 *
 * <pre>
 * data/common.json
 *   "shared": { "&lt;block&gt;": { "request": {...}, "response": {...} } }       blocks a feature or setup entry uses
 *   "setup":  { "&lt;KEY&gt;": { "use", "productPath", "request", "byProduct" } }  data for API setup steps
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
 *   "setup": { "API-SETUP-TRADE-CREATE": { "request": {...}, "byProduct": {...} } },   this feature's setup changes
 *   "cases": {                                    only cases that differ; key = case ID without the product
 *     "TC-TRADE-CREATION-UI-002": { "use": ["step-in"], "request": {...}, "byProduct": {...}, "setup": {...} }
 *   }
 * }
 * </pre>
 *
 * Case data, later wins, objects merged key by key: file {@code use} blocks, {@code defaults}, case {@code use}
 * blocks, case values, the product ID at {@code productPath}, file {@code byProduct}, case {@code byProduct}.
 *
 * <p>Setup data: the entry's {@code use} blocks, its values, the product ID at its {@code productPath}, its
 * {@code byProduct}; then, while a scenario runs (the hook calls {@link #setCurrentCase}), the {@code setup.<KEY>} of
 * the scenario's feature file and of its case entry, each with its own {@code byProduct}. So a case that needs its
 * setup trade a little different says so in its own data, not in a new setup key.
 *
 * <p>Keys starting with {@code _} are comments; any other unknown key fails. A request is plain JSON, so a body
 * copied from the browser's Network tab pastes in as it is.
 *
 * <p>While migrating: a case whose feature has no JSON file, and a setup key that common.json does not have, are
 * looked up in the old {@code data/**}{@code /*.yml} files ({@code requestRef} template deep-merged with the entry's
 * {@code request}), exactly as before.
 */
public final class TestDataLoader {

    private static final Pattern TC_TOKEN = Pattern.compile("\\[(TC-[^\\]]+)]");
    private static final Pattern TC_ID = Pattern.compile("^TC-(.+)-(UI|API)-(\\d+)$");

    private static final Set<String> FILE_KEYS = Set.of("use", "productPath", "defaults", "byProduct", "setup", "cases");
    private static final Set<String> CASE_KEYS = Set.of("use", "request", "response", "byProduct", "setup");
    private static final Set<String> SETUP_KEYS = Set.of("use", "productPath", "request", "response", "byProduct");
    private static final Set<String> SETUP_CHANGE_KEYS = Set.of("request", "response", "byProduct");
    private static final Set<String> BLOCK_KEYS = Set.of("request", "response");

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final ObjectMapper YAML = new ObjectMapper(new YAMLFactory());

    private static volatile TestDataLoader defaultLoader;
    private static final ThreadLocal<String> CURRENT_CASE = new ThreadLocal<>();

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

    /**
     * Setup data by its key ({@code API-SETUP-TRADE-CREATE}), for a step that creates data through the API. The
     * product is the running case's (from its ID), if it has one.
     */
    public static TestDataRecord forKey(String key) {
        return defaultLoader().resolveKey(key, null, CURRENT_CASE.get());
    }

    /** Setup data for a product the step was given ({@code a live 'FX_FSB' trade is provisioned via playwright api}). */
    public static TestDataRecord forKey(String key, String product) {
        return defaultLoader().resolveKey(key, product, CURRENT_CASE.get());
    }

    /** Called by the hook before a scenario: {@link #forKey} then applies that case's setup changes. */
    public static void setCurrentCase(String tcId) {
        CURRENT_CASE.set(tcId);
    }

    /** Called by the hook after a scenario. */
    public static void clearCurrentCase() {
        CURRENT_CASE.remove();
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
    // Case data

    public TestDataRecord resolve(String tcId) {
        CaseId id = CaseId.parse(tcId);
        Path file = featureFile(id);
        if (Files.isRegularFile(file)) {
            return resolveCase(id, file);
        }
        JsonNode legacy = legacyEntries().get(tcId);
        if (legacy != null) {
            return resolveLegacy(tcId, legacy);
        }
        throw new AssertionError("No test data for " + tcId + ": " + root.relativize(file)
            + " does not exist and no old YAML file under " + root + " has the key");
    }

    private TestDataRecord resolveCase(CaseId id, Path file) {
        String where = root.relativize(file).toString();
        JsonNode feature = readChecked(file, FILE_KEYS, where);
        JsonNode row = caseRow(feature, id, where);
        String rowWhere = where + " cases." + id.caseKey;

        JsonNode record = JsonNodeFactory.instance.objectNode();
        record = applyUse(record, feature.get("use"), where);
        record = applyBlock(record, feature.get("defaults"), where + " defaults");
        if (row != null) {
            record = applyUse(record, row.get("use"), rowWhere);
            record = applyBlock(record, row, rowWhere);
        }
        if (id.product != null) {
            record = applyProductId(record, feature.get("productPath"), id.product);
            record = applyByProduct(record, feature, id.product, where);
            if (row != null) {
                record = applyByProduct(record, row, id.product, rowWhere);
            }
        }
        return new TestDataRecord(id.tcId, record.get("request"), record.get("response"));
    }

    // ------------------------------------------------------------------------------------------------------------
    // Setup data (forKey)

    /**
     * Setup data {@code key} for {@code product} (null: the product of {@code tcId}, if any), with the setup changes
     * of the case {@code tcId} (null: none).
     */
    public TestDataRecord resolveKey(String key, String product, String tcId) {
        CaseId id = tcId == null ? null : CaseId.parse(tcId);
        String forProduct = product != null ? product : id == null ? null : id.product;

        JsonNode entry = commonJson().path("setup").get(key);
        if (entry == null) {
            JsonNode legacy = legacyEntries().get(key);
            if (legacy != null) {
                return resolveLegacy(key, legacy);
            }
            throw new AssertionError("No setup data '" + key + "': common.json has no setup." + key
                + " and no old YAML file under " + root + " has the key");
        }

        String where = "common.json setup." + key;
        checkKeys(entry, SETUP_KEYS, where);
        JsonNode record = JsonNodeFactory.instance.objectNode();
        record = applyUse(record, entry.get("use"), where);
        record = applyBlock(record, entry, where);
        if (forProduct != null) {
            record = applyProductId(record, entry.get("productPath"), forProduct);
            record = applyByProduct(record, entry, forProduct, where);
        }

        // The running case's changes: its feature file's setup.<key>, then its case entry's
        if (id != null && Files.isRegularFile(featureFile(id))) {
            String fileWhere = root.relativize(featureFile(id)).toString();
            JsonNode feature = readChecked(featureFile(id), FILE_KEYS, fileWhere);
            record = applySetupChange(record, feature.path("setup").get(key), forProduct, fileWhere + " setup." + key);
            JsonNode row = caseRow(feature, id, fileWhere);
            if (row != null) {
                record = applySetupChange(record, row.path("setup").get(key), forProduct,
                    fileWhere + " cases." + id.caseKey + ".setup." + key);
            }
        }
        return new TestDataRecord(key, record.get("request"), record.get("response"));
    }

    private JsonNode applySetupChange(JsonNode record, JsonNode change, String product, String where) {
        if (change == null) {
            return record;
        }
        checkKeys(change, SETUP_CHANGE_KEYS, where);
        record = applyBlock(record, change, where);
        return product == null ? record : applyByProduct(record, change, product, where);
    }

    // ------------------------------------------------------------------------------------------------------------
    // Merge steps

    private JsonNode applyUse(JsonNode record, JsonNode use, String where) {
        if (use == null) {
            return record;
        }
        JsonNode shared = commonJson().path("shared");
        for (JsonNode name : use) {
            JsonNode block = shared.get(name.asText());
            if (block == null) {
                throw new AssertionError(where + " uses '" + name.asText() + "', which common.json does not have");
            }
            String blockWhere = "common.json shared." + name.asText();
            checkKeys(block, BLOCK_KEYS, blockWhere);
            record = applyBlock(record, block, blockWhere);
        }
        return record;
    }

    /** Merges the {@code request} and {@code response} of {@code block}; its other keys are structure, not data. */
    private static JsonNode applyBlock(JsonNode record, JsonNode block, String where) {
        if (block == null) {
            return record;
        }
        ObjectNode values = JsonNodeFactory.instance.objectNode();
        for (String k : BLOCK_KEYS) {
            if (block.has(k)) {
                values.set(k, block.get(k));
            }
        }
        return merge(record, values);
    }

    private static JsonNode applyProductId(JsonNode record, JsonNode productPath, String product) {
        if (productPath == null) {
            return record;
        }
        return merge(record, nested("request." + productPath.asText(), Products.productId(product)));
    }

    private static JsonNode applyByProduct(JsonNode record, JsonNode owner, String product, String where) {
        JsonNode block = owner.path("byProduct").get(product);
        if (block == null) {
            return record;
        }
        String blockWhere = where + " byProduct." + product;
        checkKeys(block, BLOCK_KEYS, blockWhere);
        return applyBlock(record, block, blockWhere);
    }

    private static JsonNode caseRow(JsonNode feature, CaseId id, String where) {
        JsonNode row = feature.path("cases").get(id.caseKey);
        if (row != null) {
            checkKeys(row, CASE_KEYS, where + " cases." + id.caseKey);
        }
        return row;
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

    // ------------------------------------------------------------------------------------------------------------
    // Files

    private Path featureFile(CaseId id) {
        return root.resolve(id.layer).resolve(id.feature + ".json");
    }

    private JsonNode commonJson() {
        Path file = root.resolve("common.json");
        return Files.isRegularFile(file) ? read(file) : JsonNodeFactory.instance.objectNode();
    }

    private JsonNode readChecked(Path file, Set<String> allowed, String where) {
        JsonNode node = read(file);
        checkKeys(node, allowed, where);
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
    // Old format: data/**/*.yml, a template (REQ-TPL-...) and an entry per case or setup key with requestRef and a
    // request given as JSON text or as YAML

    private TestDataRecord resolveLegacy(String key, JsonNode entry) {
        JsonNode request = legacyJson(entry.get("request"), key);
        JsonNode response = legacyJson(entry.get("response"), key);
        JsonNode ref = entry.get("requestRef");
        if (ref != null) {
            JsonNode template = legacyEntries().get(ref.asText());
            if (template == null) {
                throw new AssertionError(key + ": requestRef " + ref.asText() + " not found");
            }
            request = merge(legacyJson(template.get("request"), ref.asText()), request);
        }
        return new TestDataRecord(key, request, response);
    }

    private static JsonNode legacyJson(JsonNode value, String key) {
        if (value == null || value.isNull()) {
            return null;
        }
        if (!value.isTextual()) {
            return value; // written as YAML / inline JSON instead of a | block
        }
        if (value.asText().isBlank()) {
            return null;
        }
        try {
            return JSON.readTree(value.asText());
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

    /** Deep merge: objects merge key by key, anything else (arrays included) is replaced; neither argument changes. */
    static JsonNode merge(JsonNode base, JsonNode override) {
        if (override == null || override.isMissingNode()) {
            return base == null ? null : base.deepCopy();
        }
        if (base == null || !base.isObject() || !override.isObject()) {
            return override.deepCopy();
        }
        ObjectNode result = ((ObjectNode) base).deepCopy();
        Iterator<Map.Entry<String, JsonNode>> fields = override.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> e = fields.next();
            result.set(e.getKey(), merge(result.get(e.getKey()), e.getValue()));
        }
        return result;
    }
}
