package com.example.module.oreo.testdata;

import net.javacrumbs.jsonunit.JsonAssert;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ExpectedResponsesTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private Path root;
    private ExpectedResponses expected;
    private final CaseId id = CaseId.parse("TC-TRADE-CREATION-FX_TRF-API-001");

    @Before
    public void setUp() {
        root = tmp.getRoot().toPath();
        expected = new ExpectedResponses(root);
    }

    @Test
    public void fileForUsesEventFolder() {
        assertEquals(root.resolve("trade_creation").resolve("TC-TRADE-CREATION-FX_TRF-API-001.json"),
                expected.fileFor(id));
    }

    @Test
    public void writeThenRead() throws IOException {
        String json = "{\n  \"a\": 1\n}\n";
        expected.write(id, json);
        assertEquals(json, expected.read(id).orElseThrow());
        String onDisk = new String(Files.readAllBytes(expected.fileFor(id)), StandardCharsets.UTF_8);
        assertFalse(onDisk.contains("\r"));
    }

    @Test
    public void readMissingIsEmpty() {
        assertTrue(expected.read(id).isEmpty());
    }

    @Test
    public void readsCrlfFile() throws IOException {
        Path file = expected.fileFor(id);
        Files.createDirectories(file.getParent());
        Files.write(file, "{\r\n  \"a\": 1\r\n}\r\n".getBytes(StandardCharsets.UTF_8));
        JsonAssert.assertJsonEquals(expected.read(id).orElseThrow(), "{\"a\":1}");
    }

    @Test
    public void updateModeSwitch() {
        assertFalse(ExpectedResponses.updateMode(null, null));
        assertTrue(ExpectedResponses.updateMode("update", null));
        assertTrue(ExpectedResponses.updateMode(null, "UPDATE"));
        assertFalse(ExpectedResponses.updateMode("", null));
    }

    @Test(expected = IllegalStateException.class)
    public void rejectsUnknownMode() {
        ExpectedResponses.updateMode("updat", null);
    }
}
