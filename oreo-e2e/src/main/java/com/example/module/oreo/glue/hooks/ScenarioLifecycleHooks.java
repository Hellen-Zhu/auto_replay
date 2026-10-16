package com.example.module.oreo.glue.hooks;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.genie.model.GenieScenario;
import com.example.module.oreo.testdata.TestDataLoader;
import com.example.module.oreo.testdata.TestDataRecord;
import com.example.module.oreo.utils.DateUtil;
import cucumber.api.Scenario;
import cucumber.api.java.After;
import cucumber.api.java.Before;
import org.apache.logging.log4j.ThreadContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class ScenarioLifecycleHooks {

    private static final Logger log = LoggerFactory.getLogger(ScenarioLifecycleHooks.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /**
     * Absolute path to failed-scenarios.log, resolved once at class-load time via
     * classpath lookup so it works in Genie DISCRETE fork JVMs regardless of user.dir.
     * log4j2.xml lives in target/test-classes/, so its parent IS target/.
     */
    private static final Path FAILED_LOG_PATH = resolveFailedLogPath();

    private static Path resolveFailedLogPath() {
        try {
            URL log4j2 = ScenarioLifecycleHooks.class.getClassLoader().getResource("log4j2.xml");
            Path targetDir = Paths.get(log4j2.toURI()).getParent().getParent();
            String timestamp = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss")
                    .format(LocalDateTime.now());
            Path resultsDir = targetDir.resolve("results");
            Files.createDirectories(resultsDir);
            return resultsDir.resolve("failed-scenarios-" + timestamp + ".log");
        } catch (Exception e) {
            return Paths.get("target", "failed-scenarios.log").toAbsolutePath();
        }
    }

    /** Per-thread start time; safe because Genie runs one scenario per thread per fork. */
    private Instant scenarioStartTime;

    // -------------------------------------------------------------------------
    // Before — order 0: logging
    // -------------------------------------------------------------------------

    @Before(order = 0)
    public void beforeScenario(Scenario scenario) {
        scenarioStartTime = DateUtil.now();
        ThreadContext.put("threadName", Thread.currentThread().getName() + "_" + Thread.currentThread().threadId());
        log.info("========================================");
        log.info("[SCENARIO BEGIN] {} | Start: {}", scenario.getName(), DateUtil.format(scenarioStartTime));
        log.info("========================================");
    }

    // -------------------------------------------------------------------------
    // Before — order 1: auto-inject YAML test data into scenario ctx
    // -------------------------------------------------------------------------

    /**
     * Flattens the YAML {@code request:} JSON for the current scenario's TC-ID and
     * [not in the photos: the rest of this Javadoc]
     */
    @Before(order = 1)
    public void injectTestDataIntoContext(Scenario scenario) {
        GenieScenario genieScenario = asGenieScenario(scenario);
        logScenarioContext(genieScenario, "before test-data injection");

        String tcId = TestDataLoader.tcKeyFromName(scenario.getName());
        if (tcId == null) {
            log.debug("[ScenarioLifecycleHooks] No [TC-...] token found in scenario name for '{}' — skipping data injection",
                    scenario.getName());
            return;
        }

        TestDataRecord record;
        try {
            record = TestDataLoader.getByTcId(tcId);
        } catch (AssertionError e) {
            // Scenario name contains a TC-ID but no matching YAML entry was found.
            log.warn("[ScenarioLifecycleHooks] TC-ID '{}' from scenario name has no YAML entry — ctx injection skipped for '{}'. "
                            + "If this scenario reads from ctx, check data/**/*.yml for a matching key.",
                    tcId, scenario.getName());
            return;
        }

        // Always store framework keys for step-class access
        genieScenario.setAttribute("_tc.key",      tcId);
        genieScenario.setAttribute("_tc.request",  record.request());
        genieScenario.setAttribute("_tc.response", record.response());

        if (record.request() != null && !record.request().isBlank()) {
            genieScenario.write("[test-data:request] source=current scenario (TC-ID='" + tcId + "')\n"
                    + record.request());
        }
        if (record.response() != null && !record.response().isBlank()) {
            genieScenario.write("[test-data:response] source=current scenario (TC-ID='" + tcId + "')\n"
                    + record.response());
        }

        // Store each top-level request field as a JsonNode so step classes can do
        // ctx.get("_tc.request.subTrades") without going back to TestDataLoader
        if (record.request() != null) {
            try {
                JsonNode reqNode = OBJECT_MAPPER.readTree(record.request());
                reqNode.properties().forEach(e ->
                        genieScenario.setAttribute("_tc.request." + e.getKey(), e.getValue()));
            } catch (Exception e) {
                log.warn("[ScenarioLifecycleHooks] Failed to parse request JSON for '{}': {}",
                        tcId, e.getMessage());
            }
        }

        // Flatten leaf strings for snippet access (e.g. 'basic.counterpartyName')
        Map<String, String> fields = record.flattenRequest();
        if (fields.isEmpty()) {
            log.debug("[ScenarioLifecycleHooks] No request fields to inject for '{}'",
                    scenario.getName());
            return;
        }
        fields.forEach((key, value) -> {
            genieScenario.setAttribute(key, value);
            log.debug("[ScenarioLifecycleHooks] ctx[{}] = {}", key, value);
        });
        log.info("[ScenarioLifecycleHooks] Injected {} test-data field(s) into ctx for '{}'",
                fields.size(), scenario.getName());
        logScenarioContext(genieScenario, "after test-data injection");
    }

    // -------------------------------------------------------------------------
    // After
    // -------------------------------------------------------------------------

    @After(order = 100)
    public void afterScenario(Scenario scenario) {
        Instant end = DateUtil.now();
        long durationMs = DateUtil.elapsedMs(scenarioStartTime, end);
        boolean failed = scenario.isFailed();
        log.info("========================================");
        log.info("[SCENARIO END]   {} — {}", scenario.getName(), failed ? "FAILED" : "PASSED");
        log.info("  Start   : {}", DateUtil.format(scenarioStartTime));
        log.info("  End     : {}", DateUtil.format(end));
        log.info("  Duration: {}", DateUtil.formatDuration(durationMs));
        log.info("========================================");
        if (failed) {
            GenieScenario gs = asGenieScenario(scenario);
            String entry = String.format(
                    "%n==================================%n" +
                    "[%s] FAILED | %dms | %s | tags=%s%n" +
                    "  error: %s%n" +
                    "%s" +
                    "==================================%n",
                    DateUtil.format(end), durationMs, scenario.getName(),
                    scenario.getSourceTagNames(), extractError(scenario),
                    dumpCtx(gs));
            try {
                Files.writeString(FAILED_LOG_PATH, entry, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            } catch (IOException e) {
                log.warn("[ScenarioLifecycleHooks] Could not write failure log to {}: {}", FAILED_LOG_PATH, e.getMessage());
            }
        }
        ThreadContext.clearAll();
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * [not in the photos: the start of this Javadoc]
     * not just Genie's CucumberException wrapper.
     * GenieScenario inherits getError() from cucumber.runtime.ScenarioImpl.
     */
    private static String extractError(Scenario scenario) {
        try {
            Throwable error = ((GenieScenario) scenario).getError();
            if (error == null) return "(no error details)";

            StringBuilder sb = new StringBuilder();
            Throwable current = error;
            int depth = 0;
            while (current != null && depth < 3) {
                if (depth > 0) sb.append("\n    caused by: ");
                sb.append(current.getClass().getSimpleName()).append(": ").append(current.getMessage());
                for (StackTraceElement frame : current.getStackTrace()) {
                    if (frame.getClassName().contains("example")) {
                        sb.append("\n      at ").append(frame);
                        break;
                    }
                }
                current = current.getCause();
                depth++;
            }
            return sb.toString();
        } catch (Exception e) {
            return "(error unavailable: " + e.getMessage() + ")";
        }
    }

    private static GenieScenario asGenieScenario(Scenario scenario) {
        return (GenieScenario) scenario;
    }

    /**
     * Dumps ctx attributes into two groups:
     * - runtime variables: keys set by step classes during execution (no _tc. prefix)
     * - test data: injected YAML fields (_tc.* prefix, excluding raw JSON _tc.request/_tc.response)
     */
    private static String dumpCtx(GenieScenario gs) {
        try {
            Set<String> names = gs.getAttributeNames();
            if (names == null || names.isEmpty()) return "";

            List<String> runtimeKeys = names.stream()
                    .filter(n -> !n.startsWith("_tc."))
                    .sorted()
                    .toList();

            List<String> testDataKeys = names.stream()
                    .filter(n -> n.startsWith("_tc.")
                            && !n.equals("_tc.request")
                            && !n.equals("_tc.response"))
                    .sorted()
                    .toList();

            StringBuilder sb = new StringBuilder();
            if (!runtimeKeys.isEmpty()) {
                sb.append("  runtime variables:\n");
                runtimeKeys.forEach(n -> sb.append("    ").append(n).append(" = ").append((Object) gs.getAttribute(n)).append('\n'));
            }
            if (!testDataKeys.isEmpty()) {
                sb.append("  test data:\n");
                testDataKeys.forEach(n -> sb.append("    ").append(n).append(" = ").append((Object) gs.getAttribute(n)).append('\n'));
            }
            return sb.toString();
        } catch (Exception e) {
            return "  ctx: (unavailable: " + e.getMessage() + ")\n";
        }
    }

    private void logScenarioContext(GenieScenario genieScenario, String phase) {
        try {
            Set<String> names = genieScenario.getAttributeNames();
            if (names == null || names.isEmpty()) {
                log.info("[ScenarioLifecycleHooks] ctx is empty at {}", phase);
                return;
            }

            log.info("[ScenarioLifecycleHooks] ctx dump at {} ({} entries):", phase, names.size());
            names.stream()
                    .sorted()
                    .forEach(name -> {
                        Object value = genieScenario.getAttribute(name);
                        log.info("  ctx[{}] = {}", name, value);
                    });
        } catch (Exception e) {
            log.warn("[ScenarioLifecycleHooks] Failed to dump ctx at {}: {}", phase, e.getMessage());
        }
    }
}
