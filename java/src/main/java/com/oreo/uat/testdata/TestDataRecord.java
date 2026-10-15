package com.oreo.uat.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The resolved test data of one case: the request body and the expected response as JSON text, the same shape the
 * hook stores in the scenario context today ({@code _tc.request}, {@code _tc.response}).
 */
public final class TestDataRecord {

    private final String tcKey;
    private final JsonNode request;
    private final JsonNode response;

    TestDataRecord(String tcKey, JsonNode request, JsonNode response) {
        this.tcKey = tcKey;
        this.request = request;
        this.response = response;
    }

    public String tcKey() {
        return tcKey;
    }

    /** Request body as pretty-printed JSON, or null when the case has none. */
    public String request() {
        return toText(request);
    }

    /** Expected response as pretty-printed JSON, or null when the case has none. */
    public String response() {
        return toText(response);
    }

    public JsonNode requestNode() {
        return request;
    }

    public JsonNode responseNode() {
        return response;
    }

    /**
     * Leaf values of the request by their dotted path ({@code basic.counterpartyName}); array items as
     * {@code subTrades[0].notional}. Keep the existing flattenRequest() of the E2E project if its paths differ.
     */
    public Map<String, String> flattenRequest() {
        Map<String, String> out = new LinkedHashMap<>();
        if (request != null) {
            flatten("", request, out);
        }
        return out;
    }

    private static void flatten(String prefix, JsonNode node, Map<String, String> out) {
        if (node.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> e = fields.next();
                flatten(prefix.isEmpty() ? e.getKey() : prefix + "." + e.getKey(), e.getValue(), out);
            }
        } else if (node.isArray()) {
            for (int i = 0; i < node.size(); i++) {
                flatten(prefix + "[" + i + "]", node.get(i), out);
            }
        } else if (!node.isNull()) {
            out.put(prefix, node.asText());
        }
    }

    private static String toText(JsonNode node) {
        return node == null ? null : node.toPrettyString();
    }
}
