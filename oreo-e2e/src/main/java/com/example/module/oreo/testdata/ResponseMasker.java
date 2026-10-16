package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * Turns an actual API response into the expected file: the fields named by {@code dynamicFields} are replaced
 * by JsonUnit placeholders, everything else is kept exactly (numbers digit for digit).
 *
 * <table>
 *   <caption>Rules</caption>
 *   <tr><td>{@code type}</td><td>{@code ${json-unit.any-string|any-number|any-boolean}}; {@code null} stays</td></tr>
 *   <tr><td>{@code type-tree}</td><td>the subtree, every leaf replaced as by {@code type}</td></tr>
 *   <tr><td>{@code regex:<p>}</td><td>{@code ${json-unit.regex}<p>}; the actual value must match</td></tr>
 *   <tr><td>{@code ignore}</td><td>{@code ${json-unit.ignore}}</td></tr>
 * </table>
 *
 * A path is keys joined by {@code .}, with {@code [n]} for one array element and {@code [*]} for every element.
 */
public final class ResponseMasker {

    static final String ANY_STRING = "${json-unit.any-string}";
    static final String ANY_NUMBER = "${json-unit.any-number}";
    static final String ANY_BOOLEAN = "${json-unit.any-boolean}";
    static final String REGEX = "${json-unit.regex}";
    static final String IGNORE = "${json-unit.ignore}";

    private static final Pattern PART = Pattern.compile("([^.\\[\\]]*)((?:\\[(?:\\d+|\\*)])*)");
    private static final Pattern INDEX = Pattern.compile("\\[(\\d+|\\*)]");
    private static final Object ANY = new Object();

    private ResponseMasker() {}

    /** The pretty-printed expected file for {@code actualJson}; fails on a rule that does not fit the response. */
    public static String mask(String actualJson, Map<String, String> rules, String caseLabel) {
        JsonNode actual;
        try {
            actual = Json.parse(actualJson);
        } catch (IllegalStateException e) {
            throw new IllegalStateException("[ResponseMasker] the response of " + caseLabel + " is not JSON: "
                    + e.getMessage(), e);
        }
        JsonNode masked = actual.deepCopy();
        if (rules != null) {
            for (Map.Entry<String, String> rule : rules.entrySet()) {
                masked = apply(actual, masked, rule.getKey(), rule.getValue(), caseLabel);
            }
        }
        return Json.pretty(masked);
    }

    private static JsonNode apply(JsonNode actual, JsonNode masked, String path, String rule, String caseLabel) {
        List<Object> steps = parsePath(path, caseLabel);
        List<List<Object>> targets = new ArrayList<>();
        collect(actual, steps, 0, new ArrayList<>(), targets);
        if (targets.isEmpty()) {
            throw new IllegalStateException("[ResponseMasker] rule " + path + " matches nothing in the response of "
                    + caseLabel + " (a typo, or a rule this case should not inherit: set it to null for the case)");
        }
        for (List<Object> target : targets) {
            JsonNode value = at(actual, target);
            JsonNode replacement = replacement(value, path, rule, caseLabel);
            masked = set(masked, target, replacement);
        }
        return masked;
    }

    private static JsonNode replacement(JsonNode value, String path, String rule, String caseLabel) {
        String where = "rule " + path + " = " + rule + " in the response of " + caseLabel;
        if (rule == null) {
            throw new IllegalStateException("[ResponseMasker] " + where + ": a rule is type, type-tree, regex:<pattern>"
                    + " or ignore");
        }
        if (rule.equals("type")) {
            if (value.isContainerNode()) {
                throw new IllegalStateException("[ResponseMasker] " + where + ": the value is an "
                        + (value.isObject() ? "object" : "array") + "; use type-tree");
            }
            return leaf(value, where);
        }
        if (rule.equals("type-tree")) {
            return tree(value, where);
        }
        if (rule.equals("ignore")) {
            return TextNode.valueOf(IGNORE);
        }
        if (rule.startsWith("regex:")) {
            String pattern = rule.substring("regex:".length());
            if (!value.isTextual()) {
                throw new IllegalStateException("[ResponseMasker] " + where + ": regex applies to text, the value is "
                        + Json.compact(value));
            }
            Matcher matcher;
            try {
                matcher = Pattern.compile(pattern).matcher(value.asText());
            } catch (PatternSyntaxException e) {
                throw new IllegalStateException("[ResponseMasker] " + where + ": invalid pattern: " + e.getDescription(), e);
            }
            if (!matcher.matches()) {
                throw new IllegalStateException("[ResponseMasker] " + where + ": the actual value "
                        + Json.compact(value) + " does not match; not recorded");
            }
            return TextNode.valueOf(REGEX + pattern);
        }
        throw new IllegalStateException("[ResponseMasker] " + where + ": unknown rule; a rule is type, type-tree,"
                + " regex:<pattern> or ignore");
    }

