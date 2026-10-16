package com.example.module.oreo.testdata;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Optional;

/**
 * Recorded API responses: {@code data/api/expected/<event>/<caseId>.json} in the source tree, so that a
 * recording survives {@code mvn clean} and shows in {@code git diff}.
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
