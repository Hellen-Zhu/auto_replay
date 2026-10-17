package com.example.module.oreo.testdata;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import static com.example.module.oreo.testdata.Capability.CREATE;
import static com.example.module.oreo.testdata.Capability.STEP_IN_FULL;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class ProductExamplesTest {

    private static final String ID = "TC-X-<product_type>-API-001";
    private static final String FILE = "api/trading/x.feature";
    private static final String HEAD = ""
            + "@api\n"
            + "Feature: X\n"
            + "\n"
            + "  @ADO#positive @capability#create\n"
            + "  Scenario Outline: [" + ID + "] t\n"
            + "    Given s\n"
            + "\n"
            + "    Examples:\n";
    private static final String UNSORTED = ""
            + "      | product_type |\n"
            + "      | FX_PSCRIPT   |\n"
            + "      | FX_TRF       |\n";
    private static final String WRITTEN = ""
            + "      | product_type   |\n"
            + "      | FX_TRF         |\n"
            + "      | FX_PSCRIPT     |\n"
            + "      | FX_PSCRIPT_TRF |\n";
    private static final List<String> THREE = List.of("FX_TRF", "FX_PSCRIPT", "FX_PSCRIPT_TRF");
    private static final String EXAMPLES = ""
            + "    Examples:\n"
            + "      | product_type |\n"
            + "      | FX_TRF       |\n";
    private static final String ONLY = ": only an Outline with <product_type> carries one";

    private static final Function<Capability, List<String>> TRF_ONLY = registry(Map.of(CREATE, List.of("FX_TRF")));

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private Path root() {
        return tmp.getRoot().toPath();
    }

    private static Path feature(Path root, String file, String text) throws IOException {
        Path path = root.resolve(file);
        Files.createDirectories(path.getParent());
        Files.write(path, text.getBytes(StandardCharsets.UTF_8));
        return path;
    }

    private static String read(Path path) throws IOException {
        return Files.readString(path, StandardCharsets.UTF_8);
    }

    private static Function<Capability, List<String>> registry(Map<Capability, List<String>> products) {
        return c -> products.getOrDefault(c, List.of());
    }

    /** The plan of a fresh root holding only {@code api/trading/x.feature} with {@code text}. */
    private ProductExamples.Plan planOf(String text, Function<Capability, List<String>> productsOf)
            throws IOException {
        Path root = tmp.newFolder().toPath();
        feature(root, FILE, text);
        return ProductExamples.plan(root, productsOf);
    }

    /** A feature with one Outline {@link #ID} under {@code tags} (none when empty), followed by {@code examples}. */
    private static String outline(String tags, String examples) {
        return "@api\nFeature: X\n\n" + (tags.isEmpty() ? "" : "  " + tags + "\n")
                + "  Scenario Outline: [" + ID + "] t\n    Given s\n\n" + examples;
    }

    private String noteOf(String table, List<String> products) throws IOException {
        ProductExamples.Plan plan = planOf(HEAD + table, registry(Map.of(CREATE, products)));
        assertEquals(List.of(), plan.errors());
        return plan.entries().get(0).note();
    }

    @Test
    public void writesRowsFromTheRegistry() throws IOException {
        Path file = feature(root(), FILE, HEAD + UNSORTED);
        ProductExamples.Plan plan = ProductExamples.plan(root(), registry(Map.of(CREATE, THREE)));
        ProductExamples.write(plan);
        assertEquals(HEAD + WRITTEN, read(file));
        assertEquals(1, plan.entries().size());
        ProductExamples.Entry entry = plan.entries().get(0);
        assertEquals(FILE, entry.file());
        assertEquals(ID, entry.rowId());
        assertEquals(CREATE, entry.capability());
        assertEquals("add FX_PSCRIPT_TRF", entry.note());
    }

    @Test
    public void keepsCrlfAndTheRestOfTheFile() throws IOException {
        Path file = feature(root(), FILE, (HEAD + UNSORTED).replace("\n", "\r\n"));
        ProductExamples.write(ProductExamples.plan(root(), registry(Map.of(CREATE, THREE))));
        String out = read(file);
        assertEquals((HEAD + WRITTEN).replace("\n", "\r\n"), out);
        assertFalse(out.replace("\r\n", "").contains("\n"));
    }

    @Test
    public void secondRunChangesNothing() throws IOException {
        feature(root(), FILE, HEAD + UNSORTED);
        Function<Capability, List<String>> productsOf = registry(Map.of(CREATE, THREE));
        ProductExamples.write(ProductExamples.plan(root(), productsOf));
        ProductExamples.Plan again = ProductExamples.plan(root(), productsOf);
        assertTrue(again.rewrites().isEmpty());
        assertEquals(1, again.entries().size());
        assertFalse(again.entries().get(0).changed());
        assertEquals("unchanged", again.entries().get(0).note());
    }

    @Test
    public void notesSayWhatChanged() throws IOException {
        assertEquals("reordered", noteOf(UNSORTED, List.of("FX_TRF", "FX_PSCRIPT")));
        assertEquals("reformatted", noteOf("      | product_type |\n      | FX_TRF |\n", List.of("FX_TRF")));
        String withOpt = "      | product_type |\n      | FX_TRF       |\n      | FX_OPT       |\n";
        assertEquals("remove FX_OPT", noteOf(withOpt, List.of("FX_TRF")));
        assertEquals("add FX_PSCRIPT, remove FX_OPT", noteOf(withOpt, List.of("FX_TRF", "FX_PSCRIPT")));
        String twice = "      | product_type |\n      | FX_TRF       |\n      | FX_TRF       |\n";
        assertEquals("remove FX_TRF", noteOf(twice, List.of("FX_TRF")));
    }

    @Test
    public void errorWritesNothing() throws IOException {
        Path good = feature(root(), FILE, HEAD + UNSORTED);
        Path bad = feature(root(), "ui/trading/y.feature", outline("@ADO#positive", EXAMPLES));
        byte[] goodBefore = Files.readAllBytes(good);
        byte[] badBefore = Files.readAllBytes(bad);
        ProductExamples.Plan plan = ProductExamples.plan(root(), registry(Map.of(CREATE, THREE)));
        assertFalse(plan.rewrites().isEmpty());
        try {
            ProductExamples.write(plan);
            fail("expected an IllegalStateException");
        } catch (IllegalStateException e) {
            assertTrue(e.getMessage(), e.getMessage().startsWith(
                    "[ProductExamples] nothing written, 1 problem(s):\n  ui/trading/y.feature: " + ID));
        }
        assertArrayEquals(goodBefore, Files.readAllBytes(good));
        assertArrayEquals(badBefore, Files.readAllBytes(bad));
    }

    @Test
    public void missingTagIsAnError() throws IOException {
        List<String> errors = planOf(outline("@ADO#positive", EXAMPLES), TRF_ONLY).errors();
        assertEquals(1, errors.size());
        assertTrue(errors.get(0), errors.get(0).startsWith(FILE + ": " + ID
                + " has no @capability# tag; known: create, stepInFull, stepInPartial, earlyTermination"));
    }

    @Test
    public void twoTagsAreAnError() throws IOException {
        assertEquals(List.of(FILE + ": " + ID + " has 2 @capability# tags: @capability#create, @capability#stepInFull"),
                planOf(outline("@capability#create @capability#stepInFull", EXAMPLES), TRF_ONLY).errors());
    }

    @Test
    public void unknownTagIsAnError() throws IOException {
        List<String> errors = planOf(outline("@capability#Create", EXAMPLES), TRF_ONLY).errors();
        assertEquals(1, errors.size());
        assertTrue(errors.get(0), errors.get(0).startsWith(FILE + ": " + ID + ": 'Create' is not a capability"));
        assertTrue(errors.get(0), errors.get(0).contains("create, stepInFull"));
    }

    @Test
    public void misplacedTagIsAnError() throws IOException {
        ProductExamples.Plan plan = planOf(""
                + "@capability#create\n"
                + "Feature: X\n"
                + "\n"
                + "  @capability#create\n"
                + "  Scenario: [TC-X-API-002] plain\n"
                + "    Given s\n"
                + "\n"
                + "  @capability#create\n"
                + "  Scenario Outline: [TC-X-API-003] per <side>\n"
                + "    Given s\n"
                + "\n"
                + "    Examples:\n"
                + "      | side |\n"
                + "      | Buy  |\n"
                + "\n"
                + "  @capability#stepInFull\n"
                + "  Scenario Outline: [TC-X-<product_type>-API-004] t\n"
                + "    Given s\n"
                + "\n"
                + "    @capability#create\n"
                + "    Examples:\n"
                + "      | product_type |\n"
                + "      | FX_TRF       |\n", registry(Map.of(STEP_IN_FULL, List.of("FX_TRF"))));
        assertEquals(List.of(
                FILE + ": @capability#create on the Feature" + ONLY,
                FILE + ": @capability#create on the Scenario TC-X-API-002" + ONLY,
                FILE + ": @capability#create on the Outline TC-X-API-003 without <product_type>" + ONLY,
                FILE + ": @capability#create on an Examples block of TC-X-<product_type>-API-004" + ONLY),
                plan.errors());
    }

    @Test
    public void tableOtherThanOneProductColumnIsAnError() throws IOException {
        ProductExamples.Plan plan = planOf(""
                + "@api\n"
                + "Feature: X\n"
                + "\n"
                + "  @capability#create\n"
                + "  Scenario Outline: [TC-X-<product_type>-API-001] two tables\n"
                + "    Given s\n"
                + "    Examples:\n"
                + "      | product_type |\n"
                + "      | FX_TRF       |\n"
                + "    Examples:\n"
                + "      | product_type |\n"
                + "      | FX_PSCRIPT   |\n"
                + "\n"
                + "  @capability#create\n"
                + "  Scenario Outline: [TC-X-<product_type>-API-002] two columns\n"
                + "    Given s\n"
                + "    Examples:\n"
                + "      | other | product_type |\n"
                + "      | a     | FX_TRF       |\n"
                + "\n"
                + "  @capability#create\n"
                + "  Scenario Outline: [TC-X-<product_type>-API-003] no table\n"
                + "    Given s\n", TRF_ONLY);
        String error = ": Examples must be one table with the single column product_type";
        assertEquals(List.of(
                FILE + ": TC-X-<product_type>-API-001" + error,
                FILE + ": TC-X-<product_type>-API-002" + error,
                FILE + ": TC-X-<product_type>-API-003" + error),
                plan.errors());
    }

    @Test
    public void capabilityWithoutProductIsAnError() throws IOException {
        assertEquals(List.of(FILE + ": " + ID + ": no product has capability stepInFull (ProductDatFiles)"),
                planOf(outline("@capability#stepInFull", EXAMPLES), registry(Map.of(STEP_IN_FULL, List.of())))
                        .errors());
    }

    @Test
    public void scenarioWithoutProductTypeIsLeftAlone() throws IOException {
        ProductExamples.Plan plan = planOf(""
                + "@api\n"
                + "Feature: X\n"
                + "\n"
                + "  @ADO#negative\n"
                + "  Scenario: [TC-X-API-004] rejects a trade without counterparty\n"
                + "    Given s\n"
                + "\n"
                + "  Scenario Outline: [TC-X-API-005] per <side>\n"
                + "    Given s\n"
                + "    Examples:\n"
                + "      | side |\n"
                + "      | Buy  |\n", TRF_ONLY);
        assertEquals(List.of(), plan.entries());
        assertEquals(List.of(), plan.errors());
        assertTrue(plan.rewrites().isEmpty());
    }

    @Test
    public void unusedCapabilityIsAWarning() throws IOException {
        ProductExamples.Plan plan = planOf(HEAD + EXAMPLES.substring("    Examples:\n".length()), TRF_ONLY);
        assertEquals(List.of(), plan.errors());
        assertEquals(Arrays.stream(Capability.values()).filter(c -> c != CREATE)
                .map(c -> "capability " + c.tagName() + ": no Outline tests it").toList(), plan.warnings());
        assertTrue(plan.warnings().contains("capability stepInFull: no Outline tests it"));
    }

    @Test
    public void registryProductsAreTheProductNamesInRegistryOrder() {
        for (Capability c : Capability.values()) {
            assertEquals(ProductDatFiles.with(c).stream().map(Enum::name).toList(),
                    ProductExamples.registryProducts(c));
        }
        assertEquals("FX_TRF", ProductExamples.registryProducts(CREATE).get(0));
    }

    @Test
    public void commentOrBlankLineInsideAProductTableIsAnError() throws IOException {
        ProductExamples.Plan plan = planOf(HEAD
                + "      | product_type   |\n"
                + "      | FX_TRF         |\n"
                + "      # | FX_PSCRIPT   |\n"
                + "      | FX_PSCRIPT_TRF |\n", registry(Map.of(CREATE, THREE)));
        assertEquals(List.of(FILE + ": " + ID + ": a comment or blank line inside the product table; the registry"
                + " decides the rows (remove the line, or take the capability off the product in ProductDatFiles)"),
                plan.errors());
        assertTrue(plan.rewrites().isEmpty());
    }

    @Test
    public void blankLineBeforeTheHeaderIsFine() throws IOException {
        ProductExamples.Plan plan = planOf(HEAD + "\n" + EXAMPLES.substring("    Examples:\n".length()), TRF_ONLY);
        assertEquals(List.of(), plan.errors());
        assertEquals("unchanged", plan.entries().get(0).note());
    }
}
