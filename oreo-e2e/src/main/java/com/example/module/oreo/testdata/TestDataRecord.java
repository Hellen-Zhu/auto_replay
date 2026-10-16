package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

public final class TestDataRecord {

    private static final ObjectMapper JSON_MAPPER = new ObjectMapper();

    private final String request;
    private final String response;

    private TestDataRecord(String request, String response) {
        this.request  = request;
        this.response = response;
    }

    /**
     * Creates a new {@code TestDataRecord}.
     *
     * @param request  raw JSON string from the {@code request:} node, or {@code null}
     * @param response raw JSON string from the {@code response:} node, or {@code null}
     */
    public static TestDataRecord of(String request, String response) {
        return new TestDataRecord(request, response);
    }

    // ── Accessors ────────────────────────────────────────────────────────────

    /** Raw JSON string of the request body, or {@code null} if not configured. */
    public String request()  { return request;  }

    /** Raw JSON string of the expected response snapshot, or {@code null} if not configured. */
    public String response() { return response; }

    // ── Convenience guards ───────────────────────────────────────────────────

    /** {@code true} if a {@code request:} node was present in YAML. */
    public boolean hasRequest()  { return request  != null && !request.isBlank();  }

    /** {@code true} if a {@code response:} node was present in YAML. */
    public boolean hasResponse() { return response != null && !response.isBlank(); }

    /**
     * Flattens the {@code request:} JSON into a map of dot-path keys to string leaf values.
     * Array elements use bracket notation: {@code "subTrades[0].portfolioId"}.
     *
     * <p>Called by {@code ScenarioLifecycleHooks} at scenario start to bulk-inject
     * all test data fields into the scenario context. An empty object {@code {}} or
     * a missing {@code request:} node returns an empty map — nothing is stored.
     *
     * @return immutable map of dot-path → string value; empty if request is absent or {@code {}}
     */
    public Map<String, String> flattenRequest() {
        if (!hasRequest()) {
            return Collections.emptyMap();
        }
        try {
            JsonNode root = JSON_MAPPER.readTree(request);
            if (root == null || root.isMissingNode() || root.isNull()) {
                return Collections.emptyMap();
            }
            Map<String, String> result = new LinkedHashMap<>();
            flattenNode(root, "", result);
            return Collections.unmodifiableMap(result);
        } catch (Exception e) {
            throw new AssertionError(
                    "[TestDataRecord] Failed to parse request JSON: " + e.getMessage());
        }
    }

    @Override
    public String toString() {
        return "TestDataRecord{"
                + "hasRequest=" + hasRequest()
                + ", hasResponse=" + hasResponse()
                + '}';
    }

    // ── Private ──────────────────────────────────────────────────────────────

    private static void flattenNode(JsonNode node, String prefix, Map<String, String> result) {
        if (node.isObject()) {
            for (Map.Entry<String, JsonNode> field : node.properties()) {
                String childKey = prefix.isEmpty() ? field.getKey() : prefix + "." + field.getKey();
                flattenNode(field.getValue(), childKey, result);
            }
        } else if (node.isArray()) {
            for (int i = 0; i < node.size(); i++) {
                flattenNode(node.get(i), prefix + "[" + i + "]", result);
            }
        } else if (!node.isNull() && !node.isMissingNode()) {
            result.put(prefix, node.asText());
        }
    }
}
