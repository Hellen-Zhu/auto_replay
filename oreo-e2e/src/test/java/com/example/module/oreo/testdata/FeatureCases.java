package com.example.module.oreo.testdata;

import java.io.IOException;
import java.io.UncheckedIOException;
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
                cases.addAll(cases(FeatureFile.read(file), channelDir));
            }
        }
        return cases;
    }

    private static List<FeatureCase> cases(FeatureFile feature, String channelDir) {
        String featureName = feature.file().getFileName().toString().replaceFirst("\\.feature$", "");
        List<FeatureCase> cases = new ArrayList<>();
        for (FeatureFile.Block block : feature.blocks()) {
            boolean outline = block.kind() == FeatureFile.Kind.OUTLINE;
            if (block.rowId() == null || !(outline || block.kind() == FeatureFile.Kind.SCENARIO)) continue;
            String rowId = block.rowId();
            Set<String> ids = new LinkedHashSet<>();
            if (outline && rowId.contains(PRODUCT_PLACEHOLDER)) {
                List<String> products = block.examples().stream()
                        .flatMap(t -> t.column("product_type").stream()).toList();
                if (products.isEmpty()) {
                    throw new IllegalStateException("[FeatureCases] " + feature.file() + ": " + rowId
                            + " has no Examples column product_type to expand " + PRODUCT_PLACEHOLDER);
                }
                products.forEach(p -> ids.add(rowId.replace(PRODUCT_PLACEHOLDER, p)));
            } else {
                ids.add(rowId);
            }
            for (String id : ids) {
                if (id.contains("<")) {
                    throw new IllegalStateException("[FeatureCases] " + feature.file() + ": case ID " + id
                            + " has a placeholder other than " + PRODUCT_PLACEHOLDER);
                }
                cases.add(new FeatureCase(id, rowId, channelDir, featureName));
            }
        }
        return cases;
    }
}
