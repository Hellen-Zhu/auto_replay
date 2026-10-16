package com.example.module.oreo.testdata;

import org.junit.Assume;
import org.junit.Test;

import java.util.Map;
import java.util.Optional;

/**
 * Prints the data of one case without running it:
 * {@code mvn test -Dtest=CaseDataLookup -Doreo.case=TC-TRADE-CREATION-FX_PSCRIPT_TRF-API-002}.
 * Skipped when {@code oreo.case} is not set.
 */
public class CaseDataLookup {

    @Test
    public void printCase() {
        String caseId = System.getProperty("oreo.case");
        Assume.assumeTrue("set -Doreo.case=<case ID>", caseId != null && !caseId.isBlank());
        CaseId id = CaseId.parse(caseId.trim());
        CaseData data = TestData.forCase(id.raw());

        StringBuilder out = new StringBuilder();
        out.append("Case: ").append(id.raw()).append('\n');
        out.append("Data file: data/").append(id.channelDir()).append('/').append(id.eventFile()).append(".json\n");
        out.append("Layers:\n");
        if (data.layers().isEmpty()) out.append("  (none)\n");
        for (int i = 0; i < data.layers().size(); i++) {
            out.append("  ").append(i + 1).append(". ").append(data.layers().get(i)).append('\n');
        }
        out.append("Request:\n").append(Json.pretty(Json.parse(data.request())));
        if (id.channelDir().equals("api")) {
            out.append("dynamicFields:\n");
            if (data.dynamicFields().isEmpty()) out.append("  (none)\n");
            for (Map.Entry<String, String> rule : data.dynamicFields().entrySet()) {
                out.append("  ").append(rule.getKey()).append(" = ").append(rule.getValue()).append('\n');
            }
            out.append("expectedBase: ").append(data.expectedBase() == null ? "(none)" : data.expectedBase())
                    .append('\n');
            ExpectedResponses expected = ExpectedResponses.standard();
            Optional<ExpectedResponses.Resolved> resolved = expected.resolve(id);
            if (resolved.isEmpty()) {
                out.append("Expected file: ").append(expected.fileFor(id))
                        .append(" (not recorded: recorded at the first run)\n");
            } else {
                out.append("Expected file: ").append(resolved.get().describe()).append('\n');
                out.append("Expected response (full form):\n").append(resolved.get().json());
            }
        }
        System.out.println(out);
    }
}
