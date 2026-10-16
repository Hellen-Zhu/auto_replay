package com.example.genie.model;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Stand-in for Genie's GenieScenario, so the hooks and ScenarioContext compile and run here as in the E2E project.
 * Not to be copied there: Genie has the real class. Only what this project uses is here.
 *
 * <p>Differences: Genie's GenieScenario is the Cucumber Scenario itself (the hooks cast it); here it is a separate
 * object, one per scenario through PicoContainer, bound to the Cucumber Scenario by {@link GenieScenarioBinder}.
 * {@link #getError()} is always null here (Cucumber's public API does not give the error).
 */
public class GenieScenario {

    private final Map<String, Object> attributes = new LinkedHashMap<>();
    private io.cucumber.java.Scenario scenario;

    void bind(io.cucumber.java.Scenario scenario) {
        this.scenario = scenario;
    }

    public void setAttribute(String name, Object value) {
        attributes.put(name, value);
    }

    @SuppressWarnings("unchecked")
    public <T> T getAttribute(String name) {
        return (T) attributes.get(name);
    }

    public Set<String> getAttributeNames() {
        return Collections.unmodifiableSet(attributes.keySet());
    }

    /** A message in the scenario's report. */
    public void write(String message) {
        if (scenario != null) {
            scenario.log(message);
        }
    }

    public Throwable getError() {
        return null;
    }
}
