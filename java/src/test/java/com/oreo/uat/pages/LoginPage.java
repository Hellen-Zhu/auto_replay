package com.oreo.uat.pages;

import com.oreo.uat.support.OreoUi;

/** Login page. The element keys of authentication_login.snippet were not seen: data-testids of the page. */
public class LoginPage {

    public static final String PATH = "/login";
    static final String DIALOG = "testId=login-dialog";
    static final String EMAIL = "testId=login-email-input";
    static final String PASSWORD = "testId=login-password-input";
    static final String SIGN_IN = "testId=login-sign-in-to-portal-btn";

    private final OreoUi ui;

    public LoginPage(OreoUi ui) {
        this.ui = ui;
    }

    public void open() {
        ui.navigate(PATH);
        ui.assertVisible(DIALOG);
    }

    public void signIn(String email, String password) {
        ui.typeInner(EMAIL, email);
        ui.typeInner(PASSWORD, password);
        ui.click(SIGN_IN);
    }
}
