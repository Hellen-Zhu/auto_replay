package com.example.module.oreo.testdata;

import org.junit.Assume;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

/**
 * Compacts the recorded API responses (spec section 7.5): a variant's file becomes a patch on the base case its
 * data declares, a case without a base keeps its full response. Run after a recording, before the review:
 * {@code mvn test -Dtest=CompactExpectedFiles -Doreo.compact=trade_creation} (one event) or {@code =all}.
 * Skipped when {@code oreo.compact} is not set. Nothing is written when any event has a problem.
 */
public class CompactExpectedFiles {

    @Test
    public void compact() {
        String scope = System.getProperty("oreo.compact");
        Assume.assumeTrue("set -Doreo.compact=<event>|all", scope != null && !scope.isBlank());
        ExpectedResponses files = ExpectedResponses.standard();
        List<String> known = files.events();
        List<String> events = scope.trim().equals("all") ? known : List.of(scope.trim());
        if (!known.containsAll(events)) {
            throw new AssertionError("-Doreo.compact=" + scope + ": no such folder of expected files; known: "
                    + known + " or all");
        }

        List<ExpectedCompaction.Plan> plans = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        for (String event : events) {
            ExpectedCompaction.Plan plan = ExpectedCompaction.plan(files, event,
                    id -> TestData.forCase(id.raw()).expectedBase());
            plans.add(plan);
            plan.errors().forEach(e -> errors.add(event + ": " + e));
        }
        if (!errors.isEmpty()) {
            throw new AssertionError("Nothing written, " + errors.size() + " problem(s):\n  "
                    + String.join("\n  ", errors));
        }

        StringBuilder out = new StringBuilder();
        int changed = 0;
        for (ExpectedCompaction.Plan plan : plans) {
            ExpectedCompaction.write(files, plan);
            out.append(plan.eventFile()).append(":\n");
            for (ExpectedCompaction.Entry entry : plan.entries()) {
                out.append("  ").append(entry.id().raw()).append(".json: ").append(entry.note())
                        .append(entry.changed() ? "" : " (unchanged)").append('\n');
                if (entry.changed()) changed++;
            }
        }
        out.append(changed).append(" file(s) rewritten: review git diff, then commit.");
        System.out.println(out);
    }
}
