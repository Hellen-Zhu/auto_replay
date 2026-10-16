package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import java.io.InputStream;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;


public final class TestDataLoader {

    private static final Logger log = LoggerFactory.getLogger(TestDataLoader.class);

    private static final ObjectMapper YAML_MAPPER = new ObjectMapper(new YAMLFactory());
    private static final ObjectMapper JSON_MAPPER = new ObjectMapper();
    private static final String SCAN_PATTERN = "classpath:data/**/*.yml";

    /**
     * Lazily-initialized global store. Populated on first call to any public method.
     * Key = raw YAML key (e.g. "TC-ALLOC-UI-001" or "API-SETUP-TRADE_CREATE").
     */
    private static volatile Map<String, TestDataRecord> STORE;
    private static final Object INIT_LOCK = new Object();

    private TestDataLoader() {}

    // ── Primary API ──────────────────────────────────────────────────────────

    public static TestDataRecord forKey(String key) {
        ensureInitialized();
        TestDataRecord record = STORE.get(key);
        if (record == null) {
            throw new AssertionError(
                    "[TestDataLoader] No test data found for key '" + key + "'. "
                    + "Ensure the key exists in data/**/*.yml. "
                    + "Registered keys: " + STORE.keySet());
        }
        return record;
    }

    /**
     * Resolves a {@link TestDataRecord} by TC-ID, trying exact match first then suffix match.
     *
     * <p>Exact match handles bare TC-ID keys ({@code TC-ALLOC-UI-001}).
     * Suffix match provides backward-compatibility for any legacy module-prefixed keys.
     *
     * @param tcId the raw TC-ID, e.g. {@code "TC-TRADE-UI-001"}
     * @throws AssertionError if no matching key is found
     */
    public static TestDataRecord getByTcId(String tcId) {
        ensureInitialized();
        // 1. Exact match (UI bare keys)
        TestDataRecord exact = STORE.get(tcId);
        if (exact != null) {
            return exact;
        }
        // 2. Suffix match (API module-prefixed keys)
        String suffix = "." + tcId;
        for (Map.Entry<String, TestDataRecord> entry : STORE.entrySet()) {
            if (entry.getKey().endsWith(suffix)) {
                log.debug("[TestDataLoader] resolved TC-ID '{}' → key '{}'", tcId, entry.getKey());
                return entry.getValue();
            }
        }
        throw new AssertionError(
                "[TestDataLoader] No test data found for TC-ID '" + tcId + "'. "
                + "Ensure a key matching '" + tcId + "' (or ending with '." + tcId + "') "
                + "exists in data/**/*.yml. Registered keys: " + STORE.keySet());
    }

    // ── TC-ID resolution helpers ─────────────────────────────────────────────

    private static final Pattern TC_NAME_PATTERN = Pattern.compile("\\[([^\\]]+)\\]");

    /**
     * Extracts a TC-ID from the scenario name bracket, e.g. "[TC-REASON-MANAGEMENT-API-001]"
     * → "TC-REASON-MANAGEMENT-API-001". Returns null if no matching bracket token is found.
     */
    public static String tcKeyFromName(String scenarioName) {
        if (scenarioName == null) return null;
        Matcher m = TC_NAME_PATTERN.matcher(scenarioName);
        while (m.find()) {
            String candidate = m.group(1);
            if (candidate.startsWith("TC-")) return candidate;
        }
        return null;
    }

    // ── Initialization ───────────────────────────────────────────────────────

    private static void ensureInitialized() {
        if (STORE != null) return;
        synchronized (INIT_LOCK) {
            if (STORE != null) return;
            STORE = loadAll();
        }
    }

