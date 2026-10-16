package com.oreo.uat.pages;

import com.oreo.uat.support.OreoUi;

/** Trade details: the header card shows the trade ID and its status. */
public class TradeDetailPage {

    public static final String PENDING_APPROVAL = "PARV";
    static final String HEADER_CARD = "trade_detail.header_card";

    private final OreoUi ui;

    public TradeDetailPage(OreoUi ui) {
        this.ui = ui;
    }

    public void expectTrade(String tradeId, String status) {
        ui.assertContainsText(HEADER_CARD, tradeId);
        ui.assertContainsText(HEADER_CARD, status);
    }
}
