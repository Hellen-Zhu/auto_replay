package com.example.module.oreo.glue.api;

import com.example.genie.model.GenieScenario;
import com.example.genie.module.rest.RestModule;
import com.example.genie.module.rest.service.RequestResponseHelper;
import com.example.module.oreo.glue.ScenarioContext;
import cucumber.api.Scenario;

public final class RestServiceResolver {

    private RestServiceResolver() {}

    /**
     * Resolves REST infrastructure for the given scenario.
     *
     * @throws RuntimeException if {@code RequestResponseHelper} is absent
     *                          (scenario not tagged {@code @api} or REST module not initialised)
     */
    public static Context from(Scenario scenario) {
        GenieScenario genieScenario = (GenieScenario) scenario;
        RequestResponseHelper helper =
                genieScenario.getAttribute(RestModule.REQUEST_RESPONSE_HELPER);
        if (helper == null) {
            throw new RuntimeException(
                    "[RestServiceResolver] RequestResponseHelper not initialized. "
                    + "Make sure your scenario is tagged with @api and the REST module is active.");
        }
        return new Context(genieScenario, helper);
    }

    // -------------------------------------------------------------------------
    // Context — holds REST helper + scenario-scoped variable store
    // -------------------------------------------------------------------------

    /**
     * Per-scenario context available to all REST/API step classes.
     * Implements {@link ScenarioContext} for cross-step data sharing.
     */
    public static final class Context extends ScenarioContext {

        private final RequestResponseHelper helper;

        private Context(GenieScenario genieScenario, RequestResponseHelper helper) {
            super(genieScenario);
            this.helper = helper;
        }

        /**
         * The REST request/response helper for building and asserting API calls.
         */
        public RequestResponseHelper helper() {
            return helper;
        }
    }
}
