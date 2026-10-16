package com.example.module.oreo.glue.ui;

import com.microsoft.playwright.Frame;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Request;
import com.microsoft.playwright.Response;
import com.microsoft.playwright.Route;
import com.microsoft.playwright.assertions.LocatorAssertions;
import com.microsoft.playwright.assertions.PlaywrightAssertions;
import com.example.genie.model.GenieScenario;
import com.example.genie.module.playwright.core.PlaywrightElementRepository;
import com.example.genie.module.playwright.core.PlaywrightLocatorWrapper;
import com.example.genie.module.playwright.core.PlaywrightService;
import com.example.module.oreo.glue.ScenarioContext;
import com.example.module.oreo.OreoModule;
import com.example.module.oreo.OreoModuleConfiguration;
import cucumber.api.Scenario;

import java.lang.reflect.Field;
import java.util.regex.Pattern;

public final class PlaywrightServiceResolver {

    private PlaywrightServiceResolver() {
    }

    /**
     * Resolves Playwright infrastructure for the given scenario.
     *
     * @throws RuntimeException if {@code playwrightService} is absent
     *                          (scenario not tagged {@code @playwright})
     */
    public static Context from(Scenario scenario) {
        GenieScenario genieScenario = (GenieScenario) scenario;
        PlaywrightService service = genieScenario.getRuntime().getAttribute("playwrightService");
        if (service == null) {
            throw new RuntimeException(
                    "PlaywrightService not initialized. Make sure your scenario is tagged with @playwright");
        }
        return new Context(genieScenario, service);
    }

    public static final class Context extends ScenarioContext {

        private static final long DEFAULT_TIMEOUT_MILLIS = 50_000L;
        private final GenieScenario genieScenario;
        private final PlaywrightService service;

        private Context(GenieScenario genieScenario, PlaywrightService service) {
            super(genieScenario);
            this.genieScenario = genieScenario;
            this.service = service;
        }

        /**
         * The Playwright service for browser interaction.
         */
        public PlaywrightService service() { return service; }

        /**
         * Returns the configured risk engine mode, allowing a scenario attribute to override it.
         */
        public OreoModuleConfiguration.Mode riskEngineMode() {
            String scenarioMode = find("risk.engine.mode");
            if (scenarioMode != null && !scenarioMode.isBlank()) {
                return OreoModuleConfiguration.Mode.from(scenarioMode);
            }

            OreoModule module = genieScenario.getRuntime().getModule(OreoModule.class);
            if (module == null) {
                throw new IllegalStateException("OreoModule is not active in the current Genie runtime");
            }
            return module.getConfiguration().RISK_ENGINE_MODE.getValue();
        }

        /**
         * Default timeout used by Context helpers, aligned with playwright.timeout.
         */
        public long timeoutMillis() {
            long configuredTimeout = service.getConfiguration().getTimeout();
            return configuredTimeout > 0 ? configuredTimeout : DEFAULT_TIMEOUT_MILLIS;
        }

        public void navigateToPath(String path) {
            if (path == null || path.isBlank()) {
                throw new IllegalArgumentException("path must not be null/blank");
            }
            if (!path.startsWith("/")) {
                throw new IllegalArgumentException("path must start with '/', but was: " + path);
            }

            String baseUrl = service.getConfiguration().getBaseUrl();
            if (baseUrl == null || baseUrl.isBlank()) {
                throw new IllegalStateException("playwright.base.url is not configured");
            }

            String normalizedBase = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
            String url = normalizedBase + path;

            service.getPage().navigate(
                    url,
                    new Page.NavigateOptions()
                            .setWaitUntil(com.microsoft.playwright.options.WaitUntilState.DOMCONTENTLOADED)
                            .setTimeout(timeoutMillis())
            );
        }

