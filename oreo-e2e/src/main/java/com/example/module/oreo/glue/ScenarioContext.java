package com.example.module.oreo.glue;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Stand-in for the scenario attributes of GenieScenario (setAttribute / getAttribute), one per scenario through
 * PicoContainer. In the E2E project the hook writes to GenieScenario instead.
 */
public class ScenarioContext {

    private final Map<String, Object> attributes = new LinkedHashMap<>();

    public void setAttribute(String name, Object value) {
        attributes.put(name, value);
    }

    @SuppressWarnings("unchecked")
    public <T> T getAttribute(String name) {
        return (T) attributes.get(name);
    }

    public String text(String name) {
        Object value = attributes.get(name);
        if (value == null) {
            throw new AssertionError("ctx has no '" + name + "'");
        }
        return value.toString();
    }
}
