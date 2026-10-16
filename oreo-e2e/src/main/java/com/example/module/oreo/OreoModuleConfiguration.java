package com.example.module.oreo;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Locale;
import java.util.Optional;
import java.util.Properties;

/**
 * Environment settings, never test data: {@code genie.properties} on the classpath, then the environment's file it
 * names ({@code oreo.env=uat} -> {@code uat.properties}), then system properties ({@code -Doreo.<key>=...}), later
 * winning. Accounts and passwords are never in a committed file: pass them as system properties on the machine.
 */
public final class OreoModuleConfiguration {

    /** How a click that starts a risk calculation is handled (ctx.riskEngineMode() in the E2E project) */
    public enum Mode { REAL, MOCK }

    private final Properties properties;
    private final boolean placeholders;

    private OreoModuleConfiguration(Properties properties, boolean placeholders) {
        this.properties = properties;
        this.placeholders = placeholders;
    }

    /** The settings of the run */
    public static OreoModuleConfiguration load() {
        return new OreoModuleConfiguration(read(), false);
    }

    /**
     * For the recording stand-ins: a required value that is not set is its own key in angle brackets
     * ({@code <accounts.maker.email>}), so nothing real is needed to run.
     */
    public static OreoModuleConfiguration withPlaceholders() {
        return new OreoModuleConfiguration(read(), true);
    }

    private static Properties read() {
        Properties p = new Properties();
        load(p, "genie.properties");
        String env = System.getProperty("oreo.env", p.getProperty("oreo.env"));
        if (env != null && !env.isBlank()) {
            load(p, env + ".properties");
        }
        System.getProperties().forEach((k, v) -> {
            if (k.toString().startsWith("oreo.")) {
                p.setProperty(k.toString(), v.toString());
            }
        });
        return p;
    }

    private static void load(Properties p, String resource) {
        try (InputStream in = Thread.currentThread().getContextClassLoader().getResourceAsStream(resource)) {
            if (in != null) {
                p.load(in);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + resource, e);
        }
    }

    public String get(String key) {
        Optional<String> value = find(key);
        if (value.isPresent()) {
            return value.get();
        }
        if (placeholders) {
            return "<" + key + ">";
        }
        throw new IllegalStateException("Missing setting oreo." + key + " (pass -Doreo." + key + "=...)");
    }

    public Optional<String> find(String key) {
        return Optional.ofNullable(properties.getProperty("oreo." + key)).filter(v -> !v.isBlank());
    }

    /** The account's e-mail of a role: also its user ID for the API (header X-User-Id) */
    public String email(String role) {
        return get("accounts." + role + ".email");
    }

    public String password(String role) {
        return get("accounts." + role + ".password");
    }

    /** {@code oreo.riskEngine} = real (default) or mock */
    public Mode riskEngineMode() {
        return Mode.valueOf(find("riskEngine").orElse("real").toUpperCase(Locale.ROOT));
    }
}
