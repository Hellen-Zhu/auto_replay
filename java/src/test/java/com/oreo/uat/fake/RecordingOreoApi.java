package com.oreo.uat.fake;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.oreo.uat.support.OreoApi;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Logs every request instead of sending it. A trade submission answers with a made-up trade and task ID in the
 * shape of the real answer ({@code data.trade.id}, {@code data.checkerContext.taskId}).
 */
public class RecordingOreoApi implements OreoApi {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final AtomicInteger IDS = new AtomicInteger(1000);

    private final List<String> log;

    public RecordingOreoApi(List<String> log) {
        this.log = log;
    }

    @Override
    public JsonNode postMultipart(String path, String userId, String jsonPart, String json, String filePart, String file) {
        log.add("POST " + path + " as " + userId + " " + jsonPart + "=" + compact(json) + " " + filePart + "=" + file);
        int id = IDS.incrementAndGet();
        return parse("{\"data\":{\"trade\":{\"id\":\"TRADE-" + id + "\"},\"checkerContext\":{\"taskId\":\"TASK-" + id + "\"}}}");
    }

    @Override
    public JsonNode postJson(String path, String userId, String body) {
        log.add("POST " + path + " as " + userId + " " + compact(body));
        return parse("{\"code\":200,\"status\":\"SUCCESS\"}");
    }

    private static String compact(String json) {
        return parse(json).toString();
    }

    private static JsonNode parse(String json) {
        try {
            return JSON.readTree(json);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
