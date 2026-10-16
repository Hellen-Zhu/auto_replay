package com.example.module.oreo.glue.hooks;

import com.example.module.oreo.OreoModule;
import com.example.module.oreo.testdata.TestDataLoader;
import io.cucumber.java.Before;
import io.cucumber.java.Scenario;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * As in the E2E project, which sends the request with {@code RestApiUtil.put(RestApiUtil.helperFromScenario(scenario),
 * ...)} and names the two accounts' e-mails literally; here it goes through {@link OreoModule#api()} and the e-mails
 * come from the config.
 */
public class E2EScenarioHooks {
    private static final Logger log = LoggerFactory.getLogger(E2EScenarioHooks.class);

    private final OreoModule session;

    public E2EScenarioHooks(OreoModule session) {
        this.session = session;
    }

    @Before(value = "@playwright", order = 2)
    public void resetUserPreferenceDefaults(Scenario scenario) {
        log.info("[E2EScenarioHooks] reset user preferences to defaults");

        String payload = TestDataLoader.forKey("SETUP-USER-PREFERENCE-CONFIG-DEFAULTS").request();

        session.api().putJson("/uc/api/user-preferences", session.config().email("maker"), payload);
        session.api().putJson("/uc/api/user-preferences", session.config().email("checker"), payload);
    }
}
