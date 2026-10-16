package com.oreo.uat.support;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Requests sent without the browser (RestApiUtil of the E2E project). {@code userId} is the account's e-mail, sent
 * as the header {@code X-User-Id}; paths start after the API prefix.
 */
public interface OreoApi {

    JsonNode postMultipart(String path, String userId, String jsonPart, String json, String filePart, String file);

    JsonNode postJson(String path, String userId, String body);
}
