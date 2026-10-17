package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The old YAML test data loader ({@code TestDataLoader} and {@code TestDataRecord} before commit {@code 0be22bc}),
 * back in test scope for the migration of the remaining events (spec
 * {@code 2026-10-17-oreo-e2e-legacy-data-migration-design.md}); removed with the YAML files at its end.
 *
 * <p>Resolution, validation and messages are the old ones: keys are global across the files, a duplicate is an error,
 * {@code requestRef} / {@code responseRef} name another key whose request / response the local one patches (objects
 * merge, arrays and scalars replace). Changed: an instance with its own scan pattern (for the fixture), files read in
 * URL order, and JSON read and written with {@link Json#MAPPER}, so a merged entry keeps its digits.
 */
final class LegacyData {

    /** The old loader's pattern: the YAML files next to the JSON test data. */
    static final String STANDARD = "classpath:data/**/*.yml";
    /** Real old data from this repository's history (creation, early termination, risk mocks, user preferences). */
    static final String FIXTURE = "classpath:testdata-fixtures/legacy/data/**/*.yml";

    private static final Logger log = LoggerFactory.getLogger(LegacyData.class);

    private static final ObjectMapper YAML_MAPPER = new ObjectMapper(new YAMLFactory());
    private static final ObjectMapper JSON_MAPPER = Json.MAPPER;

    /** The resolved data of one key: request and response as JSON text, or {@code null}. */
    record Record(String request, String response) {
        boolean hasRequest()  { return request  != null && !request.isBlank();  }
        boolean hasResponse() { return response != null && !response.isBlank(); }
    }

    private record Store(Map<String, Record> records, List<String> keys, Map<String, String> files) {}

    private final String scanPattern;
    private Store store;

    LegacyData(String scanPattern) {
        this.scanPattern = scanPattern;
    }

    static LegacyData standard() {
        return new LegacyData(STANDARD);
    }

    /** The YAML files under a folder (tests). */
    static LegacyData in(Path dataDir) {
        String root = dataDir.toAbsolutePath().normalize().toUri().toString();
        return new LegacyData((root.endsWith("/") ? root : root + "/") + "**/*.yml");
    }

    /** {@code true} when no YAML file matches; the files are not read. */
    boolean isEmpty() {
        return resources().length == 0;
    }

    /** Every key, files in URL order, keys in file order. */
    List<String> keys() {
        return store().keys();
    }

    /** The file of a key below the pattern's root folder, e.g. {@code ui/user_preference_config.yml}; null if unknown. */
    String fileOf(String key) {
        return store().files().get(key);
    }

    Record forKey(String key) {
        Record record = store().records().get(key);
        if (record == null) {
            throw new AssertionError(
                    "[LegacyData] No test data found for key '" + key + "'. "
                    + "Ensure the key exists in " + scanPattern + ". "
                    + "Registered keys: " + store().keys());
        }
        return record;
    }

    /**
     * The key the old hook used for a case: the case ID itself, else the key ending with {@code .<case ID>}. The old
     * hook took any one of several such keys; here two or more are an error.
     */
    Optional<String> keyForCase(String caseId) {
        Store s = store();
        if (s.records().containsKey(caseId)) {
            return Optional.of(caseId);
        }
        String suffix = "." + caseId;
        List<String> matches = s.keys().stream().filter(k -> k.endsWith(suffix)).toList();
        if (matches.size() > 1) {
            throw new IllegalStateException("[LegacyData] the keys " + matches + " all end with '" + suffix
                    + "': the old hook took any one of them; keep one");
        }
        return matches.stream().findFirst();
    }

    // ── Loading ──────────────────────────────────────────────────────────────

    private synchronized Store store() {
        if (store == null) {
            store = loadAll();
        }
        return store;
    }

    private Resource[] resources() {
        try {
            Resource[] found = new PathMatchingResourcePatternResolver().getResources(scanPattern);
            Arrays.sort(found, Comparator.comparing(LegacyData::url));
            return found;
        } catch (FileNotFoundException e) {
            return new Resource[0];
        } catch (IOException e) {
            throw new IllegalStateException(
                    "[LegacyData] Failed to scan test data files: " + e.getMessage(), e);
        }
    }

    private Store loadAll() {
        Map<String, JsonNode> rawEntries = new LinkedHashMap<>();
        Map<String, String> files = new HashMap<>();
        try {
            Resource[] resources = resources();
            log.info("[LegacyData] Scanning {} YAML file(s) from '{}'", resources.length, scanPattern);
            for (Resource resource : resources) {
                loadFile(resource, rawEntries, files);
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException(
                    "[LegacyData] Failed to scan test data files: " + e.getMessage(), e);
        }

        Map<String, Record> resolvedEntries = new HashMap<>();
        for (String key : rawEntries.keySet()) {
            resolveRecord(key, rawEntries, resolvedEntries, new LinkedHashSet<>());
        }

        log.info("[LegacyData] Loaded {} test-data record(s).", resolvedEntries.size());
        return new Store(resolvedEntries, Collections.unmodifiableList(new ArrayList<>(rawEntries.keySet())), files);
    }

    private void loadFile(Resource resource, Map<String, JsonNode> target, Map<String, String> files)
            throws Exception {
        String filename = relativePath(resource);
        log.debug("[LegacyData] Loading '{}'", filename);

        JsonNode root;
        try (InputStream is = resource.getInputStream()) {
            root = YAML_MAPPER.readTree(is);
        }

        if (root == null || root.isMissingNode() || root.isNull()) {
            log.warn("[LegacyData] '{}' is empty — skipping.", filename);
            return;
        }

        for (Map.Entry<String, JsonNode> entry : root.properties()) {
            String   key  = entry.getKey();
            JsonNode node = entry.getValue();

            if (target.containsKey(key)) {
                throw new IllegalStateException(
                        "[LegacyData] Duplicate key '" + key + "' found in '"
                        + filename + "'. Each TC key must be unique across all " + scanPattern + " files.");
            }

            validateNodeFormats(key, node, filename);

            target.put(key, node);
            files.put(key, filename);
            log.debug("[LegacyData]   + raw '{}'", key);
        }
    }

    /** The resource's path below the pattern's root folder (the part before the first {@code *}). */
    private String relativePath(Resource resource) {
        String url = url(resource);
        String root = scanPattern.substring(0, scanPattern.indexOf('*'));
        String rootPath = root.startsWith("classpath:")
                ? "/" + root.substring("classpath:".length()).replaceFirst("^/+", "")
                : URI.create(root).getRawPath();
        int at = url.lastIndexOf(rootPath);
        return at < 0 ? resource.getFilename() : url.substring(at + rootPath.length());
    }

    private static String url(Resource resource) {
        try {
            return resource.getURL().toString();
        } catch (IOException e) {
            throw new IllegalStateException("[LegacyData] cannot locate " + resource + ": " + e.getMessage(), e);
        }
    }

    private static Record resolveRecord(String key,
                                        Map<String, JsonNode> rawEntries,
                                        Map<String, Record> resolvedEntries,
                                        Set<String> resolving) {
        Record cached = resolvedEntries.get(key);
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
                    "[LegacyData] Circular test-data reference detected: " + chain);
        }

        try {
            JsonNode node = rawEntries.get(key);
            if (node == null) {
                throw new IllegalStateException(
                        "[LegacyData] No YAML entry found for key '" + key + "'.");
            }

            String baseRequest = null;
            String baseResponse = null;

            String requestRef = textOrNull(node, "requestRef");
            if (requestRef != null) {
                Record referenced = resolveReferencedRecord(
                        key, "requestRef", requestRef, rawEntries, resolvedEntries, resolving);
                if (!referenced.hasRequest()) {
                    throw new IllegalStateException(
                            "[LegacyData] YAML entry '" + key
                            + "' references requestRef '" + requestRef
                            + "' but the referenced record has no resolved request.");
                }
                baseRequest = referenced.request();
            }

            String responseRef = textOrNull(node, "responseRef");
            if (responseRef != null) {
                Record referenced = resolveReferencedRecord(
                        key, "responseRef", responseRef, rawEntries, resolvedEntries, resolving);
                if (!referenced.hasResponse()) {
                    throw new IllegalStateException(
                            "[LegacyData] YAML entry '" + key
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

            Record result = new Record(finalRequest, finalResponse);
            resolvedEntries.put(key, result);

            log.debug("[LegacyData] resolved '{}' (requestRef={}, responseRef={}, request={}, response={})",
                    key, requestRef, responseRef, finalRequest != null, finalResponse != null);
            return result;
        } finally {
            resolving.remove(key);
        }
    }

    /**
     * Guards against the silent-failure trap where {@code request: {}} or {@code response: {}}
     * is a YAML mapping instead of a JSON text block.
     */
    private static void validateNodeFormats(String key, JsonNode node, String filename) {
        for (String field : new String[]{"requestRef", "responseRef"}) {
            JsonNode refNode = node.get(field);
            if (refNode != null && !refNode.isNull()) {
                String ref = refNode.asText("").trim();
                if (!refNode.isTextual() || ref.isEmpty()) {
                    throw new IllegalStateException(
                            "[LegacyData] YAML entry '" + key + "' in '" + filename
                            + "': '" + field + "' must be a non-empty string.");
                }
            }
        }

        for (String field : new String[]{"request", "response"}) {
            JsonNode child = node.get(field);
            if (child != null && child.isObject()) {
                throw new IllegalStateException(
                        "[LegacyData] YAML entry '" + key + "' in '" + filename
                        + "': '" + field + ": {}' is a YAML mapping — use a literal block scalar instead:\n"
                        + "  " + field + ": |\n"
                        + "    {}");
            }
        }
    }

    private static Record resolveReferencedRecord(String key,
                                                  String refField,
                                                  String refKey,
                                                  Map<String, JsonNode> rawEntries,
                                                  Map<String, Record> resolvedEntries,
                                                  Set<String> resolving) {
        if (!rawEntries.containsKey(refKey)) {
            throw new IllegalStateException(
                    "[LegacyData] YAML entry '" + key
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
                    "[LegacyData] Failed to merge '" + fieldName + "' for key '"
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
            for (Map.Entry<String, JsonNode> field : patchNode.properties()) {
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
