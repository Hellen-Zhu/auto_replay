package com.example.module.oreo.glue.hooks;

import com.example.module.oreo.OreoModule;
import io.cucumber.java.After;
import io.cucumber.java.Scenario;

/** Writes the actions the recording session logged into the scenario's report. */
public class ActionLogHook {

    private final OreoModule session;

    public ActionLogHook(OreoModule session) {
        this.session = session;
    }

    @After(order = 0)
    public void logActions(Scenario scenario) {
        if (!session.log().isEmpty()) {
            scenario.log(String.join("\n", session.log()));
        }
    }
}