        public Locator getLocatorWithParam(String name, String value) {
            try {
                Field repoField = PlaywrightService.class.getDeclaredField("playwrightElementRepository");
                repoField.setAccessible(true);
                PlaywrightElementRepository repo = (PlaywrightElementRepository) repoField.get(service);

                Field frameCtxField = PlaywrightService.class.getDeclaredField("pageFrameContexts");
                frameCtxField.setAccessible(true);
                // [shown in the photo as "/unchecked/"]
                java.util.Map<Page, Frame> pageFrameContexts = (java.util.Map<Page, Frame>) frameCtxField.get(service);

                Page currentPage = service.getPage();
                Frame currentFrame = pageFrameContexts.get(currentPage);

                PlaywrightLocatorWrapper wrapper = repo.lookup(name);
                PlaywrightLocatorWrapper resolved = new PlaywrightLocatorWrapper(
                        wrapper.getFindBy(), wrapper.getValue().replace("{0}", value));
                return resolved.getLocator(currentPage, currentFrame);
            } catch (ReflectiveOperationException e) {
                throw new RuntimeException("getLocatorWithParam failed for: " + name, e);
            }
        }


        // ── UI primitives ──────────────────────────────────────────────

        /**
         * Fills a React-controlled {@code <input type="date">} via {@code pressSequentially} and
         * a dispatched native {@code change} event, so React's synthetic onChange fires and any
         * {@code hasChanges} state becomes true. Use this instead of {@code locator.fill()} for
         * date inputs — {@code fill()} throws {@code Malformed value} at the Playwright layer
         * because Playwright validates the value format against the input type before writing it.
         *
         * @param elementKey element repository key of the date input
         * @param value      date string to type (format must match the input's expected format)
         */
        public void fillDateInput(String elementKey, String value) {
            Locator input = service.getLocator(elementKey);
            input.waitFor(new Locator.WaitForOptions()
                    .setState(com.microsoft.playwright.options.WaitForSelectorState.VISIBLE)
                    .setTimeout(timeoutMillis()));
            Boolean disabled = (Boolean) input.evaluate("el => !!el.disabled");
            if (Boolean.TRUE.equals(disabled)) {
                throw new IllegalStateException("Element is disabled (read-only state).");
            }
            input.evaluate(
                    "(el, v) => {" +
                            "el.value = v;" +
                            "el.dispatchEvent(new CustomEvent('sc-change', {" +
                            "detail: { value: v }, bubbles: true, composed: true" +
                            "}));" +
                            "}",
                    value
            );
        }

        /**
         * Clicks the option whose visible text matches {@code name},
         * with configurable exact-match behaviour.
         *
         * @param name the visible label of the option to click
         */
        public void clickOption(String name) {
            // SC WebKit: sc-dropdown-input renders sl-menu-item elements inside its shadow DOM.
            // sc-dropdown-option elements exist in light DOM but have zero bounding rect and
            // cannot be clicked directly. We must traverse the shadow DOM to find sl-menu-item.
            Locator option = service().getPage().getByRole(
                    com.microsoft.playwright.options.AriaRole.MENUITEM,
                    new com.microsoft.playwright.Page.GetByRoleOptions()
                            .setName(name)
                            .setExact(true)
            );

            option.waitFor(new Locator.WaitForOptions()
                    .setState(com.microsoft.playwright.options.WaitForSelectorState.VISIBLE)
                    .setTimeout(timeoutMillis()));
            option.click();
        }

        public void waitForFunction(String expression, Object arg) {
            waitForFunction(expression, arg, timeoutMillis());
        }

        public void waitForFunction(String expression, Object arg, double timeoutMs) {
            service.getPage().waitForFunction(
                    expression,
                    arg,
                    new Page.WaitForFunctionOptions().setTimeout(timeoutMs)
            );
        }

        public void runAndWaitForResponse(Runnable action, String urlFragment, String httpMethod) {
            runAndWaitForResponse(action, urlFragment, httpMethod, timeoutMillis());
        }

        public void runAndWaitForResponse(Runnable action, String urlFragment, String httpMethod, double timeoutMs) {
            Response response = service.getPage().waitForResponse(
                    r -> r.url().contains(urlFragment) && r.request().method().equals(httpMethod),
                    new Page.WaitForResponseOptions().setTimeout(timeoutMs),
                    action
            );
            if (response.status() != 200) {
                throw new AssertionError(
                        "Expected " + httpMethod + " " + urlFragment + " to return 200 but got " + response.status() + "."
                );
            }
        }

        public void clickAndWaitForResponse(String locatorKey, String urlFragment, String httpMethod) {
            runAndWaitForResponse(
                    () -> service.getLocator(locatorKey).click(),
                    urlFragment,
                    httpMethod
            );
        }

