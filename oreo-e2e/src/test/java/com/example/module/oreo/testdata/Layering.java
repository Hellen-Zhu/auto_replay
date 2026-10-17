package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Cuts the data of a feature's cases into the layers of an event file (spec section 3.4): {@code defaults},
 * {@code byProduct}, the rows and the rows' {@code byProduct}. Pure: values in, layers out.
 *
 * <p>A value is cut into leaves: a path of object keys to a value; arrays and empty objects are values. A layer holds
 * the leaves more than half of its cases have (absence included), as a patch on the layers below: the case's value,
 * or {@code null} where the case lacks the key (one {@code null} for a whole missing object).
 */
final class Layering {

    /**
     * @param caseId  the case ID
     * @param rowId   the row ID as written in the feature (an Outline's ID with {@code <product_type>})
     * @param product the product, null for a case without one
     * @param value   the request, or the rules as a flat object
     * @param hasData whether the old YAML had data for the case; a case without does not vote
     */
    record Case(String caseId, String rowId, String product, ObjectNode value, boolean hasData) {}

    /**
     * The layers. Maps keep their order (byProduct and the inner maps of rowByProduct by product, rows by their first
     * case); empty layers are absent. A row or rowByProduct value is a patch, or {@link NullNode} (clear everything).
     */
    record Layers(ObjectNode defaults, Map<String, ObjectNode> byProduct, Map<String, JsonNode> rows,
                  Map<String, Map<String, JsonNode>> rowByProduct) {

        /** The case's layers merged as the repository merges them. */
        ObjectNode merged(Case c) {
            ObjectNode out = apply(Json.MAPPER.createObjectNode(), defaults);
            if (c.product() != null) out = apply(out, byProduct.get(c.product()));
            out = apply(out, rows.get(c.rowId()));
            Map<String, JsonNode> rest = rowByProduct.get(c.rowId());
            if (rest != null && c.product() != null) out = apply(out, rest.get(c.product()));
            return out;
        }

        private static ObjectNode apply(ObjectNode base, JsonNode layer) {
            if (layer == null) return base;
            if (layer.isNull()) return Json.MAPPER.createObjectNode();
            return JsonLayers.merge(base, (ObjectNode) layer);
        }
    }

    /** The value at a path is a non-empty object. */
    private static final Object OBJECT = new Object() {
        @Override public String toString() { return "OBJECT"; }
    };
    /** There is no value at a path. */
    private static final Object ABSENT = new Object() {
        @Override public String toString() { return "ABSENT"; }
    };

    private Layering() {}