    private static Map<String, TestDataRecord> loadAll() {
        Map<String, JsonNode> rawEntries = new LinkedHashMap<>();
        try {
            PathMatchingResourcePatternResolver resolver =
                    new PathMatchingResourcePatternResolver();
            Resource[] resources = resolver.getResources(SCAN_PATTERN);
            log.info("[TestDataLoader] Scanning {} YAML file(s) from '{}'",
                    resources.length, SCAN_PATTERN);
            for (Resource resource : resources) {
                loadFile(resource, rawEntries);
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException(
                    "[TestDataLoader] Failed to scan test data files: " + e.getMessage(), e);
        }

        Map<String, TestDataRecord> resolvedEntries = new ConcurrentHashMap<>();
        for (String key : rawEntries.keySet()) {
            resolveRecord(key, rawEntries, resolvedEntries, new LinkedHashSet<>());
        }

        log.info("[TestDataLoader] Loaded {} test-data record(s).", resolvedEntries.size());
        return resolvedEntries;
    }

    private static void loadFile(Resource resource,
                                 Map<String, JsonNode> target) throws Exception {
        String filename = resource.getFilename();
        log.debug("[TestDataLoader] Loading '{}'", filename);

        JsonNode root;
        try (InputStream is = resource.getInputStream()) {
            root = YAML_MAPPER.readTree(is);
        }

        if (root == null || root.isMissingNode() || root.isNull()) {
            log.warn("[TestDataLoader] '{}' is empty — skipping.", filename);
            return;
        }

        Iterator<Map.Entry<String, JsonNode>> entries = root.fields();
        while (entries.hasNext()) {
            Map.Entry<String, JsonNode> entry = entries.next();
            String   key  = entry.getKey();
            JsonNode node = entry.getValue();

            if (target.containsKey(key)) {
                throw new IllegalStateException(
                        "[TestDataLoader] Duplicate key '" + key + "' found in '"
                        + filename + "'. Each TC key must be unique across all data/**/*.yml files.");
            }

            validateNodeFormats(key, node, filename);

            target.put(key, node);
            log.debug("[TestDataLoader]   + raw '{}'", key);
        }
    }

    private static TestDataRecord resolveRecord(String key,
                                                Map<String, JsonNode> rawEntries,
                                                Map<String, TestDataRecord> resolvedEntries,
                                                Set<String> resolving) {
        TestDataRecord cached = resolvedEntries.get(key);
        if (cached != null) {
            return cached;
        }

        if (!resolving.add(key)) {
            StringBuilder chain = new StringBuilder();
            for (String item : resolving) {
                if (chain.length() > 0) {
                    chain.append(" -> ");
                }
                chain.append(item);
            }
            chain.append(" -> ").append(key);
            throw new IllegalStateException(
                    "[TestDataLoader] Circular test-data reference detected: " + chain);
        }

        try {
            JsonNode node = rawEntries.get(key);
            if (node == null) {
                throw new IllegalStateException(
                        "[TestDataLoader] No YAML entry found for key '" + key + "'.");
            }

            String baseRequest = null;
            String baseResponse = null;

            String requestRef = textOrNull(node, "requestRef");
            if (requestRef != null) {
                TestDataRecord referenced = resolveReferencedRecord(
                        key, "requestRef", requestRef, rawEntries, resolvedEntries, resolving);
                if (!referenced.hasRequest()) {
                    throw new IllegalStateException(
                            "[TestDataLoader] YAML entry '" + key
                            + "' references requestRef '" + requestRef
                            + "' but the referenced record has no resolved request.");
                }
                baseRequest = referenced.request();
            }

            String responseRef = textOrNull(node, "responseRef");
            if (responseRef != null) {
                TestDataRecord referenced = resolveReferencedRecord(
                        key, "responseRef", responseRef, rawEntries, resolvedEntries, resolving);
                if (!referenced.hasResponse()) {
                    throw new IllegalStateException(
                            "[TestDataLoader] YAML entry '" + key
                            + "' references responseRef '" + responseRef
                            + "' but the referenced record has no resolved response.");
                }
                baseResponse = referenced.response();
            }

            String localRequest = textOrNull(node, "request");
            String localResponse = textOrNull(node, "response");

            // With requestRef/responseRef, local request/response JSON acts as a patch
            // over the inherited JSON. Object nodes are deep-merged; arrays and scalar values
            // replace the inherited value.
            String finalRequest = mergeJsonField(baseRequest, localRequest, key, "request");
            String finalResponse = mergeJsonField(baseResponse, localResponse, key, "response");

            TestDataRecord result = TestDataRecord.of(finalRequest, finalResponse);
            resolvedEntries.put(key, result);

            log.debug("[TestDataLoader] resolved '{}' (requestRef={}, responseRef={}, request={}, response={})",
                    key, requestRef, responseRef, finalRequest != null, finalResponse != null);
            return result;
        } finally {
            resolving.remove(key);
        }
    }

    /**
     * Guards against the silent-failure trap where {@code request: {}} or {@code response: {}}
     * <p>Both fields are optional — omit them entirely when not needed. This check only fires
     * when a field IS present but has the wrong format.
     */
    private static void validateNodeFormats(String key, JsonNode node, String filename) {
        for (String field : new String[]{"requestRef", "responseRef"}) {
            JsonNode refNode = node.get(field);
            if (refNode != null && !refNode.isNull()) {
                String ref = refNode.asText("").trim();
                if (!refNode.isTextual() || ref.isEmpty()) {
                    throw new IllegalStateException(
                            "[TestDataLoader] YAML entry '" + key + "' in '" + filename
                            + "': '" + field + "' must be a non-empty string.");
                }
            }
        }

        for (String field : new String[]{"request", "response"}) {
            JsonNode child = node.get(field);
            if (child != null && child.isObject()) {
                throw new IllegalStateException(
                        "[TestDataLoader] YAML entry '" + key + "' in '" + filename
                        + "': '" + field + ": {}' is a YAML mapping — use a literal block scalar instead:\n"
                        + "  " + field + ": |\n"
                        + "    {}");
            }
        }
    }

    private static TestDataRecord resolveReferencedRecord(String key,
                                                          String refField,
                                                          String refKey,
                                                          Map<String, JsonNode> rawEntries,
                                                          Map<String, TestDataRecord> resolvedEntries,
                                                          Set<String> resolving) {
        if (!rawEntries.containsKey(refKey)) {
            throw new IllegalStateException(
                    "[TestDataLoader] YAML entry '" + key
                    + "' references missing " + refField + " '" + refKey + "'. "
                    + "Registered keys: " + rawEntries.keySet());
        }

        return resolveRecord(refKey, rawEntries, resolvedEntries, resolving);
    }

    private static String mergeJsonField(String baseJson,
                                         String localJson,
                                         String key,
                                         String fieldName) {
        if (baseJson == null) {
            return localJson;
        }
        if (localJson == null) {
            return baseJson;
        }

        try {
            JsonNode merged = mergeNodes(
                    JSON_MAPPER.readTree(baseJson),
                    JSON_MAPPER.readTree(localJson));
            return JSON_MAPPER.writeValueAsString(merged);
        } catch (Exception e) {
            throw new IllegalStateException(
                    "[TestDataLoader] Failed to merge '" + fieldName + "' for key '"
                    + key + "': " + e.getMessage(), e);
        }
    }

    private static JsonNode mergeNodes(JsonNode baseNode, JsonNode patchNode) {
        if (patchNode == null || patchNode.isNull() || patchNode.isMissingNode()) {
            return baseNode;
        }
        if (patchNode.isObject()) {
            ObjectNode merged = (baseNode != null && baseNode.isObject())
                    ? (ObjectNode) baseNode.deepCopy()
                    : JSON_MAPPER.createObjectNode();
            Iterator<Map.Entry<String, JsonNode>> fields = patchNode.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                JsonNode baseChild = merged.get(field.getKey());
                merged.set(field.getKey(), mergeNodes(baseChild, field.getValue()));
            }
            return merged;
        }
        return patchNode;
    }

    private static String textOrNull(JsonNode parent, String fieldName) {
        JsonNode field = parent.get(fieldName);
        if (field == null || field.isNull() || field.isMissingNode()) return null;
        String text = field.asText("").trim();
        return text.isEmpty() ? null : text;
    }

}
