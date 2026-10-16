package com.example.module.oreo.glue.hooks;

import com.example.genie.module.rest.service.RequestResponseHelper;
import com.example.module.oreo.testdata.TestDataLoader;
import com.example.module.oreo.utils.RestApiUtil;
import cucumber.api.Scenario;
import cucumber.api.java.Before;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class E2EScenarioHooks {
    private static final Logger log = LoggerFactory.getLogger(E2EScenarioHooks.class);

    @Before(value = "@playwright", order = 2)
    public void resetUserPreferenceDefaults(Scenario scenario) {
        log.info("[E2EScenarioHooks] reset user preferences to defaults");

        RequestResponseHelper helper = RestApiUtil.helperFromScenario(scenario);
        String payload = TestDataLoader.forKey("SETUP-USER-PREFERENCE-CONFIG-DEFAULTS").request();

        RestApiUtil.put(helper, "/uc/api/user-preferences", "maker@example.com", payload);
        RestApiUtil.put(helper, "/uc/api/user-preferences", "checker@example.com", payload);
    }
}