        public void clickAndWaitForResponse(String locatorKey, String urlFragment, String httpMethod, double timeoutMs) {
            runAndWaitForResponse(
                    () -> service.getLocator(locatorKey).click(),
                    urlFragment,
                    httpMethod,
                    timeoutMs
            );
        }

        public void clickAndWaitForResponse(Locator locator, String urlFragment, String httpMethod) {
            runAndWaitForResponse(
                    locator::click,
                    urlFragment,
                    httpMethod
            );
        }

        public void doubleClickAndWaitForResponse(String locatorKey, String urlFragment, String httpMethod) {
            runAndWaitForResponse(
                    () -> service.getLocator(locatorKey).dblclick(),
                    urlFragment,
                    httpMethod
            );
        }

        public void fillAndWaitForResponse(String locatorKey, String value, String urlFragment, String httpMethod) {
            runAndWaitForResponse(
                    () -> service.getLocator(locatorKey).fill(value),
                    urlFragment,
                    httpMethod
            );
        }

        public void fillAndWaitForResponse(Locator locator, String value, String urlFragment, String httpMethod) {
            runAndWaitForResponse(
                    () -> locator.fill(value),
                    urlFragment,
                    httpMethod
            );
        }
        public void fillInnerInputAndWaitForResponse(String locatorKey, String value, String urlFragment, String httpMethod) {
            runAndWaitForResponse(
                    () -> service.getLocator(locatorKey)
                            .locator("input[part='input'], textarea[part='input']")
                            .fill(value),
                    urlFragment,
                    httpMethod
            );
        }
        public void refreshAndWaitForResponse(String urlFragment, String httpMethod) {
            runAndWaitForResponse(
                    () -> service.getPage().reload(),
                    urlFragment,
                    httpMethod
            );
        }



        /**
         * Clicks {@code locatorKey}, waits for the specified API response, asserts HTTP 200,
         * and returns the full response body as a string for snapshot comparison.
         *
         * <p>Identical contract to {@link #clickAndWaitForResponse} except the response body
         * is returned instead of discarded — use this when callers need to diff before/after states.
         *
         * @param locatorKey  element repository key of the element to click
         * @param urlFragment URL substring to match
         * @param httpMethod  HTTP method to match
         * @return response body as a UTF-8 string
         */
        public String clickAndCaptureResponse(String locatorKey, String urlFragment, String httpMethod) {
            Response response = service.getPage().waitForResponse(
                    r -> r.url().contains(urlFragment) && r.request().method().equals(httpMethod),
                    new Page.WaitForResponseOptions().setTimeout(timeoutMillis()),
                    () -> service.getLocator(locatorKey).click()
            );
            int status = response.status();
            if (!(status == 200 || status == 201)) {
                throw new AssertionError(
                        "Expected " + httpMethod + " " + urlFragment + " to return 2xx but got " + status + ".");
            }
            return response.text();
        }

        /**
         * Navigates to {@code path} (relative to the configured base URL), waits for the
         * specified API response, asserts HTTP 200, and returns the response body.
         *
         * <p>Mirrors {@link #clickAndCaptureResponse} but wraps {@code page.navigate()} instead
         * of a locator click — use when the API call is triggered by a page navigation rather
         * than a UI interaction.
         *
         * @param path        path relative to base URL, e.g. {@code "/trade/TRD-001"}
         * @param urlFragment URL substring to match (e.g. {@code "/api/v1/trades/TRD-001"})
         * @param httpMethod  HTTP method to match (e.g. {@code "GET"})
         * @return response body as a UTF-8 string
         */
        public String navigateAndCaptureResponse(String path, String urlFragment, String httpMethod) {
            Response response = service.getPage().waitForResponse(
                    r -> r.url().contains(urlFragment) && r.request().method().equals(httpMethod),
                    new Page.WaitForResponseOptions().setTimeout(timeoutMillis()),
                    () -> navigateToPath(path)

            );
            if (response.status() != 200) {
                throw new AssertionError(
                        "Expected " + httpMethod + " " + urlFragment + " to return 200 but got " + response.status() + ".");

            }
            return response.text();
        }

        public Request clickAndCaptureRequest(String locatorKey, String urlFragment, String httpMethod) {
            return service.getPage().waitForRequest(
                    r -> r.url().contains(urlFragment) && r.method().equals(httpMethod),
                    new Page.WaitForRequestOptions().setTimeout(timeoutMillis()),
                    () -> service.getLocator(locatorKey).click()
            );
        }

