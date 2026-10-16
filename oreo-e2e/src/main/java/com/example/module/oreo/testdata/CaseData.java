package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** The merged data of one case: its request (body or form values), its dynamic-field rules and where they came from. */
public final class CaseData {

    private final CaseId id;
    private final ObjectNode request;
    private final Map<String, String> dynamicFields;
    private final String expectedBase;
    private final List<String> layers;

    CaseData(CaseId id, ObjectNode request, Map<String, String> dynamicFields, String expectedBase,
             List<String> layers) {
        this.id = id;
        this.request = request.deepCopy();
        this.dynamicFields = Collections.unmodifiableMap(new LinkedHashMap<>(dynamicFields));
        this.expectedBase = expectedBase;
        this.layers = List.copyOf(layers);
    }

    public CaseId id() { return id; }

    /** Compact JSON of the merged request; {@code {}} when no layer has one. */
    public String request() { return Json.compact(request); }

    /** {@code true} when the merged request has at least one field. */
    public boolean hasRequest() { return !request.isEmpty(); }

    /** Path -> rule ({@code type}, {@code type-tree}, {@code regex:...}, {@code ignore}), API cases only. */
    public Map<String, String> dynamicFields() { return dynamicFields; }

    /**
     * The case whose expected file this case's file is a patch on ({@code <product_type>} already replaced);
     * {@code null} when it has none (API cases only).
     */
    public String expectedBase() { return expectedBase; }

    /** The layers applied, in order, e.g. {@code trade_creation.json defaults (use trade-basic)}. */
    public List<String> layers() { return layers; }

    /**
     * The request flattened into dot-path keys ({@code basic.counterpartyName}, {@code subTrades[0].portfolioId})
     * with text leaf values, as the hook stores them in the scenario context.
     */
    public Map<String, String> flattenRequest() {
        Map<String, String> result = new LinkedHashMap<>();
        flatten(request, "", result);
        return Collections.unmodifiableMap(result);
    }

    private static void flatten(JsonNode node, String prefix, Map<String, String> result) {
        if (node.isObject()) {
            for (Map.Entry<String, JsonNode> field : node.properties()) {
                flatten(field.getValue(), prefix.isEmpty() ? field.getKey() : prefix + "." + field.getKey(), result);
            }
        } else if (node.isArray()) {
            for (int i = 0; i < node.size(); i++) {
                flatten(node.get(i), prefix + "[" + i + "]", result);
            }
        } else if (!node.isNull() && !node.isMissingNode()) {
            result.put(prefix, node.asText());
        }
    }

    @Override
    public String toString() {
        return "CaseData{" + id.raw() + ", layers=" + layers + '}';
    }
}
