package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class JsonPatchTest {

    private static JsonNode json(String text) {
        return Json.parse(text);
    }

    private static void assertDiff(String base, String target, String ops) {
        assertEquals(json(ops), JsonPatch.diff(json(base), json(target)));
    }

    private static void assertApplyFails(String base, String ops, String messagePart) {
        try {
            JsonPatch.apply(json(base), json(ops), "x");
            fail("expected an IllegalStateException");
        } catch (IllegalStateException e) {
            assertTrue(e.getMessage(), e.getMessage().contains(messagePart));
        }
    }

    @Test
    public void identicalTreesGiveNoOps() {
        assertDiff("{\"a\":1,\"u\":[1]}", "{\"a\":1,\"u\":[1]}", "[]");
    }

    @Test
    public void replacesAChangedLeaf() {
        assertDiff("{\"a\":{\"b\":1}}", "{\"a\":{\"b\":2}}", "[{\"op\":\"replace\",\"path\":\"/a/b\",\"value\":2}]");
    }

    @Test
    public void removesThenAddsKeys() {
        assertDiff("{\"a\":1,\"b\":2}", "{\"a\":1,\"c\":3}",
                "[{\"op\":\"remove\",\"path\":\"/b\"},{\"op\":\"add\",\"path\":\"/c\",\"value\":3}]");
    }

    @Test
    public void sameLengthArraysByIndex() {
        assertDiff("{\"u\":[{\"k\":\"x\",\"v\":\"1\"},{\"k\":\"y\",\"v\":\"2\"}]}",
                "{\"u\":[{\"k\":\"x\",\"v\":\"1\"},{\"k\":\"y\",\"v\":\"3\"}]}",
                "[{\"op\":\"replace\",\"path\":\"/u/1/v\",\"value\":\"3\"}]");
    }

    @Test
    public void otherLengthArraysReplacedWhole() {
        assertDiff("{\"u\":[1,2]}", "{\"u\":[1,2,3]}", "[{\"op\":\"replace\",\"path\":\"/u\",\"value\":[1,2,3]}]");
    }

    @Test
    public void typeChangeIsAReplace() {
        assertDiff("{\"i\":{\"x\":1}}", "{\"i\":\"${json-unit.ignore}\"}",
                "[{\"op\":\"replace\",\"path\":\"/i\",\"value\":\"${json-unit.ignore}\"}]");
    }

    @Test
    public void escapesPointerTokens() {
        JsonNode base = json("{\"a/b~c\":1}");
        JsonNode target = json("{\"a/b~c\":2}");
        JsonNode ops = JsonPatch.diff(base, target);
        assertEquals("/a~1b~0c", ops.get(0).get("path").asText());
        assertEquals(target, JsonPatch.apply(base, ops, "x"));
    }

    @Test
    public void numbersCompareExactly() {
        JsonNode base = json("{\"n\":70000.0}");
        JsonNode target = json("{\"n\":70000.00}");
        JsonNode ops = JsonPatch.diff(base, target);
        assertEquals(1, ops.size());
        assertTrue(Json.compact(JsonPatch.apply(base, ops, "x")).contains("70000.00"));
    }

    @Test
    public void applyGivesTheTargetBack() {
        JsonNode base = json("{\"code\":200,\"msg\":\"ok\",\"data\":{\"trade\":{\"id\":\"${json-unit.any-string}\","
                + "\"basic\":{\"rate\":7.1234,\"udf\":[{\"k\":\"a\",\"v\":\"1\"}],\"note\":null},\"legs\":[1,2]}}}");
        JsonNode target = json("{\"code\":200,\"data\":{\"trade\":{\"id\":\"${json-unit.any-string}\","
                + "\"basic\":{\"rate\":7.5,\"udf\":[{\"k\":\"a\",\"v\":\"2\"}],\"note\":\"x\",\"extra\":[]},"
                + "\"legs\":[1,2,3]}},\"status\":\"SUCCESS\"}");
        assertEquals(target, JsonPatch.apply(base, JsonPatch.diff(base, target), "x"));
    }

    @Test
    public void applyLeavesTheBaseUntouched() {
        JsonNode base = json("{\"a\":{\"b\":1}}");
        JsonPatch.apply(base, json("[{\"op\":\"replace\",\"path\":\"/a/b\",\"value\":2}]"), "x");
        assertEquals(json("{\"a\":{\"b\":1}}"), base);
    }

    @Test
    public void addOnAnExistingKeyFails() {
        assertApplyFails("{\"a\":1}", "[{\"op\":\"add\",\"path\":\"/a\",\"value\":2}]", "x: op 0 (add /a)");
    }

    @Test
    public void replaceOnAMissingKeyFails() {
        assertApplyFails("{\"a\":1}", "[{\"op\":\"replace\",\"path\":\"/b\",\"value\":2}]", "x: op 0 (replace /b)");
    }

    @Test
    public void removeOnAMissingKeyFails() {
        assertApplyFails("{\"a\":1}", "[{\"op\":\"remove\",\"path\":\"/a/b\"}]", "x: op 0 (remove /a/b)");
    }

    @Test
    public void indexOutOfRangeFails() {
        assertApplyFails("{\"u\":[1]}", "[{\"op\":\"replace\",\"path\":\"/u/5\",\"value\":2}]", "x: op 0 (replace /u/5)");
    }

    @Test
    public void unknownOpFails() {
        assertApplyFails("{\"a\":1}", "[{\"op\":\"move\",\"path\":\"/a\"}]", "x: op 0 (move /a)");
    }
}
