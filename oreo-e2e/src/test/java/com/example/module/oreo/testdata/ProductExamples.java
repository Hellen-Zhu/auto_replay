package com.example.module.oreo.testdata;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * The {@code Examples} of the product Outlines, written from the registry: each Scenario Outline whose case ID has
 * {@code <product_type>} carries one {@code @capability#<name>} tag, and its single {@code product_type} table lists
 * the products of that capability ({@link ProductDatFiles#with(Capability)}), in registry order. {@link #plan} reads
 * every feature file under {@code api/} and {@code ui/} and changes nothing; {@link #write} writes the plan only when
 * it has no error. Used by {@code SyncProductExamples} and by check 10.8 of {@code TestDataValidationTest}.
 */
final class ProductExamples {

    private static final String PRODUCT_COLUMN = "product_type";
    private static final String ONLY = ": only an Outline with " + FeatureCases.PRODUCT_PLACEHOLDER + " carries one";

    /**
     * One product Outline.
     *
     * @param file     its feature file, relative to the features root with {@code /}
     * @param before   the products of its table now
     * @param after    the products of its capability
     * @param oldLines its table's lines now
     * @param newLines its table's lines as written from the registry
     */
    record Entry(String file, String rowId, Capability capability, List<String> before, List<String> after,
                 List<String> oldLines, List<String> newLines) {

        boolean changed() {
            return !oldLines.equals(newLines);
        }

        /**
         * {@code unchanged}; {@code add A, B} / {@code remove C} / {@code add A, remove C} (a duplicate row counts
         * as removed); else {@code reordered} or {@code reformatted}.
         */
        String note() {
            if (!changed()) return "unchanged";
            List<String> parts = new ArrayList<>();
            List<String> added = minus(after, before);
            List<String> removed = minus(before, after);
            if (!added.isEmpty()) parts.add("add " + String.join(", ", added));
            if (!removed.isEmpty()) parts.add("remove " + String.join(", ", removed));
            if (!parts.isEmpty()) return String.join(", ", parts);
            return before.equals(after) ? "reformatted" : "reordered";
        }

        /** The values of {@code a} left after taking out one occurrence per value of {@code b}. */
        private static List<String> minus(List<String> a, List<String> b) {
            List<String> rest = new ArrayList<>(b);
            List<String> out = new ArrayList<>();
            for (String value : a) {
                if (!rest.remove(value)) out.add(value);
            }
            return out;
        }
    }

    /**
     * @param rewrites the new text of each file with a changed entry, by its path
     * @param warnings capabilities that no Outline carries
     */
    record Plan(List<Entry> entries, Map<Path, String> rewrites, List<String> errors, List<String> warnings) {}

    private ProductExamples() {}

    /** The names of the products of {@code capability}, in registry order. */
    static List<String> registryProducts(Capability capability) {
        return ProductDatFiles.with(capability).stream().map(Enum::name).toList();
    }

    static Plan plan(Path featuresRoot, Function<Capability, List<String>> productsOf) {
        List<Entry> entries = new ArrayList<>();
        Map<Path, String> rewrites = new LinkedHashMap<>();
        List<String> errors = new ArrayList<>();
        for (Path path : featureFiles(featuresRoot)) {
            FeatureFile feature = FeatureFile.read(path);
            String file = featuresRoot.relativize(path).toString().replace('\\', '/');
            List<FeatureFile.Table> changedTables = new ArrayList<>();
            List<List<String>> changedLines = new ArrayList<>();
            for (FeatureFile.Block block : feature.blocks()) {
                Entry entry = entry(file, feature, block, productsOf, errors);
                if (entry == null) continue;
                entries.add(entry);
                if (entry.changed()) {
                    changedTables.add(block.examples().get(0));
                    changedLines.add(entry.newLines());
                }
            }
            if (changedTables.isEmpty()) continue;
            List<String> lines = new ArrayList<>(feature.lines());
            for (int i = changedTables.size() - 1; i >= 0; i--) {
                FeatureFile.Table table = changedTables.get(i);
                List<String> range = lines.subList(table.headerLine(), table.lastLine() + 1);
                range.clear();
                range.addAll(changedLines.get(i));
            }
            rewrites.put(path, feature.render(lines));
        }
        List<String> warnings = new ArrayList<>();
        for (Capability capability : Capability.values()) {
            if (entries.stream().noneMatch(e -> e.capability() == capability)) {
                warnings.add("capability " + capability.tagName() + ": no Outline tests it");
            }
        }
        return new Plan(List.copyOf(entries), Collections.unmodifiableMap(rewrites), List.copyOf(errors),
                List.copyOf(warnings));
    }

    /** Writes the plan's rewrites as UTF-8; nothing at all when it has an error. */
    static void write(Plan plan) {
        if (!plan.errors().isEmpty()) {
            throw new IllegalStateException("[ProductExamples] nothing written, " + plan.errors().size()
                    + " problem(s):\n  " + String.join("\n  ", plan.errors()));
        }
        for (Map.Entry<Path, String> rewrite : plan.rewrites().entrySet()) {
            try {
                Files.write(rewrite.getKey(), rewrite.getValue().getBytes(StandardCharsets.UTF_8));
            } catch (IOException e) {
                throw new UncheckedIOException("[ProductExamples] cannot write " + rewrite.getKey(), e);
            }
        }
    }

    /** The entry of {@code block} when it is a product Outline without problem; its problems go to {@code errors}. */
    private static Entry entry(String file, FeatureFile feature, FeatureFile.Block block,
                               Function<Capability, List<String>> productsOf, List<String> errors) {
        boolean managed = block.kind() == FeatureFile.Kind.OUTLINE && block.rowId() != null
                && block.rowId().contains(FeatureCases.PRODUCT_PLACEHOLDER);
        List<String> tags = capabilityTags(block.tags());
        if (!managed) {
            tags.forEach(tag -> errors.add(file + ": " + tag + " on " + misplaced(block) + ONLY));
        }
        for (FeatureFile.Table table : block.examples()) {
            String of = block.rowId() != null ? block.rowId() : "line " + (block.line() + 1);
            capabilityTags(table.tags()).forEach(tag -> errors.add(file + ": " + tag + " on an Examples block of "
                    + of + ONLY));
        }
        if (!managed) return null;

        String where = file + ": " + block.rowId();
        if (tags.isEmpty()) {
            errors.add(where + " has no " + Capability.TAG_PREFIX + " tag; known: " + Arrays.stream(Capability.values())
                    .map(Capability::tagName).collect(Collectors.joining(", ")));
            return null;
        }
        if (tags.size() > 1) {
            errors.add(where + " has " + tags.size() + " " + Capability.TAG_PREFIX + " tags: "
                    + String.join(", ", tags));
            return null;
        }
        Capability capability;
        try {
            capability = Capability.fromTagName(tags.get(0).substring(Capability.TAG_PREFIX.length()));
        } catch (IllegalArgumentException e) {
            errors.add(where + ": " + e.getMessage());
            return null;
        }
        if (block.examples().size() != 1 || !block.examples().get(0).header().equals(List.of(PRODUCT_COLUMN))) {
            errors.add(where + ": Examples must be one table with the single column " + PRODUCT_COLUMN);
            return null;
        }
        FeatureFile.Table table = block.examples().get(0);
        List<String> oldLines = List.copyOf(feature.lines().subList(table.headerLine(), table.lastLine() + 1));
        if (oldLines.stream().anyMatch(line -> !line.strip().startsWith("|"))) {
            errors.add(where + ": a comment or blank line inside the product table; the registry decides the rows"
                    + " (remove the line, or take the capability off the product in ProductDatFiles)");
            return null;
        }
        List<String> products = productsOf.apply(capability);
        if (products.isEmpty()) {
            errors.add(where + ": no product has capability " + capability.tagName() + " (ProductDatFiles)");
            return null;
        }
        return new Entry(file, block.rowId(), capability, table.column(PRODUCT_COLUMN), List.copyOf(products),
                oldLines, tableLines(table.indent(), products));
    }

    /** The header and one row per product, every cell padded to the widest value. */
    private static List<String> tableLines(String indent, List<String> products) {
        int width = PRODUCT_COLUMN.length();
        for (String product : products) width = Math.max(width, product.length());
        List<String> lines = new ArrayList<>();
        lines.add(row(indent, PRODUCT_COLUMN, width));
        for (String product : products) lines.add(row(indent, product, width));
        return lines;
    }

    private static String row(String indent, String value, int width) {
        return indent + "| " + value + " ".repeat(width - value.length()) + " |";
    }

    private static List<String> capabilityTags(List<String> tags) {
        return tags.stream().filter(t -> t.startsWith(Capability.TAG_PREFIX)).toList();
    }

    /** Where a capability tag that is not on a product Outline sits. */
    private static String misplaced(FeatureFile.Block block) {
        String at = "at line " + (block.line() + 1);
        return switch (block.kind()) {
            case FEATURE -> "the Feature";
            case BACKGROUND -> "the Background " + at;
            case RULE -> "the Rule " + at;
            case SCENARIO -> "the Scenario " + (block.rowId() != null ? block.rowId() : at);
            case OUTLINE -> "the Outline " + (block.rowId() != null ? block.rowId() : at)
                    + " without " + FeatureCases.PRODUCT_PLACEHOLDER;
        };
    }

    private static List<Path> featureFiles(Path featuresRoot) {
        List<Path> files = new ArrayList<>();
        for (String channelDir : List.of("api", "ui")) {
            Path dir = featuresRoot.resolve(channelDir);
            if (!Files.isDirectory(dir)) continue;
            try (Stream<Path> walk = Files.walk(dir)) {
                files.addAll(walk.filter(p -> p.getFileName().toString().endsWith(".feature")).sorted().toList());
            } catch (IOException e) {
                throw new UncheckedIOException("[ProductExamples] cannot list " + dir, e);
            }
        }
        return files;
    }
}
