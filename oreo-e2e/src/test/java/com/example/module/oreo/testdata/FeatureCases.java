package com.example.module.oreo.testdata;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

/**
 * The case IDs of the feature files: {@code <featuresRoot>/<api|ui>/**}{@code /*.feature}. A scenario's ID is the
 * first {@code [TC-...]} in its name; a Scenario Outline whose ID has {@code <product_type>} expands over the
 * {@code product_type} column of every {@code Examples} table.
 */
final class FeatureCases {

    static final String PRODUCT_PLACEHOLDER = "<product_type>";

    /**
     * @param caseId      the expanded case ID, e.g. {@code TC-TRADE-CREATION-FX_TRF-API-001}
     * @param rowId       the ID as written in the feature, e.g. {@code TC-TRADE-CREATION-<product_type>-API-001}
     * @param channelDir  {@code api} or {@code ui}: the folder under the features root
     * @param featureName the file name without {@code .feature}
     */
    record FeatureCase(String caseId, String rowId, String channelDir, String featureName) {}

    private FeatureCases() {}

    static List<FeatureCase> load(Path featuresRoot) {
        List<FeatureCase> cases = new ArrayList<>();
        for (String channelDir : List.of("api", "ui")) {
            Path dir = featuresRoot.resolve(channelDir);
            if (!Files.isDirectory(dir)) continue;
            List<Path> files;
            try (Stream<Path> walk = Files.walk(dir)) {
                files = walk.filter(p -> p.getFileName().toString().endsWith(".feature")).sorted().toList();
            } catch (IOException e) {
                throw new UncheckedIOException("[FeatureCases] cannot list " + dir, e);
            }
            for (Path file : files) {
                cases.addAll(parse(file, channelDir));
            }
        }
        return cases;
    }

    private static List<FeatureCase> parse(Path file, String channelDir) {
        String featureName = file.getFileName().toString().replaceFirst("\\.feature$", "");
        List<String> lines;
        try {
            lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("[FeatureCases] cannot read " + file, e);
        }
        List<FeatureCase> cases = new ArrayList<>();
        Scenario current = null;
        for (String raw : lines) {
            String line = raw.trim();
            if (startsWithAny(line, "Scenario Outline:", "Scenario Template:")) {
                flush(current, file, channelDir, featureName, cases);
                current = new Scenario(CaseId.fromScenarioName(line), true);
            } else if (startsWithAny(line, "Scenario:", "Example:")) {
                flush(current, file, channelDir, featureName, cases);
                current = new Scenario(CaseId.fromScenarioName(line), false);
            } else if (startsWithAny(line, "Feature:", "Background:", "Rule:")) {
                flush(current, file, channelDir, featureName, cases);
                current = null;
            } else if (current != null && startsWithAny(line, "Examples:", "Scenarios:")) {
                current.inExamples = true;
                current.productColumn = -2;
            } else if (current != null && current.inExamples && line.startsWith("|")) {
                List<String> cells = cells(line);
                if (current.productColumn == -2) {
                    current.productColumn = cells.indexOf("product_type");
                } else if (current.productColumn >= 0 && current.productColumn < cells.size()) {
                    current.products.add(cells.get(current.productColumn));
                }
            }
        }
        flush(current, file, channelDir, featureName, cases);
        return cases;
    }

    private static void flush(Scenario scenario, Path file, String channelDir, String featureName,
                              List<FeatureCase> out) {
        if (scenario == null || scenario.rowId == null) return;
        String rowId = scenario.rowId;
        Set<String> ids = new LinkedHashSet<>();
        if (scenario.outline && rowId.contains(PRODUCT_PLACEHOLDER)) {
            if (scenario.products.isEmpty()) {
                throw new IllegalStateException("[FeatureCases] " + file + ": " + rowId
                        + " has no Examples column product_type to expand " + PRODUCT_PLACEHOLDER);
            }
            scenario.products.forEach(p -> ids.add(rowId.replace(PRODUCT_PLACEHOLDER, p)));
        } else {
            ids.add(rowId);
        }
        for (String id : ids) {
            if (id.contains("<")) {
                throw new IllegalStateException("[FeatureCases] " + file + ": case ID " + id
                        + " has a placeholder other than " + PRODUCT_PLACEHOLDER);
            }
            out.add(new FeatureCase(id, rowId, channelDir, featureName));
        }
    }

    private static List<String> cells(String tableLine) {
        String inner = tableLine.substring(1, tableLine.endsWith("|") && tableLine.length() > 1
                ? tableLine.length() - 1 : tableLine.length());
        List<String> cells = new ArrayList<>();
        for (String cell : inner.split("\\|", -1)) cells.add(cell.trim());
        return cells;
    }

    private static boolean startsWithAny(String line, String... keywords) {
        for (String keyword : keywords) {
            if (line.startsWith(keyword)) return true;
        }
        return false;
    }

    private static final class Scenario {
        final String rowId;
        final boolean outline;
        final List<String> products = new ArrayList<>();
        boolean inExamples;
        /** -2: the next table line is a header; -1: the table has no product_type column. */
        int productColumn = -2;

        Scenario(String rowId, boolean outline) {
            this.rowId = rowId;
            this.outline = outline;
        }
    }
}
