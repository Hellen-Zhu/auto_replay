package com.oreo.uat.support;

import com.oreo.uat.fake.RecordingOreoApi;
import com.oreo.uat.fake.RecordingOreoUi;
import com.oreo.uat.hooks.ScenarioContext;
import java.util.ArrayList;
import java.util.List;

/**
 * What every step and page object of a scenario shares: the ctx, the browser, the API and the config. One per
 * scenario (PicoContainer). Here the browser and the API are recording stand-ins that log each action; in the E2E
 * project they are backed by Genie.
 */
public class OreoSession {

    private final ScenarioContext ctx;
    private final List<String> log = new ArrayList<>();
    private final OreoUi ui;
    private final OreoApi api;
    private final OreoConfig config;

    public OreoSession(ScenarioContext ctx) {
        this.ctx = ctx;
        this.ui = new RecordingOreoUi(log);
        this.api = new RecordingOreoApi(log);
        this.config = OreoConfig.placeholders();
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

    public OreoConfig config() {
        return config;
    }

    /** The actions done so far, one line each (recording stand-ins only). */
    public List<String> log() {
        return log;
    }
}
