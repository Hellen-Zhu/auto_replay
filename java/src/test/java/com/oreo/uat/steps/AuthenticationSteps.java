package com.oreo.uat.steps;

import com.oreo.uat.pages.LoginPage;
import com.oreo.uat.support.OreoSession;
import io.cucumber.java.en.Given;

/** authentication_login.snippet: the account of the role comes from the config, never from test data. */
public class AuthenticationSteps {

    private final OreoSession session;

    public AuthenticationSteps(OreoSession session) {
        this.session = session;
    }

    @Given("^(\\w+) is logged in to the trade portal$")
    public void isLoggedIn(String role) {
        LoginPage login = new LoginPage(session.ui());
        login.open();
        login.signIn(session.config().email(role), session.config().password(role));
    }
}
