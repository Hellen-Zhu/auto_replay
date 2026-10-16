package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Map;

/**
 * Merging of data layers: objects merge deeply, arrays and scalars replace, {@code null} deletes the key.
 */
public final class JsonLayers {

    public static final String COMMENT = "_comment";

    private JsonLayers() {}

    /** A new object: {@code patch} applied over {@code base}. Neither input is changed. */
    public static ObjectNode merge(ObjectNode base, ObjectNode patch) {
        ObjectNode result = base.deepCopy();
        mergeInto(result, patch);
        return result;
    }

    /** A copy of {@code node} without {@code _comment} fields, at every depth. */
    public static JsonNode withoutComments(JsonNode node) {
        if (node.isObject()) {
            ObjectNode copy = Json.MAPPER.createObjectNode();
            for (Map.Entry<String, JsonNode> field : node.properties()) {
                if (!field.getKey().equals(COMMENT)) {
                    copy.set(field.getKey(), withoutComments(field.getValue()));
                }
            }
            return copy;
        }
        if (node.isArray()) {
            ArrayNode copy = Json.MAPPER.createArrayNode();
            node.forEach(element -> copy.add(withoutComments(element)));
            return copy;
        }
        return node.deepCopy();
    }

    private static void mergeInto(ObjectNode target, ObjectNode patch) {
        for (Map.Entry<String, JsonNode> field : patch.properties()) {
            String key = field.getKey();
            JsonNode value = field.getValue();
            if (value.isNull()) {
                target.remove(key);
            } else if (value.isObject()) {
                JsonNode existing = target.get(key);
                ObjectNode child = existing instanceof ObjectNode object ? object : target.putObject(key);
                mergeInto(child, (ObjectNode) value);
            } else {
                target.set(key, value.deepCopy());
            }
        }
    }
}
