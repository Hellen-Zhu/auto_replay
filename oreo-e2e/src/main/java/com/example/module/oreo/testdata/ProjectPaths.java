package com.example.module.oreo.testdata;

import java.io.IOException;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;

/**
 * Finds the {@code oreo-e2e} folder (the one holding {@code pom.xml}) from the classpath, so that files under
 * {@code src/test/resources} can be read and written whatever the working directory of a forked JVM.
 */
public final class ProjectPaths {

    public static final String PROPERTY = "oreo.project.dir";

    private ProjectPaths() {}

    /** {@code -Doreo.project.dir} when set; else derived from {@code target/test-classes/data} on the classpath. */
    public static Path projectRoot() {
        String dir = System.getProperty(PROPERTY);
        if (dir != null && !dir.isBlank()) {
            return Paths.get(dir.trim()).toAbsolutePath().normalize();
        }
        ClassLoader loader = Thread.currentThread().getContextClassLoader();
        if (loader == null) loader = ProjectPaths.class.getClassLoader();
        List<String> seen = new ArrayList<>();
        try {
            Enumeration<URL> urls = loader.getResources("data");
            while (urls.hasMoreElements()) {
                URL url = urls.nextElement();
                seen.add(url.toString());
                if (!"file".equals(url.getProtocol())) continue;
                Path dataDir = Paths.get(url.toURI());
                if (fits(dataDir)) return fromClasspathDataDir(dataDir);
            }
        } catch (IOException | URISyntaxException e) {
            throw new IllegalStateException("[ProjectPaths] cannot read the classpath: " + e.getMessage()
                    + "; set -D" + PROPERTY + "=<oreo-e2e folder>", e);
        }
        throw new IllegalStateException("[ProjectPaths] no target/test-classes/data folder on the classpath "
                + seen + "; set -D" + PROPERTY + "=<oreo-e2e folder>");
    }

    /** {@code <root>/target/test-classes/data} -> {@code <root>}. */
    public static Path fromClasspathDataDir(Path dataDir) {
        Path dir = dataDir.normalize();
        if (!fits(dir)) {
            throw new IllegalStateException("[ProjectPaths] " + dataDir + " is not <project>/target/test-classes/data;"
                    + " set -D" + PROPERTY + "=<oreo-e2e folder>");
        }
        return dir.getParent().getParent().getParent();
    }

    /** Normalized only, not made absolute: the caller passes an absolute path (a drive letter must not be added). */
    private static boolean fits(Path dataDir) {
        Path dir = dataDir.normalize();
        Path testClasses = dir.getParent();
        Path target = testClasses == null ? null : testClasses.getParent();
        return target != null && target.getParent() != null
                && "data".equals(String.valueOf(dir.getFileName()))
                && "test-classes".equals(String.valueOf(testClasses.getFileName()))
                && "target".equals(String.valueOf(target.getFileName()));
    }
}
