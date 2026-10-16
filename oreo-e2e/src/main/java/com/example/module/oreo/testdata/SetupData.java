package com.example.module.oreo.testdata;

import com.fasterxml.jackson.databind.node.ObjectNode;

/** A setup payload from {@code data/setup/<name>.json}: a body sent to prepare a case, or a mocked answer. */
public final class SetupData {

    private final String name;
    private final ObjectNode request;
    private final ObjectNode response;

    SetupData(String name, ObjectNode request, ObjectNode response) {
        this.name = name;
        this.request = request == null ? null : request.deepCopy();
        this.response = response == null ? null : response.deepCopy();
    }

    public String name() { return name; }

    /** Compact JSON of the request, or {@code null} when the file has none. */
    public String request() { return request == null ? null : Json.compact(request); }

    /** Compact JSON of the response, or {@code null} when the file has none. */
    public String response() { return response == null ? null : Json.compact(response); }

    public boolean hasRequest() { return request != null; }

    public boolean hasResponse() { return response != null; }

    ObjectNode requestNode() { return request; }

    ObjectNode responseNode() { return response; }

    @Override
    public String toString() {
        return "SetupData{" + name + ", request=" + hasRequest() + ", response=" + hasResponse() + '}';
    }
}
