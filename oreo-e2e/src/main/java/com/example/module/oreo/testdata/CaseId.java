package com.example.module.oreo.testdata;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A case ID {@code TC-<EVENT>[-<PRODUCT>]-<API|UI>-<NNN>}, e.g. {@code TC-TRADE-CREATION-FX_PSCRIPT_TRF-API-002}.
 *
 * <p>The channel selects the data tree ({@code data/api/}, {@code data/ui/}); the event names the data file
 * ({@code TRADE-CREATION} -> {@code trade_creation.json}, the feature file's name); the product is the token
 * before the channel when it is a {@link ProductDatFiles} constant. Products contain {@code _}, events never do,
 * so a token with {@code _} that is not a registered product is an error rather than part of the event.
 *
 * @param product the product, or {@code null} when the case ID has none
 * @param channel {@code API} or {@code UI}
 */
public record CaseId(String raw, String event, String product, String channel, String number) {

    private static final Pattern SCENARIO_NAME = Pattern.compile("\\[([^\\]]+)\\]");
    private static final Pattern WORD = Pattern.compile("[A-Z0-9]+");
    private static final Pattern NUMBER = Pattern.compile("\\d+");
    private static final Pattern PLACEHOLDER = Pattern.compile("<[^>]+>");
    private static final String GRAMMAR = "TC-<EVENT>[-<PRODUCT>]-<API|UI>-<NNN>";

    public static CaseId parse(String raw) {
        if (raw == null || !raw.startsWith("TC-")) {
            throw invalid(raw, "it does not start with TC-");
        }
        String[] tokens = raw.substring(3).split("-", -1);
        if (tokens.length < 3) {
            throw invalid(raw, "it needs an event, a channel and a number");
        }
        String number = tokens[tokens.length - 1];
        if (!NUMBER.matcher(number).matches()) {
            throw invalid(raw, "'" + number + "' is not a number");
        }
        String channel = tokens[tokens.length - 2];
        if (!channel.equals("API") && !channel.equals("UI")) {
            throw invalid(raw, "'" + channel + "' is not a channel (API or UI)");
        }
        int eventEnd = tokens.length - 2;
        String product = null;
        String beforeChannel = tokens[eventEnd - 1];
        if (products().contains(beforeChannel)) {
            product = beforeChannel;
            eventEnd--;
        } else if (beforeChannel.contains("_")) {
            throw invalid(raw, "'" + beforeChannel + "' is not a product of ProductDatFiles " + products()
                    + ": add it there first");
        }
        if (eventEnd < 1) {
            throw invalid(raw, "it has no event");
        }
        for (int i = 0; i < eventEnd; i++) {
            if (!WORD.matcher(tokens[i]).matches()) {
                throw invalid(raw, "'" + tokens[i] + "' is not an event word (A-Z, 0-9)");
            }
        }
        String event = String.join("-", Arrays.copyOfRange(tokens, 0, eventEnd));
        return new CaseId(raw, event, product, channel, number);
    }

    /** The case ID in a scenario name: the first bracket text starting with {@code TC-}, or {@code null}. */
    public static String fromScenarioName(String scenarioName) {
        if (scenarioName == null) return null;
        Matcher m = SCENARIO_NAME.matcher(scenarioName);
        while (m.find()) {
            String candidate = m.group(1);
            if (candidate.startsWith("TC-")) return candidate;
        }
        return null;
    }

    /**
     * Fails unless {@code rowId} is a case ID, or a Scenario Outline's ID whose only {@code <...>} placeholder
     * stands for the product, right before the channel ({@code TC-TRADE-CREATION-<product_type>-API-002}).
     */
    public static void checkRowId(String rowId) {
        Matcher m = PLACEHOLDER.matcher(rowId == null ? "" : rowId);
        if (!m.find()) {
            parse(rowId);
            return;
        }
        int start = m.start();
        int end = m.end();
        if (m.find()) {
            throw invalid(rowId, "a row ID has at most one <...> placeholder");
        }
        String rest = rowId.substring(end);
        if (start == 0 || rowId.charAt(start - 1) != '-' || !rest.matches("-(API|UI)-\\d+")) {
            throw invalid(rowId, "the <...> placeholder must stand for the product, right before the channel");
        }
        parse(rowId.substring(0, start) + products().get(0) + rest);
    }

    /** {@code true} when {@code rowId} (as written in the feature) is this case's row. */
    public boolean matchesRow(String rowId) {
        Matcher m = PLACEHOLDER.matcher(rowId);
        if (!m.find()) {
            return raw.equals(rowId);
        }
        return product != null
                && raw.equals(rowId.substring(0, m.start()) + product + rowId.substring(m.end()));
    }

    /** {@code TRADE-CREATION} -> {@code trade_creation}: the data file and feature file name. */
    public String eventFile() {
        return event.toLowerCase(Locale.ROOT).replace('-', '_');
    }

    /** {@code api} or {@code ui}. */
    public String channelDir() {
        return channel.toLowerCase(Locale.ROOT);
    }

    private static List<String> products() {
        return Arrays.stream(ProductDatFiles.values()).map(Enum::name).toList();
    }

    private static IllegalArgumentException invalid(String raw, String reason) {
        return new IllegalArgumentException(
                "[CaseId] '" + raw + "' is not a case ID " + GRAMMAR + ": " + reason);
    }
}
