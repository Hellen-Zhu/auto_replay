package com.example.module.oreo.utils.pages;

import com.example.module.oreo.OreoModuleConfiguration.Mode;
import com.example.module.oreo.utils.ui.OreoUi;

/** The dialog of a lifecycle event (dynamic_action_component.snippet); which fields it shows depends on the event. */
public class DynamicActionComponent {

    static final String DIALOG = "dynamic_action.dialog";
    static final String CONFIRM = "dynamic_action.confirm_btn";
    static final String ET_DIRECTION = "dynamic_action.et_direction_select";
    static final String AMOUNT = "dynamic_action.amount_input";
    static final String ET_CURRENCY = "dynamic_action.et_ccy_input";

    private final OreoUi ui;

    public DynamicActionComponent(OreoUi ui) {
        this.ui = ui;
    }

    public void expectVisible() {
        ui.assertVisible(DIALOG);
    }

    /** "selects direction": open the dropdown, click the option */
    public void selectDirection(String direction) {
        ui.click(ET_DIRECTION);
        ui.clickOption(direction);
    }

    public void typeAmount(String amount) {
        ui.typeInner(AMOUNT, amount);
    }

    public void typeCurrency(String currency) {
        ui.typeInner(ET_CURRENCY, currency);
    }

    /** "confirm dynamic action form using configured risk engine mode for trade stored as ..." */
    public void confirm(Mode mode, String tradeId) {
        RiskCalculation.clickUsingMode(ui, mode, CONFIRM, RiskCalculation.forTrade(tradeId));
    }
}
