package com.oreo.uat.pages;

import com.oreo.uat.support.OreoUi;

/** The trade change confirmation dialog (after Book, and after the dynamic action form of a lifecycle event). */
public class TradeChangeConfirmation {

    public static final String TRIGGER_EVENT_URL = "/trades/trigger-event";
    static final String DIALOG = "trade_change_confirmation.dialog";
    static final String CONFIRM = "trade_change_confirmation.confirm_btn";

    private final OreoUi ui;

    public TradeChangeConfirmation(OreoUi ui) {
        this.ui = ui;
    }

    public void expectVisible() {
        ui.assertVisible(DIALOG);
    }

    /** "confirm lifecycle event trade change and wait for page ready" */
    public void confirmLifecycleEvent() {
        ui.clickAndWaitForResponse(CONFIRM, TRIGGER_EVENT_URL, "POST");
    }

    public String confirmAndCapture(String url) {
        return ui.clickAndCaptureResponse(CONFIRM, url, "POST");
    }
}
