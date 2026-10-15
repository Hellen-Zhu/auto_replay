package com.oreo.uat.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Iterator;
import java.util.Map;

/** Deep merge of JSON values: objects merge key by key, anything else (arrays included) is replaced. */
final class JsonMerge {

    private JsonMerge() {
    }

    /** Returns {@code base} with {@code override} merged in; neither argument is changed. */
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
