package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class JsonLayersTest {

    private static ObjectNode object(String json) {
        return (ObjectNode) Json.parse(json);
    }

    @Test
    public void deepMergesObjects() {
        ObjectNode merged = JsonLayers.merge(object("{\"basic\":{\"a\":1,\"b\":2}}"), object("{\"basic\":{\"b\":3}}"));
        assertEquals(Json.parse("{\"basic\":{\"a\":1,\"b\":3}}"), merged);
    }

    @Test
    public void nullDeletesKey() {
        ObjectNode merged = JsonLayers.merge(
                object("{\"basic\":{\"premiumAmount\":10000,\"x\":1}}"),
                object("{\"basic\":{\"premiumAmount\":null}}"));
        assertEquals(Json.parse("{\"basic\":{\"x\":1}}"), merged);
    }

    @Test
    public void arraysReplaceWhole() {
        ObjectNode merged = JsonLayers.merge(object("{\"udf\":[1,2]}"), object("{\"udf\":[3]}"));
        assertEquals(Json.parse("{\"udf\":[3]}"), merged);
    }

    @Test
    public void doesNotMutateInputs() {
        ObjectNode base = object("{\"basic\":{\"a\":1,\"b\":2}}");
        ObjectNode patch = object("{\"basic\":{\"b\":null,\"c\":{\"d\":4}}}");
        JsonNode baseBefore = base.deepCopy();
        JsonNode patchBefore = patch.deepCopy();

        ObjectNode merged = JsonLayers.merge(base, patch);
        ((ObjectNode) merged.get("basic").get("c")).put("d", 5);

        assertEquals(baseBefore, base);
        assertEquals(patchBefore, patch);
    }

    @Test
    public void dropsCommentsAtEveryDepth() {
        JsonNode cleaned = JsonLayers.withoutComments(
                Json.parse("{\"_comment\":\"x\",\"a\":{\"_comment\":\"y\",\"b\":[{\"_comment\":\"z\",\"c\":1}]}}"));
        assertEquals(Json.parse("{\"a\":{\"b\":[{\"c\":1}]}}"), cleaned);
    }
}
