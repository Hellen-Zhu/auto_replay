package com.example.module.oreo.testdata;

import org.junit.Test;

import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.Assert.assertEquals;

public class ProjectPathsTest {

    @Test
    public void resolvesRootFromTestClassesLayout() {
        Path root = Paths.get("/x/oreo-e2e");
        assertEquals(root, ProjectPaths.fromClasspathDataDir(root.resolve("target/test-classes/data")));
    }

    @Test(expected = IllegalStateException.class)
    public void rejectsOtherLayouts() {
        ProjectPaths.fromClasspathDataDir(Paths.get("/x/lib/data"));
    }
}
