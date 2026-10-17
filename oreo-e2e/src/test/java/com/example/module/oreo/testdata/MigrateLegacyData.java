package com.example.module.oreo.testdata;

import org.junit.Assume;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

/**
 * Migrates the old YAML test data to the layered JSON files (spec
 * {@code 2026-10-17-oreo-e2e-legacy-data-migration-design.md}): {@code mvn test -Dtest=MigrateLegacyData
 * -Doreo.migrate=setup} (the setup payloads, once), {@code =<feature name>} (one feature, e.g.
 * {@code trade_cancellation}) or {@code =all} (plans every feature not migrated yet). Prints the plan and writes
 * nothing unless {@code -Doreo.migrate.write=true}; nothing is written when the plan has a stop. Skipped when
 * {@code oreo.migrate} is not set.
 */
public class MigrateLegacyData {

    private static final String NEXT =
            "Next: review, capability, SyncProductExamples, CompactExpectedFiles (API), offline tests";
    private static final String WRITE_HINT = "Add -Doreo.migrate.write=true to write.";

    @Test
    public void migrate() {
        String scope = System.getProperty("oreo.migrate");
        Assume.assumeTrue("set -Doreo.migrate=<feature name>|setup|all", scope != null && !scope.isBlank());
        boolean write = "true".equals(System.getProperty("oreo.migrate.write"));
        System.out.println(run(LegacyMigration.Sources.standard(), scope.trim(), write));
    }

    /** The text to print; an {@link AssertionError} when the plan has a stop (nothing written). */
    static String run(LegacyMigration.Sources sources, String scope, boolean write) {
        if (sources.legacy().isEmpty()) {
            throw new AssertionError("no YAML file under data/: nothing to migrate");
        }
        return switch (scope) {
            case "all" -> all(sources, write);
            case "setup" -> setup(sources, write);
            default -> feature(sources, scope, write);
        };
    }

    private static String feature(LegacyMigration.Sources sources, String name, boolean write) {
        LegacyMigration.Plan plan = LegacyMigration.plan(sources, name);
        if (plan.stopped()) throw nothingWritten(plan.stops());
        if (!write) return plan.report() + WRITE_HINT;
        try {
            LegacyMigration.write(sources, plan);
        } catch (IllegalStateException e) {
            throw nothingWritten(List.of(e.getMessage()));
        }
        return plan.report(true) + written(plan.files()) + NEXT;
    }

    private static String setup(LegacyMigration.Sources sources, boolean write) {
        LegacyMigration.SetupPlan plan = LegacyMigration.planSetup(sources);
        if (plan.stopped()) throw nothingWritten(plan.stops());
        if (!write) return plan.report() + WRITE_HINT;
        LegacyMigration.writeSetup(sources, plan);
        List<String> files = new ArrayList<>();
        plan.files().stream().filter(f -> f.text() != null)
                .forEach(f -> files.add("data/setup/" + f.name() + ".json"));
        int setupFiles = files.size();
        plan.rewrites().keySet().forEach(path ->
                files.add(sources.project().relativize(path).toString().replace('\\', '/')));
        return plan.report(true) + written(files) + setupFiles + " setup file(s) written, " + plan.renames().size()
                + " use(s) renamed";
    }

    /** Plan decision 7: one line per feature without its event file, then the totals; never fails. */
    private static String all(LegacyMigration.Sources sources, boolean write) {
        if (write) {
            throw new AssertionError("-Doreo.migrate=all only plans; migrate one feature at a time");
        }
        StringBuilder out = new StringBuilder();
        int ready = 0;
        int stopped = 0;
        int nothing = 0;
        for (String name : LegacyMigration.featureNames(sources)) {
            LegacyMigration.Plan plan;
            try {
                plan = LegacyMigration.plan(sources, name);
            } catch (RuntimeException e) {
                out.append(name).append(": stopped: ").append(e).append('\n');
                stopped++;
                continue;
            }
            if (plan.stopped()) {
                int more = plan.stops().size() - 1;
                out.append(name).append(": stopped: ").append(plan.stops().get(0))
                        .append(more > 0 ? " (+" + more + " more)" : "").append('\n');
                stopped++;
            } else if (plan.files().isEmpty()) {
                out.append(name).append(": nothing to migrate\n");
                nothing++;
            } else {
                out.append(name).append(": ready (").append(summary(plan.files())).append(")\n");
                ready++;
            }
        }
        return out.append(ready).append(" to migrate, ").append(stopped).append(" stopped, ").append(nothing)
                .append(" with nothing to migrate").toString();
    }

    /** The event files, then the number of expected files. */
    private static String summary(List<String> files) {
        List<String> parts = new ArrayList<>(files.stream().filter(f -> !f.startsWith("data/api/expected/")).toList());
        long expected = files.size() - parts.size();
        if (expected > 0) parts.add(expected + " expected file(s)");
        return String.join(", ", parts);
    }

    private static String written(List<String> files) {
        if (files.isEmpty()) return "Written: nothing\n";
        return "Written: " + files.size() + " file(s)\n  " + String.join("\n  ", files) + "\n";
    }

    private static AssertionError nothingWritten(List<String> stops) {
        return new AssertionError("Nothing written, " + stops.size() + " stop(s):\n  " + String.join("\n  ", stops));
    }
}
