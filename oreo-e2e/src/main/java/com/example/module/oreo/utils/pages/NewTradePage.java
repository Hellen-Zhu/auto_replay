package com.example.module.oreo.utils.pages;

import com.example.module.oreo.OreoModuleConfiguration.Mode;
import com.example.module.oreo.utils.ui.OreoUi;

/** New Trade form (new_trade_page.json): its fields are web component comboboxes. */
public class NewTradePage {

    public static final String CREATE_URL = "/trades/create?tradeAction=SUBMIT";
    static final String CONTAINER = "new_trade.container";
    static final String FILE_INPUT = "new_trade.file_input";
    static final String COUNTERPARTY = "new_trade.counterparty_select";
    static final String PORTFOLIO = "new_trade.portfolio_select";
    static final String PRODUCT_ID = "new_trade.product_id_input";
    static final String DIRECTION = "new_trade.direction_select";
    static final String STEPIN_TOGGLE = "new_trade.stepin_toggle";
    static final String STEPIN_FULL = "new_trade.stepin_full_radio";
    static final String STEPIN_PARTIAL = "new_trade.stepin_partial_radio";
    static final String STEPIN_OLD_COUNTERPARTY = "new_trade.stepin_old_counterparty_select";
    static final String BOOK = "new_trade.book_btn";

    private final OreoUi ui;
    private final TradeChangeConfirmation confirmation;

    public NewTradePage(OreoUi ui) {
        this.ui = ui;
        this.confirmation = new TradeChangeConfirmation(ui);
    }

    public void expectOpen() {
        ui.assertVisible(CONTAINER);
    }

    public void uploadDat(String file) {
        ui.uploadFile(FILE_INPUT, file);
    }

    public void selectCounterparty(String value) {
        select(COUNTERPARTY, value);
    }

    public void selectPortfolio(String value) {
        select(PORTFOLIO, value);
    }

    public void selectProductId(String value) {
        select(PRODUCT_ID, value);
    }

    public void selectDirection(String value) {
        select(DIRECTION, value);
    }

    public void enableStepIn(boolean full) {
        ui.click(STEPIN_TOGGLE);
        ui.click(full ? STEPIN_FULL : STEPIN_PARTIAL);
    }

    public void selectStepInOldCounterparty(String value) {
        select(STEPIN_OLD_COUNTERPARTY, value);
    }

    /** "click book using configured risk engine mode for new trade creation" */
    public void book(Mode mode) {
        RiskCalculation.clickUsingMode(ui, mode, BOOK, RiskCalculation.forNewTrade());
    }

    /** "confirm new trade creation and capture response": returns the answer of the creation */
    public String confirmAndCaptureCreation() {
        confirmation.expectVisible();
        return confirmation.confirmAndCapture(CREATE_URL);
    }

    /** type inner value into the combobox, then click the option */
    private void select(String element, String value) {
        ui.typeInner(element, value);
        ui.clickOption(value);
    }
}