    /**
     * @param productOrder   the order of byProduct entries (registry order); other products follow as they appear
     * @param clearWhenEmpty rules: a case without any while its layers give some gets {@code null} for the whole part
     */
    static Layers layer(List<Case> cases, List<String> productOrder, boolean clearWhenEmpty) {
        List<Case> voting = cases.stream().filter(Case::hasData).toList();

        // 1. defaults
        ObjectNode defaults = Json.MAPPER.createObjectNode();
        winners(values(voting), leafPaths(values(voting))).forEach((path, value) -> {
            if (value instanceof JsonNode node) put(defaults, path, node);
        });

        // 2. byProduct
        Map<String, ObjectNode> byProduct = new LinkedHashMap<>();
        for (String product : products(cases, productOrder)) {
            List<ObjectNode> mine = values(voting.stream().filter(c -> product.equals(c.product())).toList());
            if (mine.isEmpty()) continue;
            Set<List<String>> paths = new LinkedHashSet<>(leafPaths(mine));
            paths.addAll(leafPaths(List.of(defaults)));
            ObjectNode target = defaults.deepCopy();
            winners(mine, paths).forEach((path, value) -> {
                if (value.equals(at(defaults, path))) return;
                if (value == ABSENT) remove(target, path);
                else if (value instanceof JsonNode node) put(target, path, node);
            });
            removeObjectsMostLack(target, new ArrayList<>(), mine);
            ObjectNode patch = diff(defaults, target);
            if (!patch.isEmpty()) byProduct.put(product, patch);
        }

        // 3.-5. rows and their byProduct
        Map<String, JsonNode> rows = new LinkedHashMap<>();
        Map<String, Map<String, JsonNode>> rowByProduct = new LinkedHashMap<>();
        Set<String> rowIds = new LinkedHashSet<>();
        cases.forEach(c -> rowIds.add(c.rowId()));
        for (String rowId : rowIds) {
            List<Case> mine = cases.stream().filter(c -> c.rowId().equals(rowId)).toList();
            Map<Case, ObjectNode> base = new LinkedHashMap<>();
            for (Case c : mine) {
                ObjectNode b = defaults;
                if (c.product() != null && byProduct.containsKey(c.product())) {
                    b = JsonLayers.merge(defaults, byProduct.get(c.product()));
                }
                base.put(c, b);
            }
            if (clearWhenEmpty && mine.stream().allMatch(c -> c.value().isEmpty())
                    && base.values().stream().anyMatch(b -> !b.isEmpty())) {
                rows.put(rowId, NullNode.getInstance());
                continue;
            }

            Map<List<String>, JsonNode> candidates = new LinkedHashMap<>();
            for (Case c : mine) {
                entries(diff(base.get(c), c.value()), new ArrayList<>(), candidates);
            }
            ObjectNode row = Json.MAPPER.createObjectNode();
            candidates.forEach((path, value) -> {
                if (mine.stream().allMatch(c -> holds(c.value(), path, value))) put(row, path, value);
            });
            if (!row.isEmpty()) rows.put(rowId, row);

            Map<String, JsonNode> rest = new LinkedHashMap<>();
            for (String product : products(mine, productOrder)) {
                for (Case c : mine) {
                    if (!product.equals(c.product())) continue;
                    ObjectNode merged = JsonLayers.merge(base.get(c), row);
                    if (clearWhenEmpty && c.value().isEmpty() && !merged.isEmpty()) {
                        rest.put(product, NullNode.getInstance());
                        continue;
                    }
                    ObjectNode patch = diff(merged, c.value());
                    if (!patch.isEmpty()) rest.put(product, patch);
                }
            }
            // A case without a product has nothing left after its row unless its value cannot be expressed as layers;
            // the caller's self-check reports that.
            if (!rest.isEmpty()) rowByProduct.put(rowId, rest);
        }
        return new Layers(defaults, byProduct, rows, rowByProduct);
    }

    // ── Leaves and votes ─────────────────────────────────────────────────────

    private static List<ObjectNode> values(List<Case> cases) {
        return cases.stream().map(Case::value).toList();
    }

    private static List<String> products(List<Case> cases, List<String> productOrder) {
        Set<String> present = new LinkedHashSet<>();
        cases.forEach(c -> { if (c.product() != null) present.add(c.product()); });
        List<String> out = new ArrayList<>(productOrder.stream().filter(present::contains).toList());
        present.stream().filter(p -> !out.contains(p)).forEach(out::add);
        return out;
    }

    /** The leaf paths of the values, in order of first appearance. */
    private static Set<List<String>> leafPaths(List<ObjectNode> values) {
        Set<List<String>> out = new LinkedHashSet<>();
        for (ObjectNode value : values) {
            collectLeaves(value, new ArrayList<>(), out);
        }
        return out;
    }

    private static void collectLeaves(ObjectNode node, List<String> at, Set<List<String>> out) {
        for (Map.Entry<String, JsonNode> field : node.properties()) {
            at.add(field.getKey());
            if (field.getValue() instanceof ObjectNode child && !child.isEmpty()) {
                collectLeaves(child, at, out);
            } else {
                out.add(List.copyOf(at));
            }
            at.remove(at.size() - 1);
        }
    }

    /** The value at a path: a JSON value, {@link #OBJECT} for a non-empty object, {@link #ABSENT} when missing. */
    private static Object at(JsonNode root, List<String> path) {
        JsonNode node = root;
        for (String key : path) {
            if (!(node instanceof ObjectNode object) || !object.has(key)) return ABSENT;
            node = object.get(key);
        }
        return node instanceof ObjectNode object && !object.isEmpty() ? OBJECT : node;
    }

