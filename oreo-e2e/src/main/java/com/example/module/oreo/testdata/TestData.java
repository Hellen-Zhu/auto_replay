package com.example.module.oreo.testdata;

/**
 * Test data of a case and setup payloads, read from {@code data/} on the classpath.
 *
 * <ul>
 *   <li>{@code data/<api|ui>/common.json}: shared blocks, used by name ({@code "use"});</li>
 *   <li>{@code data/<api|ui>/<event>.json}: {@code defaults}, {@code byProduct}, {@code cases} (rows);</li>
 *   <li>{@code data/setup/<name>.json}: one payload per file ({@code request} / {@code response}, {@code extends}).</li>
 * </ul>
 *
 * Layers of a case, each optional: defaults, byProduct[P], the case's row, the row's byProduct[P].
 */
public final class TestData {

    private static final TestDataRepository DEFAULT = new TestDataRepository("data/");

    private TestData() {}

    /** The merged data of a case; a case without a row runs on the defaults, a case without an event file has none. */
    public static CaseData forCase(String caseId) {
        return DEFAULT.forCase(caseId);
    }

    /** The setup payload {@code data/setup/<name>.json}. */
    public static SetupData setup(String name) {
        return DEFAULT.setup(name);
    }
}
