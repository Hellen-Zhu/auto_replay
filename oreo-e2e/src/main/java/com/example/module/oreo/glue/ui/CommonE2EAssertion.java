package com.example.module.oreo.glue.ui;

import com.microsoft.playwright.Locator;
import com.example.genie.module.playwright.glue.transformer.LocatorTransformer;
import cucumber.api.Scenario;
import cucumber.api.Transform;
import cucumber.api.java.Before;
import cucumber.api.java.en.And;
import cucumber.api.java.en.Then;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CommonE2EAssertion {

    private static final Logger log = LoggerFactory.getLogger(CommonE2EAssertion.class);

    private PlaywrightServiceResolver.Context ctx;

    @Before({"@playwright"})
    public void beforeScenario(Scenario scenario) { this.ctx = PlaywrightServiceResolver.from(scenario); }

    @Then("^assert that '(.+)' is eventually visible$")
    public void assertEventuallyVisible(@Transform(LocatorTransformer.class) Locator element) {
        log.debug("[CommonE2EAssertion] assertEventuallyVisible");
        ctx.assertEventuallyVisible(element);
    }

    @Then("^assert that element '([^']*)' with dynamic value from stored variable '([^']*)' is eventually visible$")
    public void assertDynamicElementEventuallyVisible(String locatorName,String dynamicCtxKey) {
        String dynamicValue = ctx.get(dynamicCtxKey);
        ctx.write("Dynamic value from scenario context variable '" + dynamicCtxKey + "' is: " + dynamicValue);
        log.debug("[CommonE2EAssertion] assert dynamic value Eventually Visible");
        ctx.assertEventuallyVisible(ctx.getLocatorWithParam(locatorName, dynamicValue));
    }

    @And("^assert that inner '([^']*)' property of '([^']*)' is eventually visible$")
    public void assertInnerElementVisible(String innerSelector, @Transform(LocatorTransformer.class) Locator elementKey) {
        log.debug("[CommonE2EAssertion] assertInnerElementVisible: innerSelector={}, element={}", innerSelector, elementKey);
        Locator innerElement = resolveInnerElement(elementKey, innerSelector);
        ctx.assertEventuallyVisible(innerElement);
    }

    @And("^assert that inner '([^']*)' property of '([^']*)' is eventually hidden$")
    public void assertInnerElementHidden(String innerSelector, @Transform(LocatorTransformer.class) Locator elementKey) {
        log.debug("[CommonE2EAssertion] assertInnerElementHidden: innerSelector={}, element={}", innerSelector, elementKey);
        Locator innerElement = resolveInnerElement(elementKey, innerSelector);
        ctx.assertEventuallyHidden(innerElement);
    }

    @And("^assert that '(.+)' is eventually hidden$")
    public void assertEventuallyHidden(@Transform(LocatorTransformer.class) Locator element) {
        log.debug("[CommonE2EAssertion] assertEventuallyHidden");
        ctx.assertEventuallyHidden(element);
    }

    @Then("^assert that element '([^']*)' with dynamic value from stored variable '([^']*)' is eventually hidden$")
    public void assertDynamicElementEventuallyHidden(String locatorName,String dynamicCtxKey) {
        String dynamicValue = ctx.get(dynamicCtxKey);
        ctx.write("Dynamic value from scenario context variable '" + dynamicCtxKey + "' is: " + dynamicValue);
        log.debug("[CommonE2EAssertion] assert dynamic value Eventually Hidden");
        ctx.assertEventuallyHidden(ctx.getLocatorWithParam(locatorName, dynamicValue));
    }

    /**
     * Asserts that the resolved element is eventually enabled.
     *
     * <p>Polls via {@code PlaywrightAssertions.assertThat(locator).isEnabled()} — retries
     * until enabled or 5-second timeout expires. Safe for buttons or inputs that become
     * interactive after data loading or form validation completes.
     *
     * @param element locator resolved from element repository by {@code LocatorTransformer}
     */
    @And("^assert that '(.+)' is eventually enabled$")
    public void assertEventuallyEnabled(@Transform(LocatorTransformer.class) Locator element) {
        log.debug("[CommonE2EAssertion] assertEventuallyEnabled");
        ctx.assertEventuallyEnabled(element);
    }

    @And("^assert that inner '([^']*)' property of '([^']*)' is eventually enabled$")
    public void assertInnerElementEnabled(String innerSelector, @Transform(LocatorTransformer.class) Locator elementKey) {
        log.debug("[CommonE2EAssertion] assertInnerElementEnabled: innerSelector={}, element={}", innerSelector, elementKey);
        Locator innerElement = resolveInnerElement(elementKey, innerSelector);
        ctx.assertEventuallyEnabled(innerElement);
    }

    @And("^assert that inner '([^']*)' property of '([^']*)' is eventually disabled$")
    public void assertInnerElementDisabled(String innerSelector, @Transform(LocatorTransformer.class) Locator elementKey) {
        log.debug("[CommonE2EAssertion] assertInnerElementDisabled: innerSelector={}, element={}", innerSelector, elementKey);
        Locator innerElement = resolveInnerElement(elementKey, innerSelector);
        ctx.assertEventuallyDisabled(innerElement);
    }

    private Locator resolveInnerElement(Locator element, String innerSelector) {
        return element.locator(innerSelector);
    }
    /**
     * Asserts that the resolved element is eventually disabled.
     *
     * <p>Polls via {@code PlaywrightAssertions.assertThat(locator).isDisabled()} — retries
     * until disabled or 5-second timeout expires. Safe for fields that become read-only
     * after async mode transitions (e.g. Product ID locked after save).
     *
     * @param element locator resolved from element repository by {@code LocatorTransformer}
     */
    @And("^assert that '(.+)' is eventually disabled$")
    public void assertEventuallyDisabled(@Transform(LocatorTransformer.class) Locator element) {
        log.debug("[CommonE2EAssertion] assertEventuallyDisabled");
        ctx.assertEventuallyDisabled(element);
    }

    @Then("^assert that '(.+)' eventually contains '(.+)'$")
    public void assertEventuallyContains(
            @Transform(LocatorTransformer.class) Locator element, String text) {
        log.debug("[CommonE2EAssertion] assertEventuallyContains: {}", text);
        ctx.assertEventuallyContains(element, text);
    }

    @Then("^assert that '(.+)' eventually contains inner '(.+)' property value as '(.+)'$")
    public void assertEventuallyContainsInnerValue(
            @Transform(LocatorTransformer.class) Locator element, String property, String text) {
        Locator inputElement = element.locator(property);
        ctx.assertEventuallyContains(inputElement, text);
    }

    @Then("^assert that '(.+)' eventually contains from stored variable '(.+)'$")
    public void assertEventuallyContainsFromVariable(
            @Transform(LocatorTransformer.class) Locator element, String ctxKey) {
        String expected = ctx.get(ctxKey);
        ctx.write("Expected text for element '" + element + "' from scenario context variable '" + ctxKey + "' is: " + expected);
        ctx.assertEventuallyContains(element, expected);
    }

    @Then("^assert that '(.+)' eventually contains inner '(.+)' property value from stored variable '(.+)'$")
    public void assertEventuallyContainsInnerValueFromVariable(
            @Transform(LocatorTransformer.class) Locator element, String property, String ctxKey) {
        String expected = ctx.get(ctxKey);
        Locator inputElement = element.locator(property);
        ctx.assertEventuallyContains(inputElement, expected);
    }

    @Then("^assert that '(.+)' eventually has value '(.+)'$")
    public void assertEventuallyHasValue(
            @Transform(LocatorTransformer.class) Locator element, String value) {
        log.debug("[CommonE2EAssertion] assertEventuallyHasValue: {}", value);
        ctx.assertHasValue(element, value);
    }

    @Then("^assert that '(.+)' eventually has value from stored variable '(.+)'$")
    public void assertEventuallyHasValueFromVariable(
            @Transform(LocatorTransformer.class) Locator element, String ctxKey) {
        String expected = ctx.get(ctxKey);
        log.debug("[CommonE2EAssertion] assertEventuallyHasValue: {}", expected);
        ctx.assertHasValue(element, expected);
    }

    @Then("^assert that '(.+)' eventually has inner '(.+)' property value as '(.+)'$")
    public void assertEventuallyHasInnerValue(
            @Transform(LocatorTransformer.class) Locator element, String property,  String value) {
        log.debug("[CommonE2EAssertion] assertEventuallyHasValue: {}", value);
        Locator inputElement = element.locator(property);
        ctx.assertHasValue(inputElement, value);
    }

    @Then("^assert that '(.+)' eventually has inner '(.+)' property value from stored variable '(.+)'$")
    public void assertEventuallyHasInnerValueFromVariable(
            @Transform(LocatorTransformer.class) Locator element, String property, String ctxKey) {
        String expected = ctx.get(ctxKey);
        Locator inputElement = element.locator(property);
        ctx.assertHasValue(inputElement, expected);
    }

    @Then("^assert that inner '([^']*)' property of '([^']*)' with dynamic value from stored variable '([^']*)' eventually has value from stored variable '([^']*)'$")
    public void assertInnerValueFromVariableWithDynamicValue(
            String property,
            String locatorName,
            String dynamicValueCtxKey,
            String valueCtxKey) {
        String dynamicValue = ctx.get(dynamicValueCtxKey);
        String expected = ctx.get(valueCtxKey);
        Locator inputElement = ctx.getLocatorWithParam(locatorName, dynamicValue).locator(property);
        ctx.assertHasValue(inputElement, expected);
    }
}
