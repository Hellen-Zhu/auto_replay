package com.example.module.oreo.testdata;

import com.example.module.oreo.testdata.FeatureCases.FeatureCase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.BeforeClass;
import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.fail;

/**
 * Offline checks of the test data against the feature files and the code (spec section 10). No environment
 * needed: {@code mvn test -Dtest=TestDataValidationTest}.
 */
public class TestDataValidationTest {

    /** Setup files the code names but that do not exist yet: not covered for now (user, 2026-10-16). */
    private static final Set<String> KNOWN_MISSING = Set.of("trade-cancellation", "trade-amendment");

    private static final String PLACEHOLDER = "${json-unit.";
    private static final Set<String> TYPE_PLACEHOLDERS =
            Set.of(ResponseMasker.ANY_STRING, ResponseMasker.ANY_NUMBER, ResponseMasker.ANY_BOOLEAN);

    private static Path project;
    private static Path data;
    private static List<FeatureCase> featureCases;
    private static final TestDataRepository REPO = new TestDataRepository("data/");

    @BeforeClass
    public static void loadFeatures() {
        project = ProjectPaths.projectRoot();
        data = project.resolve("src/test/resources/data");
        featureCases = FeatureCases.load(project.resolve("src/test/resources/features"));
        assertFalse("no [TC-...] scenarios found in src/test/resources/features", featureCases.isEmpty());
    }

    // ── 10.1 ─────────────────────────────────────────────────────────────────

    @Test
    public void dataFilesAreWellFormed() throws IOException {
        List<String> errors = new ArrayList<>();
        for (String channelDir : List.of("api", "ui")) {
            for (Path file : jsonFiles(data.resolve(channelDir))) {
                String name = baseName(file);
                try {
                    if (name.equals("common")) {
                        REPO.validate(channelDir, null);
                    } else {
                        REPO.validate(channelDir, name);
                        checkDatFiles(file, errors);
                    }
                } catch (RuntimeException e) {
                    errors.add(e.getMessage());
                }
            }
        }
        for (Path file : jsonFiles(data.resolve("setup"))) {
            try {
                REPO.setup(baseName(file));
            } catch (RuntimeException e) {
                errors.add(e.getMessage());
            }
        }
        failOn(errors);
    }

    /** Every {@code byProduct} key (event file and rows) has its dat file on the classpath. */
    private static void checkDatFiles(Path file, List<String> errors) throws IOException {
        JsonNode event = Json.parse(Files.readString(file, StandardCharsets.UTF_8));
        Set<String> products = new TreeSet<>();
        event.path("byProduct").fieldNames().forEachRemaining(products::add);
        event.path("cases").forEach(row -> row.path("byProduct").fieldNames().forEachRemaining(products::add));
        for (String product : products) {
            String datPath = ProductDatFiles.valueOf(product).path();
            if (Thread.currentThread().getContextClassLoader().getResource(datPath) == null) {
                errors.add(file.getFileName() + ": byProduct " + product + " has no dat file " + datPath);
            }
        }
    }

    // ── 10.2 ─────────────────────────────────────────────────────────────────

    @Test
    public void everyFeatureCaseResolves() {
        List<String> errors = new ArrayList<>();
        for (FeatureCase c : featureCases) {
            try {
                CaseId id = CaseId.parse(c.caseId());
                if (!id.eventFile().equals(c.featureName())) {
                    errors.add(c.caseId() + ": event file " + id.eventFile() + ".json but the feature file is "
                            + c.featureName() + ".feature");
                }
                if (!id.channelDir().equals(c.channelDir())) {
                    errors.add(c.caseId() + ": channel " + id.channel() + " but the feature is under features/"
                            + c.channelDir());
                }
                TestData.forCase(c.caseId());
            } catch (RuntimeException e) {
                errors.add(c.caseId() + ": " + e.getMessage());
            }
        }
        failOn(errors);
    }

    // ── 10.3 ─────────────────────────────────────────────────────────────────

