package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

/** Spec section 3.4 on small synthetic cases; every test also merges each case's layers back to its value. */
public class LayeringTest {

    private static final List<String> ORDER = List.of("FX_TRF", "FX_PSCRIPT", "FX_PSCRIPT_FSKO", "FX_PSCRIPT_TRF");

    @Test
    public void majorityGoesToDefaults() {
        Layering.Layers layers = layer(false,
                c("R1", null, "{\"a\":1,\"b\":1}"), c("R2", null, "{\"a\":1,\"b\":2}"), c("R3", null, "{\"a\":1}"));
        assertEquals(o("{\"a\":1}"), layers.defaults());
        assertEquals(Map.of("R1", o("{\"b\":1}"), "R2", o("{\"b\":2}")), layers.rows());
        assertEquals(Map.of(), layers.byProduct());
        assertEquals(Map.of(), layers.rowByProduct());
    }

    @Test
    public void halfIsNotAMajority() {
        Layering.Layers layers = layer(false, c("R1", null, "{\"a\":1}"), c("R2", null, "{\"a\":2}"));
        assertEquals(o("{}"), layers.defaults());
        assertEquals(Map.of("R1", o("{\"a\":1}"), "R2", o("{\"a\":2}")), layers.rows());
    }

    @Test
    public void absenceWinsWritesNothing() {
        Layering.Layers layers = layer(false,
                c("R1", null, "{\"a\":1}"), c("R2", null, "{}"), c("R3", null, "{}"));
        assertEquals(o("{}"), layers.defaults());
        assertEquals(Map.of("R1", o("{\"a\":1}")), layers.rows());
    }

    @Test
    public void productMajorityGoesToByProduct() {
        Layering.Layers layers = layer(false,
                c("R1", "FX_TRF", "{\"d\":\"Buy\",\"p\":10}"), c("R1", "FX_PSCRIPT_TRF", "{\"d\":\"Sell\"}"),
                c("R2", "FX_TRF", "{\"d\":\"Buy\",\"p\":10}"), c("R2", "FX_PSCRIPT_TRF", "{\"d\":\"Sell\"}"),
                c("R3", "FX_TRF", "{\"d\":\"Buy\",\"p\":10}"), c("R3", "FX_PSCRIPT_TRF", "{\"d\":\"Buy\"}"));
        assertEquals(o("{\"d\":\"Buy\"}"), layers.defaults());
        assertEquals(Map.of("FX_TRF", o("{\"p\":10}"), "FX_PSCRIPT_TRF", o("{\"d\":\"Sell\"}")), layers.byProduct());
        assertEquals(List.of("FX_TRF", "FX_PSCRIPT_TRF"), new ArrayList<>(layers.byProduct().keySet()));
        assertEquals(Map.of("R3", o("{\"d\":\"Buy\"}")), layers.rows());
        assertEquals(Map.of(), layers.rowByProduct());
    }

    @Test
    public void byProductNullsAKeyMostOfItsCasesLack() {
        Layering.Layers layers = layer(false,
                c("R1", "FX_TRF", "{\"p\":1}"), c("R2", "FX_TRF", "{\"p\":1}"), c("R3", "FX_TRF", "{\"p\":1}"),
                c("R1", "FX_PSCRIPT_TRF", "{}"), c("R2", "FX_PSCRIPT_TRF", "{}"));
        assertEquals(o("{\"p\":1}"), layers.defaults());
        assertEquals(Map.of("FX_PSCRIPT_TRF", o("{\"p\":null}")), layers.byProduct());
        assertEquals(Map.of(), layers.rows());
    }

    @Test
    public void missingObjectIsOneNull() {
        Layering.Case r4 = c("R4", null, "{\"t\":1}");
        Layering.Layers layers = layer(false,
                c("R1", null, "{\"s\":{\"x\":1,\"y\":2}}"), c("R2", null, "{\"s\":{\"x\":1,\"y\":2}}"),
                c("R3", null, "{\"s\":{\"x\":1,\"y\":2}}"), r4);
        assertEquals(o("{\"s\":{\"x\":1,\"y\":2}}"), layers.defaults());
        assertEquals(Map.of("R4", o("{\"t\":1,\"s\":null}")), layers.rows());
        assertFalse(layers.merged(r4).has("s"));
    }

    @Test
    public void outlineRowAndItsByProduct() {
        Layering.Layers layers = layer(false,
                c("R", "FX_TRF", "{\"a\":1,\"c\":5}"), c("R", "FX_PSCRIPT", "{\"a\":1,\"c\":5,\"e\":1}"),
                c("Q", "FX_TRF", "{\"a\":1}"), c("Q", "FX_PSCRIPT", "{\"a\":1}"),
                c("Q2", "FX_TRF", "{\"a\":1}"), c("Q2", "FX_PSCRIPT", "{\"a\":1}"));
        assertEquals(o("{\"a\":1}"), layers.defaults());
        assertEquals(Map.of(), layers.byProduct());
        assertEquals(Map.of("R", o("{\"c\":5}")), layers.rows());
        assertEquals(Map.of("R", Map.of("FX_PSCRIPT", o("{\"e\":1}"))), layers.rowByProduct());
    }

    @Test
    public void caseWithoutDataDoesNotVoteAndNullsEachTopLevelKey() {
        Layering.Layers layers = layer(false,
                c("R1", null, "{\"a\":1}"), new Layering.Case("R2", "R2", null, o("{}"), false));
        assertEquals(o("{\"a\":1}"), layers.defaults());
        assertEquals(Map.of("R2", o("{\"a\":null}")), layers.rows());
    }

    @Test
    public void emptyRulesClearAll() {
        Layering.Layers layers = layer(true,
                c("R1", null, "{\"msg\":\"regex:x\"}"), c("R2", null, "{\"msg\":\"regex:x\"}"),
                c("R3", null, "{\"msg\":\"regex:x\"}"), c("R4", null, "{}"));
        assertEquals(o("{\"msg\":\"regex:x\"}"), layers.defaults());
        assertEquals(Map.of("R4", NullNode.getInstance()), layers.rows());
    }

    @Test
    public void keysKeepFirstAppearanceOrder() {
        Layering.Layers layers = layer(false, c("R1", null, "{\"b\":1,\"a\":1}"), c("R2", null, "{\"b\":1,\"a\":1}"));
        assertEquals("{\n  \"b\": 1,\n  \"a\": 1\n}\n", Json.pretty(layers.defaults()));
    }

    @Test
    public void arraysAreReplacedWhole() {
        Layering.Layers layers = layer(false,
                c("R1", null, "{\"a\":[1,2]}"), c("R2", null, "{\"a\":[1,2]}"), c("R3", null, "{\"a\":[1]}"));
        assertEquals(o("{\"a\":[1,2]}"), layers.defaults());
        assertEquals(Map.of("R3", o("{\"a\":[1]}")), layers.rows());
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** A case with old data; its ID is the row with the product, which is all a test needs to tell cases apart. */
    private static Layering.Case c(String row, String product, String json) {
        return new Layering.Case(product == null ? row : row + "/" + product, row, product, o(json), true);
    }

    private static ObjectNode o(String json) {
        return (ObjectNode) Json.parse(json);
    }

    private static Layering.Layers layer(boolean clearWhenEmpty, Layering.Case... cases) {
        Layering.Layers layers = Layering.layer(List.of(cases), ORDER, clearWhenEmpty);
        for (Layering.Case c : cases) {
            JsonNode merged = layers.merged(c);
            assertEquals(c.caseId() + " merged back", c.value(), merged);
        }
        return layers;
    }
}
