package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The differences between two JSON trees as {@code add} / {@code remove} / {@code replace} ops with JSON Pointer
 * paths (RFC 6901), and their application: how a variant's expected file is kept as a patch on its base.
 *
 * <ul>
 *   <li>Objects key by key: {@code remove} for a key only the base has, {@code add} for a key only the target has,
 *       the same rules again for a key both have.</li>
 *   <li>Arrays of the same length element by element, by index; arrays of different lengths replaced whole.</li>
 *   <li>Any other differing value replaced. Values compare by their JSON text, so {@code 70000.0} and
 *       {@code 70000.00} differ.</li>
 * </ul>
 */
public final class JsonPatch {

    private JsonPatch() {}

    /** The ops that turn {@code base} into {@code target}; empty when they are the same. */
    public static ArrayNode diff(JsonNode base, JsonNode target) {
        ArrayNode ops = Json.MAPPER.createArrayNode();
        diff(base, target, "", ops);
        return ops;
    }

    private static void diff(JsonNode base, JsonNode target, String path, ArrayNode ops) {
        if (base.isObject() && target.isObject()) {
            for (Map.Entry<String, JsonNode> field : base.properties()) {
                String child = path + "/" + escape(field.getKey());
                JsonNode other = target.get(field.getKey());
                if (other == null) {
                    ops.add(op("remove", child, null));
                } else {
                    diff(field.getValue(), other, child, ops);
                }
            }
            for (Map.Entry<String, JsonNode> field : target.properties()) {
                if (!base.has(field.getKey())) {
                    ops.add(op("add", path + "/" + escape(field.getKey()), field.getValue()));
                }
            }
            return;
        }
        if (base.isArray() && target.isArray() && base.size() == target.size()) {
            for (int i = 0; i < base.size(); i++) {
                diff(base.get(i), target.get(i), path + "/" + i, ops);
            }
            return;
        }
        if (base.isContainerNode() || target.isContainerNode() || !sameValue(base, target)) {
            ops.add(op("replace", path, target));
        }
    }

    private static boolean sameValue(JsonNode a, JsonNode b) {
        return a.getNodeType() == b.getNodeType() && Json.compact(a).equals(Json.compact(b));
    }

    private static ObjectNode op(String name, String path, JsonNode value) {
        ObjectNode op = Json.MAPPER.createObjectNode();
        op.put("op", name);
        op.put("path", path);
        if (value != null) op.set("value", value.deepCopy());
        return op;
    }

    /**
     * {@code base} with {@code ops} applied, as a new tree ({@code base} is not changed). An op that does not fit
     * is an {@link IllegalStateException} naming {@code label} and the op's index.
     */
    public static JsonNode apply(JsonNode base, JsonNode ops, String label) {
        if (ops == null || !ops.isArray()) {
            throw new IllegalStateException("[JsonPatch] " + label + ": the patch must be an array of ops");
        }
        JsonNode doc = base.deepCopy();
        for (int i = 0; i < ops.size(); i++) {
            JsonNode op = ops.get(i);
            String name = op.path("op").asText("");
            String path = op.path("path").asText("");
            String where = "[JsonPatch] " + label + ": op " + i + " (" + name + " " + path + "): ";
            if (!op.isObject() || !op.path("op").isTextual() || !op.path("path").isTextual()) {
                throw new IllegalStateException(where + "an op is an object with a text op and a text path");
            }
            if (!name.equals("add") && !name.equals("remove") && !name.equals("replace")) {
                throw new IllegalStateException(where + "unknown op; ops are add, remove, replace");
            }
            JsonNode value = op.get("value");
            if (!name.equals("remove") && value == null) {
                throw new IllegalStateException(where + "needs a value");
            }
            doc = applyOne(doc, name, parse(path, where), value, where);
        }
        return doc;
    }

    private static JsonNode applyOne(JsonNode doc, String name, List<String> tokens, JsonNode value, String where) {
        if (tokens.isEmpty()) {
            if (!name.equals("replace")) {
                throw new IllegalStateException(where + "the whole document can only be replaced");
            }
            return value.deepCopy();
        }
        JsonNode parent = doc;
        for (String token : tokens.subList(0, tokens.size() - 1)) {
            parent = child(parent, token, where);
        }
        String last = tokens.get(tokens.size() - 1);
        if (parent instanceof ObjectNode object) {
            boolean exists = object.has(last);
            if (name.equals("add")) {
                if (exists) throw new IllegalStateException(where + "the key exists in the base");
                object.set(last, value.deepCopy());
            } else if (!exists) {
                throw new IllegalStateException(where + "the key is not in the base");
            } else if (name.equals("remove")) {
                object.remove(last);
            } else {
                object.set(last, value.deepCopy());
            }
        } else if (parent instanceof ArrayNode array) {
            if (name.equals("add")) {
                throw new IllegalStateException(where + "add applies to object keys only");
            }
            int index = index(last, array, where);
            if (name.equals("remove")) {
                array.remove(index);
            } else {
                array.set(index, value.deepCopy());
            }
        } else {
            throw new IllegalStateException(where + "the path goes through a value that is neither object nor array");
        }
        return doc;
    }

    private static JsonNode child(JsonNode parent, String token, String where) {
        if (parent instanceof ObjectNode object) {
            JsonNode next = object.get(token);
            if (next == null) throw new IllegalStateException(where + "the path is not in the base");
            return next;
        }
        if (parent instanceof ArrayNode array) {
            return array.get(index(token, array, where));
        }
        throw new IllegalStateException(where + "the path is not in the base");
    }

    private static int index(String token, ArrayNode array, String where) {
        if (!token.matches("0|[1-9][0-9]{0,8}") || Integer.parseInt(token) >= array.size()) {
            throw new IllegalStateException(where + "no element " + token + " in an array of " + array.size());
        }
        return Integer.parseInt(token);
    }

    // ── JSON Pointer (RFC 6901) ──────────────────────────────────────────────

    private static String escape(String key) {
        return key.replace("~", "~0").replace("/", "~1");
    }

    private static List<String> parse(String path, String where) {
        List<String> tokens = new ArrayList<>();
        if (path.isEmpty()) return tokens;
        if (!path.startsWith("/")) {
            throw new IllegalStateException(where + "a path is empty or starts with /");
        }
        for (String token : path.substring(1).split("/", -1)) {
            tokens.add(token.replace("~1", "/").replace("~0", "~"));
        }
        return tokens;
    }
}