    @Test
    public void everyRowAndEventFileHasAFeature() throws IOException {
        List<String> errors = new ArrayList<>();
        for (String channelDir : List.of("api", "ui")) {
            for (Path file : jsonFiles(data.resolve(channelDir))) {
                String event = baseName(file);
                if (event.equals("common")) continue;
                List<FeatureCase> ofFile = featureCases.stream()
                        .filter(c -> c.channelDir().equals(channelDir) && c.featureName().equals(event))
                        .toList();
                if (ofFile.isEmpty()) {
                    errors.add("data/" + channelDir + "/" + event + ".json has no feature file " + event
                            + ".feature under features/" + channelDir);
                    continue;
                }
                JsonNode json = Json.parse(Files.readString(file, StandardCharsets.UTF_8));
                for (JsonNode row : json.path("cases")) {
                    String rowId = row.path("id").asText();
                    boolean used = ofFile.stream().anyMatch(c -> CaseId.parse(c.caseId()).matchesRow(rowId));
                    if (!used) {
                        errors.add("data/" + channelDir + "/" + event + ".json: row " + rowId
                                + " matches no scenario of " + event + ".feature");
                    }
                }
            }
        }
        failOn(errors);
    }

    // ── 10.4 ─────────────────────────────────────────────────────────────────

    @Test
    public void everyApiCaseHasItsExpectedFile() throws IOException {
        ExpectedResponses expected = ExpectedResponses.standard();
        List<String> errors = new ArrayList<>();
        Set<Path> wanted = new TreeSet<>();
        for (FeatureCase c : featureCases) {
            if (!c.channelDir().equals("api")) continue;
            Path file = expected.fileFor(CaseId.parse(c.caseId()));
            wanted.add(file.toAbsolutePath().normalize());
            if (!Files.isRegularFile(file)) {
                errors.add(c.caseId() + ": no expected file " + project.relativize(file)
                        + " (run the case to record it, review it, commit it)");
            }
        }
        Path root = data.resolve("api/expected");
        if (Files.isDirectory(root)) {
            try (Stream<Path> walk = Files.walk(root)) {
                for (Path file : walk.filter(p -> p.toString().endsWith(".json")).sorted().toList()) {
                    if (!wanted.contains(file.toAbsolutePath().normalize())) {
                        errors.add(project.relativize(file) + " belongs to no API case of the feature files");
                    }
                }
            }
        }
        failOn(errors);
    }

    // ── 10.5 ─────────────────────────────────────────────────────────────────

    @Test
    public void rulesAgreeWithExpectedFiles() {
        ExpectedResponses expected = ExpectedResponses.standard();
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        for (FeatureCase c : featureCases) {
            if (!c.channelDir().equals("api")) continue;
            CaseId id = CaseId.parse(c.caseId());
            String text = expected.read(id).orElse(null);
            if (text == null) continue; // reported by everyApiCaseHasItsExpectedFile
            JsonNode file = Json.parse(text);
            Map<String, String> rules = TestData.forCase(c.caseId()).dynamicFields();
            List<List<Object>> ruleSteps = new ArrayList<>();
            for (Map.Entry<String, String> rule : rules.entrySet()) {
                String label = c.caseId() + ": rule " + rule.getKey() + " = " + rule.getValue();
                List<Object> steps;
                try {
                    steps = ResponseMasker.parsePath(rule.getKey(), c.caseId());
                } catch (IllegalStateException e) {
                    errors.add(label + ": " + e.getMessage());
                    continue;
                }
                ruleSteps.add(steps);
                List<Hit> hits = new ArrayList<>();
                select(file, steps, 0, "", hits);
                if (hits.isEmpty()) {
                    errors.add(label + ": the path is not in the expected file");
                }
                for (Hit hit : hits) {
                    checkHit(label, rule.getValue(), hit, errors, warnings);
                }
            }
            placeholdersWithoutRule(c.caseId(), file, new ArrayList<>(), ruleSteps, warnings);
        }
        if (!warnings.isEmpty()) {
            System.out.println("[TestDataValidation] " + warnings.size() + " warning(s): placeholders from the"
                    + " converted old data, weaker than a recording (checklist of migration step 6):");
            warnings.forEach(w -> System.out.println("  " + w));
        }
        failOn(errors);
    }

    /** A value a rule path reaches in an expected file; {@code underPlaceholder}: an ancestor is a placeholder. */
    private record Hit(String path, JsonNode value, boolean underPlaceholder) {}

