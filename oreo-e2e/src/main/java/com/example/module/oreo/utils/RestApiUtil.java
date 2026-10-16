package com.example.module.oreo.utils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.genie.model.GenieScenario;
import com.example.genie.module.rest.RestModule;
import com.example.genie.module.rest.service.RequestResponseHelper;
import cucumber.api.Scenario;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;

public final class RestApiUtil {

    private static final Logger log = LoggerFactory.getLogger(RestApiUtil.class);
    private static final ObjectMapper API_MAPPER = new ObjectMapper();

    private RestApiUtil() {
        // Utility class
    }

    public static RequestResponseHelper helperFromScenario(Scenario scenario) {
        GenieScenario genieScenario = (GenieScenario) scenario;
        RequestResponseHelper helper = genieScenario.getAttribute(RestModule.REQUEST_RESPONSE_HELPER);
        if (helper == null) {
            throw new IllegalStateException(
                    "[RestApiUtil] RequestResponseHelper not initialized. Ensure REST module is active for this scenario.");
        }
        return helper;
    }

    public static JsonNode get(RequestResponseHelper helper, String pathOrUrl, String userId) {
        String target = normalizeTarget(pathOrUrl);
        log.info("[RestApiUtil] GET start: target='{}', userId='{}'", target, userId);

        prepareRequest(helper, userId, null);
        helper.get(target);

        return assertAndParse(helper, "GET " + target);
    }

    public static JsonNode post(RequestResponseHelper helper, String pathOrUrl, String userId, String jsonBody) {
        String target = normalizeTarget(pathOrUrl);
        int bodyLength = jsonBody == null ? 0 : jsonBody.length();
        log.info("[RestApiUtil] POST start (json): target='{}', userId='{}', bodyLength={}", target, userId, bodyLength);

        prepareRequest(helper, userId, jsonBody);
        helper.post(target);

        return assertAndParse(helper, "POST " + target);
    }

    public static JsonNode post(RequestResponseHelper helper, String pathOrUrl, String userId) {
        String target = normalizeTarget(pathOrUrl);
        log.info("[RestApiUtil] POST start (no-body): target='{}', userId='{}'", target, userId);

        prepareRequest(helper, userId, null);
        helper.post(target);

        return assertAndParse(helper, "POST " + target);
    }

    public static JsonNode put(RequestResponseHelper helper, String pathOrUrl, String userId, String jsonBody) {
        String target = normalizeTarget(pathOrUrl);
        int bodyLength = jsonBody == null ? 0 : jsonBody.length();
        log.info("[RestApiUtil] PUT start: target='{}', userId='{}', bodyLength={}", target, userId, bodyLength);

        prepareRequest(helper, userId, jsonBody);
        helper.put(target);

        return assertAndParse(helper, "PUT " + target);
    }

    public static JsonNode delete(RequestResponseHelper helper, String pathOrUrl, String userId) {
        String target = normalizeTarget(pathOrUrl);
        log.info("[RestApiUtil] DELETE start: target='{}', userId='{}'", target, userId);

        prepareRequest(helper, userId, null);
        helper.delete(target);

        return assertAndParse(helper, "DELETE " + target);
    }

    public static JsonNode postMultipart(
            RequestResponseHelper helper,
            String pathOrUrl,
            String userId,
            String jsonPartName,
            String jsonPartValue,
            String filePartName,
            Path filePath
    ) {
        String target = normalizeTarget(pathOrUrl);
        log.info("[RestApiUtil] POST start (multipart): target='{}', userId='{}', jsonPart='{}', filePart='{}', file='{}'",
                target, userId, jsonPartName, filePartName, filePath);

        helper.newRequest();
        helper.request().header("X-User-Id", userId);
        helper.request().multiPart(jsonPartName, jsonPartValue, "application/json");
        helper.request().multiPart(filePartName, filePath.toFile());
        helper.post(target);

        return assertAndParse(helper, "POST " + target);
    }

    private static void prepareRequest(RequestResponseHelper helper, String userId, String jsonBody) {
        helper.newRequest();
        helper.request().header("X-User-Id", userId);
        helper.request().header("Content-Type", "application/json");
        if (jsonBody != null) {
            helper.request().body(jsonBody);
        }
    }

    private static String normalizeTarget(String pathOrUrl) {
        if (pathOrUrl == null || pathOrUrl.isBlank()) {
            throw new IllegalArgumentException("pathOrUrl must not be null/blank");
        }

        if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
            return pathOrUrl;
        }

        return pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl;
    }

    private static JsonNode assertAndParse(RequestResponseHelper helper, String label) {
        int statusCode = helper.response().extract().statusCode();
        String responseText = helper.response().extract().asString();

        if (statusCode < 200 || statusCode >= 300) {
            log.error("[RestApiUtil] Non-2xx response: label='{}', status={}, body={}",
                    label, statusCode, responseText);
            throw new AssertionError(label + " returned HTTP " + statusCode + "\n" + responseText);
        }

        if (responseText == null || responseText.isBlank()) {
            log.debug("[RestApiUtil] Empty response body: label='{}'", label);
            return API_MAPPER.createObjectNode();
        }

        try {
            JsonNode parsed = API_MAPPER.readTree(responseText);
            log.debug("[RestApiUtil] Parsed JSON response successfully: label='{}'", label);
            return parsed;
        } catch (Exception e) {
            log.error("[RestApiUtil] Failed to parse response as JSON: label='{}', body={}",
                    label, responseText, e);
            throw new RuntimeException("Failed to parse API response as JSON: " + label, e);
        }
    }
}
