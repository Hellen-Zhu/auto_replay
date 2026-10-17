package com.example.module.oreo.testdata;

import org.junit.Assume;
import org.junit.Test;

/**
 * Writes the {@code Examples} of every product Scenario Outline from the registry ({@link ProductDatFiles}): one row
 * per product of the Outline's {@code @capability#<name>} tag. Run after adding a product or a capability, then
 * review the diff: {@code mvn test -Dtest=SyncProductExamples -Doreo.sync=all}. Skipped when {@code oreo.sync} is
 * not set. Nothing is written when any Outline has a problem.
 */
public class SyncProductExamples {

    @Test
    public void sync() {
        String scope = System.getProperty("oreo.sync");
        Assume.assumeTrue("set -Doreo.sync=all", scope != null && !scope.isBlank());
        if (!scope.trim().equals("all")) {
            throw new AssertionError("-Doreo.sync=" + scope + ": the only value is all");
        }

        ProductExamples.Plan plan = ProductExamples.plan(
                ProjectPaths.projectRoot().resolve("src/test/resources/features"), ProductExamples::registryProducts);
        if (!plan.errors().isEmpty()) {
            throw new AssertionError("Nothing written, " + plan.errors().size() + " problem(s):\n  "
                    + String.join("\n  ", plan.errors()));
        }
        ProductExamples.write(plan);

        StringBuilder out = new StringBuilder();
        int changed = 0;
        for (ProductExamples.Entry entry : plan.entries()) {
            out.append(entry.file()).append(' ').append(entry.rowId()).append(": ").append(entry.note()).append('\n');
            if (entry.changed()) changed++;
        }
        plan.warnings().forEach(w -> out.append("[warn] ").append(w).append('\n'));
        out.append(changed).append(" Outline(s) rewritten: review git diff, then commit.");
        System.out.println(out);
    }
}
