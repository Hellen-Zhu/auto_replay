package com.example.genie.model;

import io.cucumber.java.Before;
import io.cucumber.java.Scenario;

/** Part of the {@link GenieScenario} stand-in: gives it the running Cucumber Scenario before any other hook. */
public class GenieScenarioBinder {

    private final GenieScenario genieScenario;

    public GenieScenarioBinder(GenieScenario genieScenario) {
        this.genieScenario = genieScenario;
    }

    @Before(order = Integer.MIN_VALUE)
    public void bind(Scenario scenario) {
        genieScenario.bind(scenario);
    }
}
