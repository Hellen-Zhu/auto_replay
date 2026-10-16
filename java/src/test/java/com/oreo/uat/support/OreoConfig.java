package com.oreo.uat.support;

import java.util.Locale;
import java.util.Optional;
import java.util.function.Function;

/**
 * Environment values: accounts and the risk engine mode (genie.properties in the E2E project). Never test data,
 * never written in a file of the repo: read from system properties {@code oreo.<key>}
 * ({@code -Doreo.accounts.maker.email=...}).
 */
public final class OreoConfig {

    public enum RiskEngineMode { REAL, MOCK }

    private final Function<String, String> source;
    private final boolean placeholders;

    private OreoConfig(Function<String, String> source, boolean placeholders) {
        this.source = source;
        this.placeholders = placeholders;
    }

    public static OreoConfig fromSystemProperties() {
        return new OreoConfig(key -> System.getProperty("oreo." + key), false);
    }

    /**
     * For the recording session: a required value missing from the system properties is its own key in angle
     * brackets ({@code <accounts.maker.email>}), so nothing real is needed to run it.
     */
    public static OreoConfig placeholders() {
        return new OreoConfig(key -> System.getProperty("oreo." + key), true);
    }

    public String get(String key) {
        String value = source.apply(key);
        if (value != null && !value.isBlank()) {
            return value;
        }
        if (placeholders) {
            return "<" + key + ">";
        }
        throw new IllegalStateException("Missing setting oreo." + key + " (pass -Doreo." + key + "=...)");
    }

    public Optional<String> find(String key) {
        return Optional.ofNullable(source.apply(key)).filter(v -> !v.isBlank());
    }

    /** The account's e-mail of a role: also its user ID for the API. */
    public String email(String role) {
        return get("accounts." + role + ".email");
    }

    public String password(String role) {
        return get("accounts." + role + ".password");
    }

    /** {@code oreo.riskEngine} = real (default) or mock. */
    public RiskEngineMode riskEngineMode() {
        return RiskEngineMode.valueOf(find("riskEngine").orElse("real").toUpperCase(Locale.ROOT));
    }
}
