package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * Rewrites the expected files of an event so that a variant holds only its patch on the base case its data
 * declares ({@code expectedBase}), and a case without a base its full response:
 *
 * <ol>
 *   <li>every file is resolved to its full form first, from the files as they are;</li>
 *   <li>a case with base {@code B} gets the patch from {@code B}'s full form to its own, written only when its
 *       text is shorter than the full form's;</li>
 *   <li>any error (a base without a file, a base with a base of its own, a patch that does not apply, case data
 *       that does not load) stops the compaction before a file is written;</li>
 *   <li>a file whose text does not change is not rewritten.</li>
 * </ol>
 *
 * Recording always writes full files; this runs afterwards, in one JVM ({@code CompactExpectedFiles}).
 */
public final class ExpectedCompaction {

    /** One file: its text before and after, and its form after ({@code full (no base)}, {@code patch on ...}). */
    public record Entry(CaseId id, String before, String after, String note) {
        public boolean changed() {
            return !before.equals(after);
        }
    }

    /** The planned files of one event and the errors that stop it. */
    public record Plan(String eventFile, List<Entry> entries, List<String> errors) {}

    private ExpectedCompaction() {}

    /**
     * Plans the compaction of {@code <root>/<eventFile>/}; writes nothing.
     *
     * @param declaredBase the base case ID a case declares, {@code null} for none (e.g. {@code CaseData::expectedBase})
     */
    public static Plan plan(ExpectedResponses files, String eventFile, Function<CaseId, String> declaredBase) {
        List<String> errors = new ArrayList<>();
        List<CaseId> ids;
        try {
            ids = files.cases(eventFile);
        } catch (RuntimeException e) {
            return new Plan(eventFile, List.of(), List.of(e.getMessage()));
        }
        Map<String, String> before = new LinkedHashMap<>();
        Map<String, JsonNode> full = new HashMap<>();
        Map<String, String> bases = new HashMap<>();
        for (CaseId id : ids) {
            before.put(id.raw(), files.read(id).orElseThrow());
            try {
                full.put(id.raw(), Json.parse(files.resolve(id).orElseThrow().json()));
            } catch (RuntimeException e) {
                errors.add(id.raw() + ": " + e.getMessage());
            }
            try {
                bases.put(id.raw(), declaredBase.apply(id));
            } catch (RuntimeException e) {
                errors.add(id.raw() + ": its case data does not load: " + e.getMessage());
            }
        }

        List<Entry> entries = new ArrayList<>();
        for (CaseId id : ids) {
            JsonNode own = full.get(id.raw());
            if (own == null || !bases.containsKey(id.raw())) continue; // error listed above
            String old = before.get(id.raw());
            String base = bases.get(id.raw());
            if (base == null || base.equals(id.raw())) {
                entries.add(new Entry(id, old, Json.pretty(own), "full (no base)"));
                continue;
            }
            String problem = baseProblem(files, eventFile, base, before, full, bases);
            if (problem != null) {
                errors.add(id.raw() + ": its base " + base + " " + problem);
                continue;
            }
            ArrayNode ops = JsonPatch.diff(full.get(base), own);
            ObjectNode patch = Json.MAPPER.createObjectNode();
            patch.put("_base", base);
            patch.set("_patch", ops);
            String patchText = Json.pretty(patch);
            String fullText = Json.pretty(own);
            if (patchText.length() < fullText.length()) {
                entries.add(new Entry(id, old, patchText, "patch on " + base + ", " + ops.size() + " ops"));
            } else {
                entries.add(new Entry(id, old, fullText, "full (patch not shorter)"));
            }
        }
        return new Plan(eventFile, List.copyOf(entries), List.copyOf(errors));
    }

    /** Why {@code base} cannot be a base, or {@code null}; a base whose own file failed is reported for that file. */
    private static String baseProblem(ExpectedResponses files, String eventFile, String base,
                                      Map<String, String> before, Map<String, JsonNode> full,
                                      Map<String, String> bases) {
        CaseId baseId;
        try {
            baseId = CaseId.parse(base);
        } catch (IllegalArgumentException e) {
            return "is not a case ID: " + e.getMessage();
        }
        if (!baseId.eventFile().equals(eventFile) || !baseId.channel().equals("API")) {
            return "is in another folder: a base is an API case of " + eventFile;
        }
        if (!before.containsKey(base)) {
            return "has no file " + files.fileFor(baseId) + " (record it first)";
        }
        if (!full.containsKey(base) || !bases.containsKey(base)) {
            return "has a problem of its own (listed for it)";
        }
        String baseOfBase = bases.get(base);
        if (baseOfBase != null && !baseOfBase.equals(base)) {
            return "declares a base of its own (" + baseOfBase + "): a base is a full file";
        }
        return null;
    }

    /** Writes the changed files of {@code plan}; when it has errors, writes nothing and lists them. */
    public static void write(ExpectedResponses files, Plan plan) {
        if (!plan.errors().isEmpty()) {
            throw new IllegalStateException("[ExpectedCompaction] " + plan.eventFile() + ": nothing written, "
                    + plan.errors().size() + " problem(s):\n  " + String.join("\n  ", plan.errors()));
        }
        for (Entry entry : plan.entries()) {
            if (entry.changed()) files.write(entry.id(), entry.after());
        }
    }
}