    private static JsonNode leaf(JsonNode value, String where) {
        if (value.isNull()) return value;
        if (value.isTextual()) return TextNode.valueOf(ANY_STRING);
        if (value.isNumber()) return TextNode.valueOf(ANY_NUMBER);
        if (value.isBoolean()) return TextNode.valueOf(ANY_BOOLEAN);
        throw new IllegalStateException("[ResponseMasker] " + where + ": unsupported value " + value.getNodeType());
    }

    private static JsonNode tree(JsonNode value, String where) {
        if (value.isObject()) {
            ObjectNode copy = Json.MAPPER.createObjectNode();
            for (Map.Entry<String, JsonNode> field : value.properties()) {
                copy.set(field.getKey(), tree(field.getValue(), where));
            }
            return copy;
        }
        if (value.isArray()) {
            ArrayNode copy = Json.MAPPER.createArrayNode();
            value.forEach(element -> copy.add(tree(element, where)));
            return copy;
        }
        return leaf(value, where);
    }

    // ── Paths ────────────────────────────────────────────────────────────────

    /** {@code data.trade.udf[*].value} -> {@code ["data", "trade", "udf", ANY, "value"]}; indexes as Integer. */
    private static List<Object> parsePath(String path, String caseLabel) {
        List<Object> steps = new ArrayList<>();
        String[] parts = path == null ? new String[0] : path.split("\\.", -1);
        for (int i = 0; i < parts.length; i++) {
            Matcher part = PART.matcher(parts[i]);
            boolean firstIndexOnly = i == 0 && parts[i].startsWith("[");
            if (!part.matches() || (part.group(1).isEmpty() && !firstIndexOnly)) {
                throw new IllegalStateException("[ResponseMasker] rule path '" + path + "' of " + caseLabel
                        + " is not keys joined by '.', with [n] or [*] for array elements");
            }
            if (!part.group(1).isEmpty()) steps.add(part.group(1));
            Matcher index = INDEX.matcher(part.group(2));
            while (index.find()) {
                steps.add(index.group(1).equals("*") ? ANY : Integer.valueOf(index.group(1)));
            }
        }
        if (steps.isEmpty()) {
            throw new IllegalStateException("[ResponseMasker] empty rule path in the rules of " + caseLabel);
        }
        return steps;
    }

    /** Every concrete path (keys and indexes) in {@code node} that {@code steps} matches. */
    private static void collect(JsonNode node, List<Object> steps, int i, List<Object> at, List<List<Object>> out) {
        if (i == steps.size()) {
            out.add(new ArrayList<>(at));
            return;
        }
        Object step = steps.get(i);
        if (step instanceof String key) {
            if (node.isObject() && node.has(key)) {
                at.add(key);
                collect(node.get(key), steps, i + 1, at, out);
                at.remove(at.size() - 1);
            }
        } else if (node.isArray()) {
            int from = step == ANY ? 0 : (Integer) step;
            int to = step == ANY ? node.size() : Math.min(from + 1, node.size());
            for (int n = from; n < to; n++) {
                at.add(n);
                collect(node.get(n), steps, i + 1, at, out);
                at.remove(at.size() - 1);
            }
        }
    }

    private static JsonNode at(JsonNode root, List<Object> path) {
        JsonNode node = root;
        for (Object step : path) {
            node = step instanceof String key ? node.get(key) : node.get((Integer) step);
        }
        return node;
    }

    /**
     * Puts {@code value} at {@code path} in {@code root}. A path whose parent an earlier rule already replaced
     * (e.g. {@code ignore} on an object) is left as that rule wrote it.
     */
    private static JsonNode set(JsonNode root, List<Object> path, JsonNode value) {
        if (path.isEmpty()) return value;
        JsonNode parent = root;
        for (Object step : path.subList(0, path.size() - 1)) {
            parent = step instanceof String key ? parent.get(key) : parent.get((Integer) step);
            if (parent == null) return root;
        }
        Object last = path.get(path.size() - 1);
        if (last instanceof String key && parent instanceof ObjectNode object && object.has(key)) {
            object.set(key, value);
        } else if (last instanceof Integer n && parent instanceof ArrayNode array && n < array.size()) {
            array.set(n, value);
        }
        return root;
    }
}
