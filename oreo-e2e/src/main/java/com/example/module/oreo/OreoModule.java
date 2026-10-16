package com.example.module.oreo;

import com.example.genie.model.GenieScenario;
import com.example.module.oreo.glue.ScenarioContext;
import com.example.module.oreo.utils.api.OreoApi;
import com.example.module.oreo.utils.api.RecordingOreoApi;
import com.example.module.oreo.utils.ui.OreoUi;
import com.example.module.oreo.utils.ui.RecordingOreoUi;
import java.util.ArrayList;
import java.util.List;

/**
 * What every step and page object of a scenario shares: the ctx, the browser, the API and the config. One per
 * scenario (PicoContainer). Here the browser and the API are recording stand-ins that log each action; in the E2E
 * project they are backed by Genie.
 */
public class OreoModule {

    private final ScenarioContext ctx;
    private final List<String> log = new ArrayList<>();
    private final OreoUi ui;
    private final OreoApi api;
    private final OreoModuleConfiguration config;

    public OreoModule(GenieScenario genieScenario) {
        this.ctx = new ScenarioContext(genieScenario) {
        };
        this.ui = new RecordingOreoUi(log);
        this.api = new RecordingOreoApi(log);
        this.config = OreoModuleConfiguration.withPlaceholders();
    }

    public ScenarioContext ctx() {
        return ctx;
    }

    public OreoUi ui() {
        return ui;
    }

    public OreoApi api() {
        return api;
    }

    public OreoModuleConfiguration config() {
        return config;
    }

    /** The actions done so far, one line each (recording stand-ins only). */
    public List<String> log() {
        return log;
    }
}