    private static void select(JsonNode node, List<Object> steps, int i, String at, List<Hit> out) {
        if (i == steps.size()) {
            out.add(new Hit(at, node, false));
            return;
        }
        if (isPlaceholder(node)) {
            out.add(new Hit(at, node, true));
            return;
        }
        Object step = steps.get(i);
        if (step instanceof String key) {
            if (node.isObject() && node.has(key)) {
                select(node.get(key), steps, i + 1, at.isEmpty() ? key : at + "." + key, out);
            }
        } else if (node.isArray()) {
            int from = ResponseMasker.isAny(step) ? 0 : (Integer) step;
            int to = ResponseMasker.isAny(step) ? node.size() : Math.min(from + 1, node.size());
            for (int n = from; n < to; n++) {
                select(node.get(n), steps, i + 1, at + "[" + n + "]", out);
            }
        }
    }

    private static void checkHit(String label, String rule, Hit hit, List<String> errors, List<String> warnings) {
        JsonNode value = hit.value();
        String at = " (at " + hit.path() + ")";
        if (hit.underPlaceholder()) {
            warnings.add(label + ": under the placeholder " + value.asText() + at + "; record again");
            return;
        }
        if (rule.equals("type")) {
            if (value.isNull() || TYPE_PLACEHOLDERS.contains(value.asText(""))) return;
            report(label + at, value, errors, warnings);
        } else if (rule.equals("ignore")) {
            if (ResponseMasker.IGNORE.equals(value.asText(""))) return;
            report(label + at, value, errors, warnings);
        } else if (rule.startsWith("regex:")) {
            if ((ResponseMasker.REGEX + rule.substring("regex:".length())).equals(value.asText(""))) return;
            report(label + at, value, errors, warnings);
        } else if (rule.equals("type-tree")) {
            if (isPlaceholder(value)) {
                warnings.add(label + at + ": the file has " + value.asText() + " instead of a typed tree");
                return;
            }
            List<String> plain = new ArrayList<>();
            plainLeaves(value, hit.path(), plain);
            if (!plain.isEmpty()) {
                errors.add(label + ": leaves without a placeholder " + plain + "; record again");
            }
        } else {
            errors.add(label + ": unknown rule (type, type-tree, regex:<pattern>, ignore)");
        }
    }

    /** No placeholder at all: an error (the rule was changed without recording); another placeholder: a warning. */
    private static void report(String label, JsonNode value, List<String> errors, List<String> warnings) {
        if (isPlaceholder(value)) {
            warnings.add(label + ": the file has " + value.asText() + ", not what this rule records");
        } else {
            errors.add(label + ": the file has the plain value " + Json.compact(value) + "; record again");
        }
    }

    private static void plainLeaves(JsonNode node, String at, List<String> out) {
        if (node.isObject()) {
            node.properties().forEach(e -> plainLeaves(e.getValue(), at + "." + e.getKey(), out));
        } else if (node.isArray()) {
            for (int i = 0; i < node.size(); i++) plainLeaves(node.get(i), at + "[" + i + "]", out);
        } else if (!node.isNull() && !TYPE_PLACEHOLDERS.contains(node.asText(""))) {
            out.add(at);
        }
    }

    /** Warns about every placeholder that no rule reaches (neither at, above nor below it). */
    private static void placeholdersWithoutRule(String caseId, JsonNode node, List<Object> at,
                                                List<List<Object>> rules, List<String> warnings) {
        if (isPlaceholder(node)) {
            boolean covered = rules.stream().anyMatch(r -> prefixMatches(r, at) || prefixMatches(at, r));
            if (!covered) {
                warnings.add(caseId + ": " + node.asText() + " at " + render(at) + " has no rule");
            }
            return;
        }
        if (node.isObject()) {
            node.properties().forEach(e -> {
                at.add(e.getKey());
                placeholdersWithoutRule(caseId, e.getValue(), at, rules, warnings);
                at.remove(at.size() - 1);
            });
        } else if (node.isArray()) {
            for (int i = 0; i < node.size(); i++) {
                at.add(i);
                placeholdersWithoutRule(caseId, node.get(i), at, rules, warnings);
                at.remove(at.size() - 1);
            }
        }
    }

