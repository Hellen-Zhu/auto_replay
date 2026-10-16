package com.example.module.oreo.testdata;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class FeatureCasesTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private Path root() {
        return tmp.getRoot().toPath();
    }

    private void feature(String channelDir, String name, String text) throws IOException {
        Path file = root().resolve(channelDir).resolve("trading").resolve(name + ".feature");
        Files.createDirectories(file.getParent());
        Files.write(file, text.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    public void expandsOutlineOverEveryExamplesTable() throws IOException {
        feature("api", "x", ""
                + "Feature: X\n"
                + "  @api\n"
                + "  Scenario Outline: [TC-X-<product_type>-API-001] creates a <product_type> trade\n"
                + "    Given a step for '<product_type>'\n"
                + "    Examples:\n"
                + "      | product_type |\n"
                + "      | FX_TRF       |\n"
                + "      | FX_PSCRIPT   |\n"
                + "    Examples: more\n"
                + "      | other | product_type   |\n"
                + "      | a     | FX_PSCRIPT_TRF |\n");
        List<FeatureCases.FeatureCase> cases = FeatureCases.load(root());
        assertEquals(List.of("TC-X-FX_TRF-API-001", "TC-X-FX_PSCRIPT-API-001", "TC-X-FX_PSCRIPT_TRF-API-001"),
                cases.stream().map(FeatureCases.FeatureCase::caseId).toList());
        for (FeatureCases.FeatureCase c : cases) {
            assertEquals("TC-X-<product_type>-API-001", c.rowId());
            assertEquals("api", c.channelDir());
            assertEquals("x", c.featureName());
        }
    }

    @Test
    public void plainScenarioIsOneCase() throws IOException {
        feature("api", "x", ""
                + "Feature: X\n"
                + "  Scenario: [TC-X-API-004] rejects a trade without counterparty\n"
                + "    Given a step\n");
        assertEquals(List.of(new FeatureCases.FeatureCase("TC-X-API-004", "TC-X-API-004", "api", "x")),
                FeatureCases.load(root()));
    }

    @Test
    public void ignoresScenarioWithoutCaseId() throws IOException {
        feature("ui", "y", ""
                + "Feature: Y\n"
                + "  Scenario: a scenario without an ID\n"
                + "    Given a step\n");
        assertTrue(FeatureCases.load(root()).isEmpty());
    }
}
