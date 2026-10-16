package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/** Trade request bodies: the product is never written in the data, the step sets it. */
public final class TradeRequests {

    private TradeRequests() {}

    /**
     * {@code requestJson} with {@code basic.productId} set to {@code productId} ({@code basic} is created when
     * absent). Numbers are kept exactly as written.
     *
     * @throws AssertionError when the request or its {@code basic} is not a JSON object
     */
    public static String withProductId(String requestJson, String productId) {
        JsonNode root;
        try {
            root = Json.parse(requestJson);
        } catch (IllegalStateException e) {
            throw new AssertionError("[TradeRequests] Failed to inject basic.productId: " + e.getMessage(), e);
        }
        if (!(root instanceof ObjectNode rootObject)) {
            throw new AssertionError("[TradeRequests] request must be a JSON object.");
        }
        JsonNode basic = rootObject.get("basic");
        ObjectNode basicObject;
        if (basic == null || basic.isNull()) {
            basicObject = rootObject.putObject("basic");
        } else if (basic instanceof ObjectNode object) {
            basicObject = object;
        } else {
            throw new AssertionError("[TradeRequests] request.basic must be a JSON object.");
        }
        basicObject.put("productId", productId);
        return Json.compact(rootObject);
    }
}
