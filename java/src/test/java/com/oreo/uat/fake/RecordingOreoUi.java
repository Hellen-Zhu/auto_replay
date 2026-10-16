package com.oreo.uat.fake;

import com.oreo.uat.support.OreoUi;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Logs every action instead of doing it, so the steps run without a browser. A captured trade creation answers
 * {@code {"data":{"trade":{"id":"TRADE-<n>"}}}}; assertions always pass. Not a test of the system: it shows which
 * actions a scenario does, in which order, with which values.
 */
public class RecordingOreoUi implements OreoUi {

    private static final AtomicInteger IDS = new AtomicInteger();

    private final List<String> log;

    public RecordingOreoUi(List<String> log) {
        this.log = log;
    }

    @Override
    public void navigate(String path) {
        log.add("navigate " + path);
    }

    @Override
    public void click(String element) {
        log.add("click " + element);
    }

    @Override
    public void typeInner(String element, String value) {
        log.add("type '" + value + "' into " + element);
    }

    @Override
    public void clickOption(String text) {
        log.add("click option '" + text + "'");
    }

    @Override
    public void uploadFile(String element, String file) {
        log.add("upload " + file + " into " + element);
    }

    @Override
    public void rightClickRow(String grid, String rowText) {
        log.add("right-click row '" + rowText + "' of " + grid);
    }

    @Override
    public void assertVisible(String element) {
        log.add("assert visible " + element);
    }

    @Override
    public void assertContainsText(String element, String text) {
        log.add("assert " + element + " contains '" + text + "'");
    }

    @Override
    public void assertCellText(String grid, String rowText, String column, String value) {
        log.add("assert " + grid + " row '" + rowText + "' column " + column + " is '" + value + "'");
    }

    @Override
    public void assertToast(String type, String field, String text) {
        log.add("assert toast " + type + " " + field + " '" + text + "'");
    }

    @Override
    public void clickAndWaitForResponse(String element, String urlFragment, String httpMethod) {
        log.add("click " + element + " and wait for " + httpMethod + " " + urlFragment);
    }

    @Override
    public void clickWithMockedResponse(String element, String urlFragment, String httpMethod, int status, String body) {
        log.add("click " + element + " with " + httpMethod + " " + urlFragment + " mocked (" + status + ")");
    }

    @Override
    public String clickAndCaptureResponse(String element, String urlFragment, String httpMethod) {
        log.add("click " + element + " and capture " + httpMethod + " " + urlFragment);
        return "{\"data\":{\"trade\":{\"id\":\"TRADE-" + IDS.incrementAndGet() + "\"}}}";
    }
}
