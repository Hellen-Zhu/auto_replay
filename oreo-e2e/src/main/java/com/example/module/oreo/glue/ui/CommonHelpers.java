package com.example.module.oreo.glue.ui;

import com.example.module.oreo.utils.DateUtil;
import cucumber.api.Scenario;
import cucumber.api.java.Before;
import cucumber.api.java.en.Given;
import cucumber.api.java.en.When;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

public class CommonHelpers {

    private static final Logger log = LoggerFactory.getLogger(CommonHelpers.class);

    private PlaywrightServiceResolver.Context ctx;

    @Before({"@playwright"})
    public void beforeScenario(Scenario scenario) { this.ctx = PlaywrightServiceResolver.from(scenario); }

    @When("^store today plus (\\d+) business day as '([^']*)' with format '([^']*)'$")
    public void storeTodayPlusBusinessDay(int days, String ctxKey, String pattern) {
        LocalDate date = DateUtil.plusBusinessDays(DateUtil.today(), days);
        String value = date.format(DateTimeFormatter.ofPattern(pattern, Locale.ENGLISH));

        ctx.set(ctxKey, value);
        ctx.write("Stored '" + ctxKey + "' as '" + value + "' using today plus " + days
                + " business day in format '" + pattern + "'.");
        log.info("[CommonHelpers] Stored ctx['{}']='{}' using today plus {} business day(s), format='{}'",
                ctxKey, value, days, pattern);
    }

    @Given("^a dynamic timestamp with prefix '(.+)' is generated and stored as '(.+)'$")
    public void generatePrefixedTimestamp(String prefix, String key) {
        String ts = DateUtil.format(DateUtil.now(), "MMddHHmmss");
        String value = prefix + "-" + ts;
        ctx.set(key, value);

        ctx.write("Stored '" + key + "' as '" + value + "'.");
        log.info("[CommonHelpers] Stored ctx['{}']='{}' using prefix='{}' and pattern='MMddHHmmss'",
                key, value, prefix);
    }
}
