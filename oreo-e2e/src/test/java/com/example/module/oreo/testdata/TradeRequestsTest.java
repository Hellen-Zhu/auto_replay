package com.example.module.oreo.testdata;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class TradeRequestsTest {

    private static void assertJson(String expected, String actual) {
        assertEquals(Json.parse(expected), Json.parse(actual));
    }

    @Test
    public void setsProductId() {
        assertJson("{\"basic\":{\"a\":1,\"productId\":\"FX_TRF\"}}",
                TradeRequests.withProductId("{\"basic\":{\"a\":1}}", "FX_TRF"));
    }

    @Test
    public void createsBasic() {
        assertJson("{\"basic\":{\"productId\":\"FX_TRF\"}}", TradeRequests.withProductId("{}", "FX_TRF"));
    }

    @Test
    public void overridesTemplateValue() {
        assertJson("{\"basic\":{\"productId\":\"FX_PSCRIPT\"}}",
                TradeRequests.withProductId("{\"basic\":{\"productId\":\"FX_TRF\"}}", "FX_PSCRIPT"));
    }

    @Test(expected = AssertionError.class)
    public void rejectsNonObjectBasic() {
        TradeRequests.withProductId("{\"basic\":[1]}", "FX_TRF");
    }
}
