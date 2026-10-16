package com.oreo.uat.pages;

import com.oreo.uat.support.OreoUi;

/** ToastSteps: the toast's title is [data-title], its message [data-description]. */
public class Toast {

    public static final String EARLY_TERMINATION_COMPLETED = "EarlyTermination completed successfully";

    private final OreoUi ui;

    public Toast(OreoUi ui) {
        this.ui = ui;
    }

    /** "assert toast notification with type '<type>' and message '<text>'" */
    public void expectMessage(String type, String message) {
        ui.assertToast(type, "description", message);
    }
}
