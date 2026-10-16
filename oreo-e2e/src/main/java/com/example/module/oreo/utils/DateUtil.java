package com.example.module.oreo.utils;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

public final class DateUtil {

    private static final DateTimeFormatter TS_FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS").withZone(ZoneId.systemDefault());

    private static final DateTimeFormatter DATE_FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private DateUtil() {}

    public static Instant now() {
        return Instant.now();
    }

    public static LocalDate today() {
        return LocalDate.now();
    }

    public static String format(Instant instant) {
        return TS_FMT.format(instant);
    }

    public static String format(Instant instant, String pattern) {
        return DateTimeFormatter.ofPattern(pattern)
                .withZone(ZoneId.systemDefault())
                .format(instant);
    }

    public static long elapsedMs(Instant start, Instant end) {
        return end.toEpochMilli() - start.toEpochMilli();
    }

    public static String formatDuration(long durationMs) {
        long minutes = durationMs / 60_000;
        long seconds = (durationMs % 60_000) / 1_000;
        long millis  = durationMs % 1_000;
        return String.format("%dm %ds %dms (%dms total)", minutes, seconds, millis, durationMs);
    }

    public static LocalDate nextBusinessDay(LocalDate date) {
        LocalDate next = date.plusDays(1);
        while (next.getDayOfWeek() == DayOfWeek.SATURDAY
                || next.getDayOfWeek() == DayOfWeek.SUNDAY) {
            next = next.plusDays(1);
        }
        return next;
    }

    public static LocalDate plusBusinessDays(LocalDate date, int days) {
        if (days < 0) {
            throw new IllegalArgumentException("days must be >= 0");
        }

        LocalDate result = date;
        for (int i = 0; i < days; i++) {
            result = nextBusinessDay(result);
        }
        return result;
    }

    public static String format(LocalDate date, String pattern) {
        return date.format(DateTimeFormatter.ofPattern(pattern));
    }

    /**
     * Resolve a relative date expression to an absolute {@code yyyy-MM-dd} string.
     *
     * <ul>
     *   <li>{@code T}   — today</li>
     *   <li>{@code T+N} — today plus N calendar days</li>
     *   <li>{@code T-N} — today minus N calendar days</li>
     *   <li>Any other value — returned as-is (pass-through for already-absolute dates)</li>
     * </ul>
     *
     * @param expression date expression from a Cucumber DataTable cell, e.g. {@code "T+3"}
     * @return resolved {@code yyyy-MM-dd} string, or the original value if not a T-expression
     */
    public static String resolveDate(String expression) {
        if (expression == null || expression.trim().isEmpty()) {
            return expression;
        }
        String s = expression.trim();
        if ("T".equalsIgnoreCase(s)) {
            return today().format(DATE_FMT);
        }
        if (s.toUpperCase().startsWith("T+")) {
            int days = Integer.parseInt(s.substring(2));
            return today().plusDays(days).format(DATE_FMT);
        }
        if (s.toUpperCase().startsWith("T-")) {
            int days = Integer.parseInt(s.substring(2));
            return today().minusDays(days).format(DATE_FMT);
        }
        return s;
    }
}
