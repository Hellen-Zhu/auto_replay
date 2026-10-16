package com.example.module.oreo.utils;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * Times for the scenario log. Only the method names are known from the E2E project's hooks; the formats here are
 * assumed.
 */
public final class DateUtil {

    private static final DateTimeFormatter FORMAT =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS").withZone(ZoneId.systemDefault());

    private DateUtil() {
    }

    public static Instant now() {
        return Instant.now();
    }

    public static String format(Instant instant) {
        return instant == null ? "-" : FORMAT.format(instant);
    }

    public static long elapsedMs(Instant start, Instant end) {
        return start == null || end == null ? 0 : Duration.between(start, end).toMillis();
    }

    /** {@code 1m 05.123s}, or {@code 5.123s} under a minute. */
    public static String formatDuration(long ms) {
        long minutes = ms / 60_000;
        double seconds = (ms % 60_000) / 1000.0;
        return minutes > 0 ? String.format("%dm %06.3fs", minutes, seconds) : String.format("%.3fs", seconds);
    }
}
