package com.example.module.oreo.glue.ui;

import com.microsoft.playwright.Locator;
import cucumber.api.Scenario;
import cucumber.api.java.Before;
import cucumber.api.java.en.Then;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

public class ToastSteps {

    private static final Logger log = LoggerFactory.getLogger(ToastSteps.class);
    private static final String JSON_UNIT_REGEX_PREFIX = "${json-unit.regex}";
    private static final long POLL_INTERVAL_MILLIS = 200L;

    private PlaywrightServiceResolver.Context ctx;

    @Before({"@playwright"})
    public void beforeScenario(Scenario scenario) { this.ctx = PlaywrightServiceResolver.from(scenario); }

    @Then("^assert toast notification with type '([^']*)' and message '([^']*)'$")
    public void assertToastNotificationWithTypeAndMessage(String expectedType, String expectedMessage) {
        assertToastField(expectedType, expectedMessage, "[data-description]", "description");
    }

    @Then("^assert toast notification with type '([^']*)' and message from stored variable '([^']*)'$")
    public void assertToastNotificationWithTypeAndMessageFromStoredVariable(String expectedType, String messageVarName) {
        String expectedMessage = ctx.get(messageVarName);
        if (expectedMessage == null || expectedMessage.isBlank()) {
            throw new AssertionError(
                    "[ToastSteps] stored variable '" + messageVarName
                            + "' is null/blank — cannot assert toast notification description.");
        }
        assertToastField(expectedType, expectedMessage, "[data-description]", "description");
    }

    @Then("^assert toast notification with type '([^']*)' and title as '([^']*)'$")
    public void assertToastNotificationWithTypeAndTitle(String expectedType, String expectedTitle) {
        assertToastField(expectedType, expectedTitle, "[data-title]", "title");
    }

    @Then("^assert toast notification with type '([^']*)' and title from stored variable '([^']*)'$")
    public void assertToastNotificationWithTypeAndTitleFromStoredVariable(String expectedType, String titleVarName) {
        String expectedTitle = ctx.get(titleVarName);
        if (expectedTitle == null || expectedTitle.isBlank()) {
            throw new AssertionError(
                    "[ToastSteps] stored variable '" + titleVarName
                            + "' is null/blank — cannot assert toast notification title.");
        }
        assertToastField(expectedType, expectedTitle, "[data-title]", "title");
    }

    private void assertToastField(String expectedType, String expectedValue, String fieldSelector, String fieldName) {
        Locator allToasts = ctx.service().getLocator("toast.notification");

        long deadline = System.currentTimeMillis() + ctx.timeoutMillis();
        List<String> lastVisibleToastSummaries = new ArrayList<>();

        while (System.currentTimeMillis() < deadline) {
            lastVisibleToastSummaries = new ArrayList<>();

            int count = allToasts.count();
            for (int i = 0; i < count; i++) {
                Locator toast = allToasts.nth(i);
                if (!toast.isVisible()) {
                    continue;
                }

                Locator field = toast.locator(fieldSelector);
                if (field.count() == 0 || !field.first().isVisible()) {
                    continue;
                }

                String actualValue = field.first().innerText().trim();
                String normalizedValue = normalizeWhitespace(actualValue);
                String type = toast.getAttribute("data-type");

                lastVisibleToastSummaries.add("[type=" + type + "][" + fieldName + "=" + normalizedValue + "]");

                if (messageMatches(normalizedValue, expectedValue)) {
                    if (type == null || !type.contains(expectedType)) {
                        throw new AssertionError(
                                "[ToastSteps] Found toast containing expected " + fieldName + ", but type mismatch."
                                        + " expectedType='" + expectedType + "', actualType='" + type
                                        + "', " + fieldName + "='" + normalizedValue + "'");
                    }

                    ctx.write("[toast] matched toast: [type=" + type + "][" + fieldName + "=" + normalizedValue + "]");
                    log.info("[ToastSteps] matched toast with type='{}' and {}='{}'",
                            expectedType, fieldName, expectedValue);
                    return;
                }
            }

            sleep(POLL_INTERVAL_MILLIS);
        }

        throw new AssertionError(
                "[ToastSteps] Could not find visible toast with type='"
                        + expectedType + "' and " + fieldName + " containing '" + expectedValue
                        + "'. Visible toasts: " + lastVisibleToastSummaries);
    }

    private boolean messageMatches(String actualMessage, String expectedMessage) {
        if (expectedMessage.startsWith(JSON_UNIT_REGEX_PREFIX)) {
            String regex = normalizeWhitespace(expectedMessage.substring(JSON_UNIT_REGEX_PREFIX.length()));
            return Pattern.compile(regex).matcher(actualMessage).find();
        }

        String normalizedExpected = normalizeWhitespace(expectedMessage);
        return actualMessage.contains(normalizedExpected);
    }

    private String normalizeWhitespace(String value) {
        return value == null ? null : value.replaceAll("\\s+", " ").trim();
    }

    private void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AssertionError("[ToastSteps] Interrupted while waiting for toast notification.", e);
        }
    }
}
