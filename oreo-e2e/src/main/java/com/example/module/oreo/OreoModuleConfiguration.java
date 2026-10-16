package com.example.module.oreo;

import com.example.genie.module.GenieModule;
import com.example.genie.module.configuration.BaseGenieModuleConfiguration;
import com.example.genie.module.configuration.ConfigurationDescriptor;
import com.example.genie.module.configuration.DefaultConfigurationDescriptor;
import com.example.genie.type.ValueConverter;

import java.util.Locale;

public final class OreoModuleConfiguration extends BaseGenieModuleConfiguration {

    public final ConfigurationDescriptor<Mode> RISK_ENGINE_MODE = new DefaultConfigurationDescriptor<>(
            getGenieModule(),
            "risk.engine.mode",
            Mode.REAL,
            "Risk engine mode. Use MOCK to call mock APIs.",
            ValueConverter.createEnum(Mode.class)
    );

    public final ConfigurationDescriptor<TraceMode> PLAYWRIGHT_TRACE_MODE = new DefaultConfigurationDescriptor<>(
            getGenieModule(),
            "playwright.trace.mode",
            TraceMode.RETAIN_ON_FAILURE,
            "Playwright trace mode. Use ON, OFF, or RETAIN_ON_FAILURE.",
            ValueConverter.createEnum(TraceMode.class)
    );

    public OreoModuleConfiguration(GenieModule genieModule) {
        super(genieModule);
        addDescriptor(RISK_ENGINE_MODE);
        addDescriptor(PLAYWRIGHT_TRACE_MODE);
    }


    public enum Mode {
        MOCK,
        REAL;

        public static Mode from(String rawValue) {
            String normalized = rawValue == null ? "" : rawValue.trim().toUpperCase(Locale.ROOT);
            return switch (normalized) {
                case "MOCK" -> MOCK;
                case "REAL" -> REAL;
                default -> throw new IllegalArgumentException(
                        "Unsupported risk.engine.mode value '" + rawValue + "'. Expected one of: MOCK, REAL."
                );
            };
        }
    }

    public enum TraceMode {
        OFF,
        ON,
        RETAIN_ON_FAILURE
    }
}
