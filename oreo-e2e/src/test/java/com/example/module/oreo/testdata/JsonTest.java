package com.example.module.oreo.testdata;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class JsonTest {

    @Test
    public void prettyLayout() {
        String pretty = Json.pretty(Json.parse("{\"a\":[1,{\"b\":70000.0}],\"e\":{},\"f\":[]}"));
        assertEquals("{\n"
                + "  \"a\": [\n"
                + "    1,\n"
                + "    {\n"
                + "      \"b\": 70000.0\n"
                + "    }\n"
                + "  ],\n"
                + "  \"e\": {},\n"
                + "  \"f\": []\n"
                + "}\n", pretty);
    }

    @Test
    public void keepsDecimalDigits() {
        String json = "{\"p\":20150.8410403754144,\"q\":70000.0,\"c\":200}";
        assertEquals(json, Json.compact(Json.parse(json)));
    }
}