        // ── Route: Mock ────────────────────────────────────────────────

        /**
         * Registers a mock route that intercepts every request whose URL contains
         * {@code urlFragment} and fulfills it with {@code status} and a JSON body,
         * without ever reaching the real backend.
         *
         * <p>Always pair with {@link #clearMockRoute(String)} after the interaction:
         * <pre>
         *   ctx.mockRoute("/api/v1/trades", 200, "{\"id\":\"TRD-999\"}");
         *   ctx.clickAndWaitForResponse("btn-book", "/api/v1/trades", "POST");
         *   ctx.clearMockRoute("/api/v1/trades");
         * </pre>
         *
         * @param urlFragment  URL substring to intercept
         * @param status       HTTP status code to return (e.g. {@code 200}, {@code 422})
         * @param responseBody response body string (JSON recommended)
         */
        public void mockRoute(String urlFragment, int status, String responseBody) {
            mockRoute(urlFragment, status, responseBody, "application/json");
        }

        /**
         * Registers a mock route that fulfills after {@code delayMillis}, allowing callers
         * to simulate slow backend responses without blocking the route handler thread.
         */
        public void mockRouteWithDelay(String urlFragment, int status, String responseBody) {
            mockRouteWithDelay(urlFragment, status, responseBody, "application/json");
        }

        /**
         * Registers a mock route with an explicit {@code contentType}.
         * @param contentType  value for the {@code Content-Type} header
         */
        public void mockRoute(String urlFragment, int status, String responseBody, String contentType) {
            service.getPage().route(
                    "**" + urlFragment + "**",
                    route -> route.fulfill(new Route.FulfillOptions()
                            .setStatus(status)
                            .setBody(responseBody)
                            .setContentType(contentType))
            );
        }

        /**
         * Registers a delayed mock route with an explicit {@code contentType}.
         */
        public void mockRouteWithDelay(String urlFragment, int status, String responseBody,
                                       String contentType) {
            service.getPage().route(
                    "**" + urlFragment + "**",
                    route -> Thread.ofVirtual().start(() -> {
                        try {
                            Thread.sleep(timeoutMillis());
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                        }
                        route.fulfill(new Route.FulfillOptions()
                                .setStatus(status)
                                .setBody(responseBody)
                                .setContentType(contentType));
                    })
            );
        }

        /**
         * Removes all mock routes registered for {@code urlFragment}.
         *
         * <p>Call this after each test interaction to prevent leaking mocks into
         * subsequent scenarios.
         *
         * @param urlFragment URL substring passed to {@link #mockRoute}
         */
        public void clearMockRoute(String urlFragment) { service.getPage().unroute("**" + urlFragment + "**"); }

        /**
         * Convenience method: registers a mock route, clicks {@code locatorKey},
         * waits for the mocked response to be received, then removes the mock.
         *
         * <p>Equivalent to calling {@link #mockRoute}, {@link #clickAndWaitForResponse},
         * and {@link #clearMockRoute} in sequence:
         * <pre>
         *   // Error scenario — no round-trip to the real backend
         *   ctx.clickWithMockedResponse("btn-book", "/api/v1/trades", "POST",
         *           422, "{\"error\":\"Limit breached\"}");
         *   ctx.assertEventuallyVisible(page.getByTestId("toast-error"));
         * </pre>
         *
         * @param locatorKey   element repository key of the element to click
         * @param urlFragment  URL substring to intercept and match
         * @param httpMethod   HTTP method to match (e.g. {@code "POST"})
         * @param status       HTTP status code the mock returns
         * @param responseBody response body the mock returns (JSON)
         */
        public void clickWithMockedResponse(String locatorKey, String urlFragment,
                                            String httpMethod, int status, String responseBody) {
            mockRoute(urlFragment, status, responseBody);
            try {
                Response response = service.getPage().waitForResponse(
                        r -> r.url().contains(urlFragment) && r.request().method().equals(httpMethod),
                        new Page.WaitForResponseOptions().setTimeout(timeoutMillis()),
                        () -> service.getLocator(locatorKey).click()
                );
                if (response.status() != status) {
                    throw new AssertionError(
                            "Mock returned unexpected status: expected " + status + " but got " + response.status());
                }
            } finally {
                clearMockRoute(urlFragment);
            }
        }

