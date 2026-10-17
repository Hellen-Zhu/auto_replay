package com.example.module.oreo.testdata;

import org.junit.Test;

import java.nio.file.Path;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class FeatureFileTest {

    private static FeatureFile parse(String text) {
        return FeatureFile.parse(Path.of("x.feature"), text);
    }

    @Test
    public void readsBlocksTagsAndExamples() {
        FeatureFile f = parse(""
                + "@api\n"
                + "Feature: X\n"
                + "\n"
                + "  @ADO#positive @capability#create\n"
                + "  Scenario Outline: [TC-X-<product_type>-API-001] t\n"
                + "    Given s\n"
                + "\n"
                + "    @ex\n"
                + "    Examples:\n"
                + "      | product_type |\n"
                + "      | FX_TRF       |\n");
        assertEquals(2, f.blocks().size());

        FeatureFile.Block feature = f.blocks().get(0);
        assertEquals(FeatureFile.Kind.FEATURE, feature.kind());
        assertEquals(List.of("@api"), feature.tags());
        assertNull(feature.rowId());

        FeatureFile.Block outline = f.blocks().get(1);
        assertEquals(FeatureFile.Kind.OUTLINE, outline.kind());
        assertEquals(4, outline.line());
        assertEquals(List.of("@ADO#positive", "@capability#create"), outline.tags());
        assertEquals("TC-X-<product_type>-API-001", outline.rowId());
        assertEquals(1, outline.examples().size());

        FeatureFile.Table table = outline.examples().get(0);
        assertEquals(List.of("@ex"), table.tags());
        assertEquals(9, table.headerLine());
        assertEquals(10, table.lastLine());
        assertEquals("      ", table.indent());
        assertEquals(List.of("product_type"), table.header());
        assertEquals(List.of(List.of("FX_TRF")), table.rows());
        assertEquals(List.of("FX_TRF"), table.column("product_type"));
        assertEquals(List.of(), table.column("other"));
    }

    @Test
    public void tagsOverSeveralLinesBelongToTheNextBlock() {
        FeatureFile f = parse(""
                + "  @a\n"
                + "  @b @c\n"
                + "\n"
                + "  # note\n"
                + "  Scenario: [TC-X-API-002] t\n");
        assertEquals(1, f.blocks().size());
        FeatureFile.Block scenario = f.blocks().get(0);
        assertEquals(FeatureFile.Kind.SCENARIO, scenario.kind());
        assertEquals(4, scenario.line());
        assertEquals(List.of("@a", "@b", "@c"), scenario.tags());
        assertEquals("TC-X-API-002", scenario.rowId());
    }

    @Test
    public void docStringLinesAreNotTagsOrTables() {
        FeatureFile f = parse(""
                + "Feature: X\n"
                + "  Scenario: [TC-X-API-003] t\n"
                + "    Given a body\n"
                + "      \"\"\"\n"
                + "      @x\n"
                + "      Examples:\n"
                + "      | y |\n"
                + "      ```\n"
                + "      \"\"\"\n"
                + "    And another body\n"
                + "      ```json\n"
                + "      @z\n"
                + "      \"\"\"\n"
                + "      ```\n"
                + "  Scenario: [TC-X-API-004] u\n"
                + "    Given s\n");
        assertEquals(3, f.blocks().size());
        assertEquals(List.of(), f.blocks().get(1).tags());
        assertEquals(List.of(), f.blocks().get(1).examples());
        assertEquals(List.of(), f.blocks().get(2).tags());
        assertEquals("TC-X-API-004", f.blocks().get(2).rowId());
    }

    @Test
    public void rendersBackTheSameText() {
        List<String> lines = List.of("Feature: X", "  Scenario: [TC-X-API-001] t", "    Given s");
        for (String sep : List.of("\n", "\r\n")) {
            String body = String.join(sep, lines);
            for (String text : List.of(body + sep, body)) {
                FeatureFile f = parse(text);
                assertEquals(lines, f.lines());
                assertEquals(text, f.render(f.lines()));
            }
        }
    }

    @Test
    public void bomIsKept() {
        String text = "﻿@api\nFeature: X\n";
        FeatureFile f = parse(text);
        assertEquals(List.of("@api"), f.blocks().get(0).tags());
        assertTrue(f.render(f.lines()).startsWith("﻿"));
        assertEquals(text, f.render(f.lines()));
    }
}