    /** Per path, the value more than half of the values hold, when there is one. */
    private static Map<List<String>, Object> winners(List<ObjectNode> values, Collection<List<String>> paths) {
        Map<List<String>, Object> out = new LinkedHashMap<>();
        for (List<String> path : paths) {
            Map<Object, Integer> counts = new LinkedHashMap<>();
            for (ObjectNode value : values) {
                counts.merge(at(value, path), 1, Integer::sum);
            }
            counts.forEach((value, count) -> {
                if (count * 2 > values.size()) out.put(path, value);
            });
        }
        return out;
    }

    // ── Patches ──────────────────────────────────────────────────────────────

    /** The patch that turns {@code base} into {@code value}: its differing values, {@code null} for what it lacks. */
    private static ObjectNode diff(ObjectNode base, ObjectNode value) {
        ObjectNode out = Json.MAPPER.createObjectNode();
        for (Map.Entry<String, JsonNode> field : value.properties()) {
            JsonNode was = base.get(field.getKey());
            JsonNode now = field.getValue();
            if (was == null) {
                out.set(field.getKey(), now.deepCopy());
            } else if (now instanceof ObjectNode nowObject && !nowObject.isEmpty()
                    && was instanceof ObjectNode wasObject && !wasObject.isEmpty()) {
                ObjectNode inner = diff(wasObject, nowObject);
                if (!inner.isEmpty()) out.set(field.getKey(), inner);
            } else if (!now.equals(was)) {
                out.set(field.getKey(), now.deepCopy());
            }
        }
        for (Map.Entry<String, JsonNode> field : base.properties()) {
            if (!value.has(field.getKey())) out.putNull(field.getKey());
        }
        return out;
    }

    /** The entries of a patch: path to value, a {@code null} being an entry at its own path. */
    private static void entries(ObjectNode patch, List<String> at, Map<List<String>, JsonNode> out) {
        for (Map.Entry<String, JsonNode> field : patch.properties()) {
            at.add(field.getKey());
            if (field.getValue() instanceof ObjectNode child && !child.isEmpty()) {
                entries(child, at, out);
            } else {
                out.putIfAbsent(List.copyOf(at), field.getValue());
            }
            at.remove(at.size() - 1);
        }
    }

    /** Whether a case has a patch entry's value: the same value, or nothing there for a {@code null}. */
    private static boolean holds(ObjectNode value, List<String> path, JsonNode entry) {
        Object there = at(value, path);
        return entry.isNull() ? there == ABSENT : entry.equals(there);
    }

    private static void put(ObjectNode root, List<String> path, JsonNode value) {
        ObjectNode node = root;
        for (String key : path.subList(0, path.size() - 1)) {
            JsonNode child = node.get(key);
            node = child instanceof ObjectNode object ? object : node.putObject(key);
        }
        node.set(path.get(path.size() - 1), value.deepCopy());
    }

    private static void remove(ObjectNode root, List<String> path) {
        JsonNode node = root;
        for (String key : path.subList(0, path.size() - 1)) {
            node = node.get(key);
            if (!(node instanceof ObjectNode)) return;
        }
        ((ObjectNode) node).remove(path.get(path.size() - 1));
    }

    /** Removes each object of {@code node} that more than half of the values lack. */
    private static void removeObjectsMostLack(ObjectNode node, List<String> prefix, List<ObjectNode> values) {
        for (String key : node.properties().stream().map(Map.Entry::getKey).toList()) {
            if (!(node.get(key) instanceof ObjectNode child)) continue;
            prefix.add(key);
            long lacking = values.stream().filter(v -> at(v, prefix) == ABSENT).count();
            if (lacking * 2 > values.size()) {
                node.remove(key);
            } else {
                removeObjectsMostLack(child, prefix, values);
            }
            prefix.remove(prefix.size() - 1);
        }
    }
}