        /**
         * <p>Unlike the framework's synchronous {@code assert that 'x' is visible} step,
         * this polls repeatedly until the condition is met or the timeout expires —
         * safe for async UI transitions and animations.
         *
         * @param locator the element to assert
         */
        public void assertEventuallyVisible(Locator locator) { assertEventuallyVisible(locator, timeoutMillis()); }

        public void assertEventuallyVisible(Locator locator, double timeoutMs) {
            PlaywrightAssertions.assertThat(locator).isVisible(
                    new LocatorAssertions.IsVisibleOptions().setTimeout(timeoutMs));
        }

        /**
         * Asserts that {@code locator} is eventually hidden (or detached), with
         * Playwright's built-in polling (default timeout from {@code playwright.timeout}).
         *
         * <p>Unlike the framework's synchronous {@code assert that 'x' is not visible} step,
         * this polls repeatedly until the element disappears or the timeout expires —
         * safe for async UI transitions and animations.
         *
         * @param locator the element to assert
         */
        public void assertEventuallyHidden(Locator locator) { assertEventuallyHidden(locator, timeoutMillis()); }

        public void assertEventuallyHidden(Locator locator, double timeoutMs) {
            PlaywrightAssertions.assertThat(locator).isHidden(
                    new LocatorAssertions.IsHiddenOptions().setTimeout(timeoutMs));
        }

        /**
         * Asserts that {@code locator} is eventually enabled, with Playwright's
         * built-in polling (default timeout from {@code playwright.timeout}).
         *
         * <p>Use this instead of the synchronous {@code element.isEnabled()} check
         * when the element may be temporarily disabled during async operations
         * (e.g. form submission in progress, data loading).
         *
         * @param locator the element to assert
         */
        public void assertEventuallyEnabled(Locator locator) { assertEventuallyEnabled(locator, timeoutMillis()); }

        public void assertEventuallyEnabled(Locator locator, double timeoutMs) {
            PlaywrightAssertions.assertThat(locator).isEnabled(
                    new LocatorAssertions.IsEnabledOptions().setTimeout(timeoutMs));
        }

        /**
         * Asserts that {@code locator} is eventually disabled, with Playwright's
         * built-in polling (default timeout from {@code playwright.timeout}).
         *
         * <p>Use this instead of the synchronous {@code !element.isEnabled()} check
         * when the element may take time to become disabled after a UI state change
         * (e.g. read-only mode applied asynchronously).
         *
         * @param locator the element to assert
         */
        public void assertEventuallyDisabled(Locator locator) { assertEventuallyDisabled(locator, timeoutMillis()); }

        public void assertEventuallyDisabled(Locator locator, double timeoutMs) {
            PlaywrightAssertions.assertThat(locator).isDisabled(
                    new LocatorAssertions.IsDisabledOptions().setTimeout(timeoutMs));
        }

        /**
         * Polls until the element's text content contains {@code text}, or the
         * configured timeout ({@code playwright.timeout}) expires.
         *
         * <p>Use this instead of the synchronous {@code assertElementContains} check
         * when the element text may update asynchronously (e.g. after a page reload
         * where Zustand hydrates from localStorage or DB in the background).
         *
         * @param locator the element to assert
         * @param text    the substring expected in the element's text content
         */
        public void assertEventuallyContains(Locator locator, String text) {
            assertEventuallyContains(locator, text, timeoutMillis());
        }

        public void assertEventuallyContains(Locator locator, String text, double timeoutMs) {
            if (text.startsWith("${json-unit.regex}")) {
                String regex = text.substring("${json-unit.regex}".length());
                PlaywrightAssertions.assertThat(locator).containsText(
                        Pattern.compile(regex),
                        new LocatorAssertions.ContainsTextOptions().setTimeout(timeoutMs));
            } else {
                PlaywrightAssertions.assertThat(locator).containsText(
                        text,
                        new LocatorAssertions.ContainsTextOptions().setTimeout(timeoutMs));
            }
        }

        public void assertHasValue(Locator locator, String value) { assertHasValue(locator, value, timeoutMillis()); }

        public void assertHasValue(Locator locator, String value, double timeoutMs) {
            PlaywrightAssertions.assertThat(locator).hasValue(
                    value,
                    new LocatorAssertions.HasValueOptions().setTimeout(timeoutMs));
        }

    }
}
