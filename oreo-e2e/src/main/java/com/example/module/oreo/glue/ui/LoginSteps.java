package com.example.module.oreo.glue.ui;

import com.example.module.oreo.OreoModule;
import com.example.module.oreo.utils.pages.LoginPage;
import io.cucumber.java.en.Given;

/** authentication_login.snippet: the account of the role comes from the config, never from test data. */
public class LoginSteps {

    private final OreoModule session;

    public LoginSteps(OreoModule session) {
        this.session = session;
    }

    @Given("^(\\w+) is logged in to the trade portal$")
    public void isLoggedIn(String role) {
        LoginPage login = new LoginPage(session.ui());
        login.open();
        login.signIn(session.config().email(role), session.config().password(role));
    }
}
