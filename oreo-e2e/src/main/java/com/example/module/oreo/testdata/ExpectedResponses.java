package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * Recorded API responses: {@code data/api/expected/<event>/<caseId>.json} in the source tree, so that a
 * recording survives {@code mvn clean} and shows in {@code git diff}. A file holds the response in full, or a
 * patch on a base case of the same folder: {@code {"_base": "<case ID>", "_patch": [<ops>]}} (see {@link JsonPatch}).
 */
public final class ExpectedResponses {

    public static final String ENV = "OREO_EXPECTED";
    public static final String PROPERTY = "oreo.expected";
    private static final String UPDATE = "update";

    private final Path root;

    public ExpectedResponses(Path expectedRoot) {
        this.root = expectedRoot;
    }

    /** The files of this project: {@code <project>/src/test/resources/data/api/expected}. */
    public static ExpectedResponses standard() {
        return new ExpectedResponses(ProjectPaths.projectRoot().resolve("src/test/resources/data/api/expected"));
    }

    public Path fileFor(CaseId id) {
        return root.resolve(id.eventFile()).resolve(id.raw() + ".json");
    }

    /** The recorded response, line ends normalized to {@code \n}; empty when the case has none yet. */
    public Optional<String> read(CaseId id) {
        Path file = fileFor(id);
        if (!Files.isRegularFile(file)) return Optional.empty();
        try {
            return Optional.of(Files.readString(file, StandardCharsets.UTF_8).replace("\r\n", "\n"));
        } catch (IOException e) {
            throw new UncheckedIOException("[ExpectedResponses] cannot read " + file, e);
        }
    }

    /** A file of the patch form: an object whose keys are exactly {@code _base} and {@code _patch}. */
    public static boolean isPatch(JsonNode json) {
        return json.isObject() && json.size() == 2 && json.has("_base") && json.has("_patch");
    }

    /**
     * The expected response of a case in full ({@code json}, pretty-printed), the file it comes from and, for a
     * patch, the base it builds on ({@code null} for a full file).
     */
    public record Resolved(String json, Path file, String base) {
        /** The file, and for a patch its base: for messages. */
        public String describe() {
            return base == null ? file.toString() : file + " (patch on " + base + ")";
        }
    }

    /**
     * The full form of the case's expected response: a full file as it is, a patch applied to its base's file.
     * Empty only when the case has no file; a patch that cannot be resolved is an {@link IllegalStateException}.
     */
    public Optional<Resolved> resolve(CaseId id) {
        Optional<String> text = read(id);
        if (text.isEmpty()) return Optional.empty();
        Path file = fileFor(id);
        JsonNode json = parse(text.get(), file);
        if (!isPatch(json)) {
            return Optional.of(new Resolved(Json.pretty(json), file, null));
        }
        if (!json.get("_base").isTextual() || !json.get("_patch").isArray()) {
            throw new IllegalStateException("[ExpectedResponses] " + file
                    + " is not a patch file: _base must be text and _patch an array");
        }
        String base = json.get("_base").asText();
        CaseId baseId;
        try {
            baseId = CaseId.parse(base);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("[ExpectedResponses] " + file + " builds on " + base
                    + ", which is not a case ID: " + e.getMessage(), e);
        }
        if (!baseId.eventFile().equals(id.eventFile()) || !baseId.channel().equals(id.channel())) {
            throw new IllegalStateException("[ExpectedResponses] " + file + " builds on " + base
                    + ", a case of another event or channel");
        }
        Path baseFile = fileFor(baseId);
        String baseText = read(baseId).orElseThrow(() -> new IllegalStateException("[ExpectedResponses] " + file
                + " builds on " + base + ", which has no file " + baseFile));
        JsonNode baseJson = parse(baseText, baseFile);
        if (isPatch(baseJson)) {
            throw new IllegalStateException("[ExpectedResponses] " + file + " builds on " + base
                    + ", which is itself a patch: run CompactExpectedFiles");
        }
        JsonNode full = JsonPatch.apply(baseJson, json.get("_patch"), file.getFileName().toString());
        return Optional.of(new Resolved(Json.pretty(full), file, base));
    }

    private static JsonNode parse(String text, Path file) {
        try {
            return Json.parse(text);
        } catch (IllegalStateException e) {
            throw new IllegalStateException("[ExpectedResponses] " + file + ": " + e.getMessage(), e);
        }
    }

    /** The event folders under the root, sorted; empty when there is no root yet. */
    public List<String> events() {
        if (!Files.isDirectory(root)) return List.of();
        try (Stream<Path> list = Files.list(root)) {
            return list.filter(Files::isDirectory).map(p -> p.getFileName().toString()).sorted().toList();
        } catch (IOException e) {
            throw new UncheckedIOException("[ExpectedResponses] cannot list " + root, e);
        }
    }

    /** The cases with a file in {@code <root>/<eventFile>/}, sorted by file name. */
    public List<CaseId> cases(String eventFile) {
        Path folder = root.resolve(eventFile);
        if (!Files.isDirectory(folder)) return List.of();
        List<Path> files;
        try (Stream<Path> list = Files.list(folder)) {
            files = list.filter(p -> p.getFileName().toString().endsWith(".json") && Files.isRegularFile(p))
                    .sorted().toList();
        } catch (IOException e) {
            throw new UncheckedIOException("[ExpectedResponses] cannot list " + folder, e);
        }
        return files.stream().map(file -> {
            String name = file.getFileName().toString().replaceFirst("\\.json$", "");
            try {
                return CaseId.parse(name);
            } catch (IllegalArgumentException e) {
                throw new IllegalStateException("[ExpectedResponses] " + file + ": the file name is not a case ID: "
                        + e.getMessage(), e);
            }
        }).toList();
    }

    /** Writes the response of a case (UTF-8, {@code \n} line ends), creating its folder. */
    public void write(CaseId id, String json) {
        Path file = fileFor(id);
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(file, json.replace("\r\n", "\n"), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("[ExpectedResponses] cannot write " + file, e);
        }
    }

    /** {@code OREO_EXPECTED=update} or {@code -Doreo.expected=update}: record instead of compare. */
    public static boolean updateMode() {
        return updateMode(System.getenv(ENV), System.getProperty(PROPERTY));
    }

    /**
     * {@code true} when either value is {@code update} (any case); {@code false} when both are unset or blank.
     * Any other value is an error, so that a typo never silently turns into a strict run.
     */
    public static boolean updateMode(String env, String prop) {
        boolean update = check(ENV, env);
        return check("-D" + PROPERTY, prop) || update;
    }

    private static boolean check(String name, String value) {
        if (value == null || value.isBlank()) return false;
        if (value.trim().toLowerCase(Locale.ROOT).equals(UPDATE)) return true;
        throw new IllegalStateException("[ExpectedResponses] " + name + "=" + value
                + " is not a mode: use '" + UPDATE + "' to record the expected responses again, or leave it unset");
    }
}
