package com.example.module.oreo.testdata;

import net.javacrumbs.jsonunit.JsonAssert;
import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class ResponseMaskerTest {

    private static final String ANY_STRING = "${json-unit.any-string}";
    private static final String ANY_NUMBER = "${json-unit.any-number}";
    private static final String ANY_BOOLEAN = "${json-unit.any-boolean}";
    private static final String MSG_RULE = "regex:Submitted for checker approval\\. TaskId: CHK-.*";

    private static void assertJson(String expected, String actual) {
        assertEquals(Json.parse(expected), Json.parse(actual));
    }

    private static Map<String, String> rules(String... pathsAndRules) {
        Map<String, String> rules = new LinkedHashMap<>();
        for (int i = 0; i < pathsAndRules.length; i += 2) {
            rules.put(pathsAndRules[i], pathsAndRules[i + 1]);
        }
        return rules;
    }

    @Test
    public void typeReplacesLeavesByType() {
        String masked = ResponseMasker.mask("{\"id\":\"T1\",\"n\":5,\"b\":true,\"z\":null}",
                rules("id", "type", "n", "type", "b", "type", "z", "type"), "x");
        assertJson("{\"id\":\"" + ANY_STRING + "\",\"n\":\"" + ANY_NUMBER + "\",\"b\":\"" + ANY_BOOLEAN
                + "\",\"z\":null}", masked);
    }

    @Test
    public void typeTreeKeepsStructure() {
        String masked = ResponseMasker.mask("{\"s\":[{\"d\":\"2026-01-01\",\"v\":1.5}]}",
                rules("s", "type-tree"), "x");
        assertJson("{\"s\":[{\"d\":\"" + ANY_STRING + "\",\"v\":\"" + ANY_NUMBER + "\"}]}", masked);
    }

    @Test
    public void regexChecksTheValue() {
        String masked = ResponseMasker.mask("{\"msg\":\"Submitted for checker approval. TaskId: CHK-1\"}",
                rules("msg", MSG_RULE), "x");
        assertEquals("${json-unit.regex}Submitted for checker approval\\. TaskId: CHK-.*",
                Json.parse(masked).get("msg").asText());
    }

    @Test(expected = IllegalStateException.class)
    public void regexMismatchFails() {
        ResponseMasker.mask("{\"msg\":\"Access denied\"}", rules("msg", MSG_RULE), "x");
    }

    @Test
    public void ignoreWritesIgnore() {
        String masked = ResponseMasker.mask("{\"t\":{\"a\":1}}", rules("t", "ignore"), "x");
        assertJson("{\"t\":\"${json-unit.ignore}\"}", masked);
    }

    @Test
    public void starPathCoversEveryElement() {
        String masked = ResponseMasker.mask("{\"a\":[{\"t\":\"x\"},{\"t\":\"y\"}]}", rules("a[*].t", "type"), "x");
        assertJson("{\"a\":[{\"t\":\"" + ANY_STRING + "\"},{\"t\":\"" + ANY_STRING + "\"}]}", masked);
    }

    @Test(expected = IllegalStateException.class)
    public void typeOnObjectFails() {
        ResponseMasker.mask("{\"t\":{\"a\":1}}", rules("t", "type"), "x");
    }

    @Test(expected = IllegalStateException.class)
    public void pathMatchingNothingFails() {
        ResponseMasker.mask("{\"t\":1}", rules("data.t", "type"), "x");
    }

    @Test(expected = IllegalStateException.class)
    public void unknownRuleFails() {
        ResponseMasker.mask("{\"t\":1}", rules("t", "maybe"), "x");
    }

    @Test
    public void keepsNumbersExactly() {
        String masked = ResponseMasker.mask(
                "{\"code\":200,\"n\":70000.0,\"p\":20150.8410403754144,\"q\":-18726.25346898106}", Map.of(), "x");
        assertTrue(masked, masked.contains("200,"));
        assertTrue(masked, masked.contains("70000.0"));
        assertTrue(masked, masked.contains("20150.8410403754144"));
        assertTrue(masked, masked.contains("-18726.25346898106"));
    }

    @Test
    public void maskedOutputMatchesTheActual() {
        String actual = "{\"code\":200,\"msg\":\"Submitted for checker approval. TaskId: CHK-7\","
                + "\"data\":{\"id\":\"T9\",\"trace\":{\"at\":\"2026-01-01\",\"n\":[1,2]},\"tmp\":{\"q\":true},"
                + "\"amount\":70000.0}}";
        String masked = ResponseMasker.mask(actual,
                rules("msg", MSG_RULE, "data.id", "type", "data.trace", "type-tree", "data.tmp", "ignore"), "x");
        JsonAssert.assertJsonEquals(masked, actual);
    }
}
