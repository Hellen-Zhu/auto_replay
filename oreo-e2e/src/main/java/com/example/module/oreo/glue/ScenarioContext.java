package com.example.module.oreo.glue;

import com.example.genie.model.GenieScenario;


public abstract class ScenarioContext {

    private final GenieScenario genieScenario;

    protected ScenarioContext(GenieScenario genieScenario) {
        this.genieScenario = genieScenario;
    }


    public void write(String message) {
        genieScenario.write(message);
    }

    public void set(String key, String value) {
        genieScenario.setAttribute(key, value);
    }

    /**
     * Retrieves a named value from the scenario attribute map, returning {@code null}
     * when the key is absent.
     */
    public <T> T find(String key) {
        return genieScenario.getAttribute(key);
    }

    /**
     * Retrieves a named value from the scenario attribute map, throwing if absent.
     *
     * @throws AssertionError if the key is not set
     */
    public <T> T get(String key) {
        T value = genieScenario.getAttribute(key);
        if (value == null) {
            throw new AssertionError("ctx key '" + key + "' is not set — ensure it is set before this step.");
        }
        return value;
    }

}
