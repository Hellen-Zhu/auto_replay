package com.example.module.oreo.testdata;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.cfg.JsonNodeFeature;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;

import java.util.Iterator;
import java.util.Map;

/**
 * JSON reading and writing for test data and expected responses.
 *
 * <p>Numbers keep the digits they were written with: floats are read as {@code BigDecimal} without
 * stripping trailing zeros, so {@code 70000.0} stays {@code 70000.0} and {@code 20150.8410403754144}
 * keeps every digit. {@link #pretty(JsonNode)} is our own printer so that the layout of recorded files
 * does not depend on the Jackson version.
 */
public final class Json {

    @SuppressWarnings("deprecation")
    public static final ObjectMapper MAPPER = new ObjectMapper()
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .configure(JsonNodeFeature.STRIP_TRAILING_BIGDECIMAL_ZEROES, false)
            .setNodeFactory(JsonNodeFactory.withExactBigDecimals(true));

    private Json() {}

    public static JsonNode parse(String json) {
        try {
            return MAPPER.readTree(json);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("[Json] invalid JSON: " + e.getOriginalMessage(), e);
        }
    }

    public static String compact(JsonNode node) {
        try {
            return MAPPER.writeValueAsString(node);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("[Json] cannot write JSON: " + e.getOriginalMessage(), e);
        }
    }

    /**
     * Two-space indent, {@code "key": value}, one array element per line, empty {@code {}} / {@code []},
     * {@code \n} line ends and a trailing newline (the layout of Python's {@code json.dumps(indent=2)}).
     */
    public static String pretty(JsonNode node) {
        StringBuilder out = new StringBuilder();
        write(node, 0, out);
        return out.append('\n').toString();
    }

    private static void write(JsonNode node, int depth, StringBuilder out) {
        if (node.isObject()) {
            if (node.isEmpty()) {
                out.append("{}");
                return;
            }
            out.append("{\n");
            Iterator<Map.Entry<String, JsonNode>> fields = node.properties().iterator();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                indent(depth + 1, out);
                out.append(quote(field.getKey())).append(": ");
                write(field.getValue(), depth + 1, out);
                out.append(fields.hasNext() ? ",\n" : "\n");
            }
            indent(depth, out);
            out.append('}');
        } else if (node.isArray()) {
            if (node.isEmpty()) {
                out.append("[]");
                return;
            }
            out.append("[\n");
            for (int i = 0; i < node.size(); i++) {
                indent(depth + 1, out);
                write(node.get(i), depth + 1, out);
                out.append(i < node.size() - 1 ? ",\n" : "\n");
            }
            indent(depth, out);
            out.append(']');
        } else if (node.isTextual()) {
            out.append(quote(node.textValue()));
        } else if (node.isBigDecimal()) {
            out.append(node.decimalValue().toString());
        } else {
            out.append(compact(node));
        }
    }

    private static void indent(int depth, StringBuilder out) {
        out.append("  ".repeat(depth));
    }

    private static String quote(String text) {
        try {
            return MAPPER.writeValueAsString(text);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("[Json] cannot write string: " + e.getOriginalMessage(), e);
        }
    }
}