    /** {@code true} when {@code prefix} (rule steps or a concrete path) matches the start of {@code path}. */
    private static boolean prefixMatches(List<Object> prefix, List<Object> path) {
        if (prefix.size() > path.size()) return false;
        for (int i = 0; i < prefix.size(); i++) {
            Object a = prefix.get(i);
            Object b = path.get(i);
            boolean index = (a instanceof Integer || ResponseMasker.isAny(a)) && (b instanceof Integer || ResponseMasker.isAny(b));
            boolean same = a.equals(b) || (index && (ResponseMasker.isAny(a) || ResponseMasker.isAny(b)));
            if (!same) return false;
        }
        return true;
    }

    private static String render(List<Object> path) {
        StringBuilder out = new StringBuilder();
        for (Object step : path) {
            if (step instanceof String key) {
                out.append(out.length() == 0 ? "" : ".").append(key);
            } else {
                out.append('[').append(step).append(']');
            }
        }
        return out.toString();
    }

    private static boolean isPlaceholder(JsonNode node) {
        return node.isTextual() && node.textValue().startsWith(PLACEHOLDER);
    }

    // ── 10.6 ─────────────────────────────────────────────────────────────────

    private static final Pattern SETUP_CALL = Pattern.compile("TestData\\.setup\\(\"([^\"]+)\"\\)");
    /** The provisioning helpers of TradeProvisioningSteps take the setup name as a string argument. */
    private static final Pattern PROVISIONING_CALL = Pattern.compile(
            "(?:submitTradeAsPendingApproval|provisionLiveTradeAs|provisionLifecycleEvent|submitAmendment)\\(([^;{]*)\\);");
    private static final Pattern NAME_LITERAL = Pattern.compile("\"([a-z0-9][a-z0-9-]*)\"");
    private static final Pattern STEP_TEXT = Pattern.compile("from test data '([^']+)'");

    @Test
    public void everyUsedSetupNameExists() throws IOException {
        Set<String> used = new TreeSet<>();
        for (Path file : files(project.resolve("src/main/java"), ".java")) {
            String text = Files.readString(file, StandardCharsets.UTF_8);
            if (file.toString().contains("testdata")) continue;
            collect(SETUP_CALL, text, used);
            Matcher call = PROVISIONING_CALL.matcher(text);
            while (call.find()) {
                collect(NAME_LITERAL, call.group(1), used);
            }
        }
        for (Path dir : List.of(project.resolve("src/main/resources/snippet"),
                project.resolve("src/test/resources/features"))) {
            for (Path file : files(dir, dir.endsWith("snippet") ? ".snippet" : ".feature")) {
                for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                    // A snippet's '@Given "^... from test data '([^']*)'$"' line defines the step (its regex is
                    // no name); a feature's '@' line holds tags. Only the other lines use a setup name.
                    if (line.trim().startsWith("@")) continue;
                    collect(STEP_TEXT, line, used);
                }
            }
        }
        used.removeIf(name -> name.startsWith("$"));
        assertFalse("no setup names found in the code", used.isEmpty());
        List<String> errors = new ArrayList<>();
        for (String name : used) {
            if (KNOWN_MISSING.contains(name)) continue;
            if (!Files.isRegularFile(data.resolve("setup").resolve(name + ".json"))) {
                errors.add("setup data '" + name + "' is used but data/setup/" + name + ".json does not exist");
            }
        }
        System.out.println("[TestDataValidation] setup names used: " + used + "; known missing: " + KNOWN_MISSING);
        failOn(errors);
    }

    private static void collect(Pattern pattern, String text, Set<String> out) {
        Matcher m = pattern.matcher(text);
        while (m.find()) out.add(m.group(1));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static List<Path> jsonFiles(Path dir) throws IOException {
        if (!Files.isDirectory(dir)) return List.of();
        try (Stream<Path> list = Files.list(dir)) {
            return list.filter(p -> p.getFileName().toString().endsWith(".json")).sorted().toList();
        }
    }

    private static List<Path> files(Path dir, String extension) throws IOException {
        if (!Files.isDirectory(dir)) return List.of();
        try (Stream<Path> walk = Files.walk(dir)) {
            return walk.filter(p -> p.getFileName().toString().endsWith(extension)).sorted().toList();
        }
    }

    private static String baseName(Path file) {
        return file.getFileName().toString().replaceFirst("\\.json$", "");
    }

    private static void failOn(List<String> errors) {
        if (!errors.isEmpty()) {
            fail(errors.size() + " problem(s):\n  " + String.join("\n  ", errors));
        }
    }
}
