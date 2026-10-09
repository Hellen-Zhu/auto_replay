# Worked example: trade cancellation (a `Given` through the API)

The Java side of a case that is already ported, whose first step prepares its trade through the API. Its result is in `tests/trade-cancellation.spec.ts`, `framework/flows/trade-provisioning.flow.ts`, `framework/api/trades.api.ts`, `framework/flows/trade-cancellation.flow.ts`, `framework/flows/trades.flow.ts`, `framework/pages/trades.page.ts`, `framework/components/trade-change-confirmation.ts`, `framework/components/toast.ts` and `testdata/trade-cancellation.json`: read them next to this trace.

The Java side below is condensed from what was seen of the E2E project. Snippet entries are written as their regex and body lines without the keywords (which play no part in matching); section headers are given only where they were seen; `(cut)` marks what was not visible; the accounts in the Java source are replaced by `<maker account>` and `<checker account>`.

## Java side

`features/ui/trading/trade_cancellation.feature`:

```gherkin
Scenario Outline: [TC-TRADE-CANCELLATION-<product_type>-UI-001] ... (cut)
  Given a Live '<product_type>' trade exists in the blotter
  And maker is logged in to the trade portal
  When perform cancellation for the trade from trade portal
  Then the cancellation is submitted successfully
  And the cancellation request is pending checker approval

  Examples:
    | product_type |
    | FX_CO        |
    | FX_TRF       |
    | FX_FSB       |
```

The flow snippets the steps match, and the page / component snippets behind them:

```
# flow snippets
"^a Live '([^']*)' trade exists in the blotter$"
  a live '$1' trade is provisioned via playwright api

"^perform cancellation for the trade from trade portal$"
  page trade portal searches and opens action menu for trade stored as 'createdTradeId'
  page trade portal cancellation action button is visible
  trigger cancellation for trade using configured risk engine mode from trade portal for trade stored as 'createdTradeId'
  component trade change confirmation dialog is visible
  component trade change confirmation selects reason option 'DEALER_ERROR'
  component trade change confirmation types comments as 'cancellation for test'
  confirm cancel trade and wait for page ready

"^the cancellation is submitted successfully$"
  assert toast notification with type 'success' and message 'Cancellation completed successfully'

"^the cancellation request is pending checker approval$"
  the trade has status 'PARV' and event status 'Cancelled' in the blotter

"^the trade has status '([^']*)' and event status '([^']*)' in the blotter$"
  page trade portal navigates to Trade Portal page
  (cut; a snippet next to it goes on with: search for the trade, then
   page trade portal blotter column 'status' is '...' and ... 'eventStatus' is '...')

# - PAGE: TRADE PORTAL -
"^page trade portal searches and opens action menu for trade stored as '([^']*)'$"
  page trade portal searches and views trade stored as '$1'
  open action menu item for new today blotter from stored variable '$1'

"^page trade portal searches and views trade stored as '([^']*)'$"
  search for trade stored as '$1' in blotter

"^page trade portal cancellation action button is visible$"
  assert that 'trade_portal.row_action_cancel' is eventually visible

"^page trade portal blotter column '([^']*)' is '([^']*)'$"
  blotter row 'trade_portal.all_trades_blotter_row' index 0 column '$1' is '$2'

# component snippets: trade change confirmation
"^component trade change confirmation dialog is visible$"
  assert that inner '[slot="header"]' property of 'trade_change_confirmation.dialog' ... (cut)

"^component trade change confirmation selects reason option '([^']*)'$"
  click 'trade_change_confirmation.reason_select'
  click option '$1'

"^component trade change confirmation types comments as '([^']*)'$"
  type value '$1' into 'trade_change_confirmation.comments_textarea'
```

The custom Java steps in the browser:

```java
// TradePortalSteps.java
// search for trade stored as '<name>' in blotter
getLocator("trade_portal.search_input").locator("input[part='input'], textarea[part='input']").fill(tradeId);
// open action menu item for new today blotter from stored variable '<name>'
getLocator("trade_portal.all_trade_blotter").getByRole(AriaRole.ROW).filter(/* hasText: tradeId */).first()
    .click(/* button: MouseButton.RIGHT */);

// TradeCancellationSteps.java: confirm cancel trade and wait for page ready
ctx.clickAndWaitForResponse("trade_change_confirmation.confirm_btn", "/trades/trigger-event", "POST");

// ToastSteps.java: assert toast notification with type '<type>' and message '<text>'
assertToastField(expectedType, expectedMessage, "[data-description]", "description");
```

The custom Java step that sends requests, and the test data it loads:

```java
// TradeProvisioningSteps.java
@Given("^a live '([^']*)' trade is provisioned via playwright api$")
public void provisionLiveTradeByProduct(String product) {
    provisionLiveTradeAs("createdTradeId", "createdTaskId", "API-SETUP-TRADE-CREATE", ProductDatFiles.valueOf(product));
}

private void provisionLiveTradeAs(String tradeIdVar, String taskIdVar, String testDataKey, ProductDatFiles datFile) {
    submitTradeAsPendingApproval(tradeIdVar, taskIdVar, testDataKey, datFile);
    approveTask(ctx.get(taskIdVar), <checker account>);                 // its body: (cut)
}

private void submitTradeAsPendingApproval(String tradeIdVar, String taskIdVar, String testDataKey, ProductDatFiles datFile) {
    JsonNode body = submitTrade(<maker account>, testDataKey, datFile);
    ctx.set(tradeIdVar, body.at("/data/trade/id").asText());
    ctx.set(taskIdVar, body.at("/data/checkerContext/taskId").asText());
}

private JsonNode submitTrade(String userId, String testDataKey, ProductDatFiles datFile) {
    String tradeJson = TestDataLoader.forKey(testDataKey).request();
    // datFilePath: the classpath resource datFile.path()
    return RestApiUtil.postMultipart(helper, "/trades/create?tradeAction=SUBMIT", userId, "trade", tradeJson, "datFile", datFilePath);
}
```

```yaml
# trade_creation.yml, found by searching the yml files for the key
API-SETUP-TRADE-CREATE:
  requestRef: REQ-TPL-TRADE-CREATION-API-001

REQ-TPL-TRADE-CREATION-API-001:
  request:
    { "basic": { "counterpartyFmId": "300036958", "counterpartyName": "10 AM NY", "portfolioId": "ABS_EQF",
                 "productId": "FX_TRF", "direction": "Buy", "premiumAmount": 10000, "premiumCurrency": "USD" } }
```

## The API step, request by request

`a live '<P>' trade is provisioned via playwright api` is two requests, in this order.

**1. The maker submits the trade**

| What | Read on the Java side | Here |
|---|---|---|
| Method, path, query | `RestApiUtil.postMultipart(helper, "/trades/create?tradeAction=SUBMIT", ...)` | `TradesApi.submit` = `{ method: 'POST', path: '/trades/create?tradeAction=SUBMIT' }` |
| Who sends it | `userId` = the maker account that `submitTradeAsPendingApproval` passes | `submitTrade('maker', ...)` -> `headers: this.as('maker')` |
| Shape | Multipart: part `trade` (JSON), part `datFile` (file) | `multipart: { trade: { json: { basic } }, datFile: { file } }` |
| Payload | Key `API-SETUP-TRADE-CREATE` -> `requestRef` -> `REQ-TPL-TRADE-CREATION-API-001` -> its `request` block | The interface `TradeBasic`; the values in `defaults` of `testdata/trade-cancellation.json` (and `common.json`) |
| File | `ProductDatFiles.valueOf(product)` | `datFile(product)` |
| Response fields that are used | `/data/trade/id` -> `createdTradeId`, `/data/checkerContext/taskId` -> `createdTaskId` | `save: { createdTradeId: 'data.trade.id', createdTaskId: 'data.checkerContext.taskId' }`, returned as `{ tradeId, taskId }` |
| Values from an earlier request | None | - |
| Checks on the answer | None seen | - |

**2. The checker approves the task**

| What | Read on the Java side | Here |
|---|---|---|
| Who sends it | The checker account that `provisionLiveTradeAs` passes | `approveTask('checker', taskId)` -> `headers: this.as('checker')` |
| Values from an earlier request | `ctx.get(taskIdVar)`: the task ID of request 1 | The argument `taskId`, the value `submitTrade` returned, recorded as `${var:createdTaskId}` |
| Method, path, shape | **Not readable**: the body of `approveTask` was not at hand | `TradesApi.approve(taskId)` = `POST /checker/tasks/<taskId>/approve` with the body `{}` |

By the rule of the skill the step could not be ported from the Java side alone: its second request was not readable. The user supplied it from the browser's Network tab (method, path, the JSON content type and a content length of 2). The body `{}` is concluded from that length, which the comment of `TradesApi.approve` says; a run on the real system confirmed it (the trade was `LIVE` afterwards). With the E2E project at hand, read `approveTask` and compare.

Also not shown: how the Java code puts the product into the template's `productId`. This project sends the product type (`productId: product`); confirmed for FX_TRF only.

## Trace and where each line went

```
Given a Live 'FX_TRF' trade exists in the blotter       case step (title):  const tradeId = await Given(`a Live '${product}' trade exists in the blotter`,
                                                                              () => flows.tradeProvisioning.provisionLiveTrade(product, data))
  FLOW "^a Live '([^']*)' trade exists in the blotter$"
    a live 'FX_TRF' trade is provisioned via playwright api   [Java, requests]
                                                        flow method:        TradeProvisioningFlow.provisionLiveTrade(product, data), returns the trade ID
      submitTradeAsPendingApproval -> submitTrade       substep "I submit a new FX_TRF trade through the API as maker"
        RestApiUtil.postMultipart(...)                    tradesApi.submitTrade('maker', { ...basic, productId: product }, datFile(product))
      approveTask(ctx.get("createdTaskId"), ...)        substep "I approve the trade through the API as checker"
                                                          tradesApi.approveTask('checker', taskId)

And maker is logged in to the trade portal              case step:          flows.auth.login('maker')   (reused)

When perform cancellation for the trade from trade portal
                                                        case step:          flows.tradeCancellation.cancelFromTradePortal(tradeId, data)
  page trade portal searches and opens action menu for trade stored as 'createdTradeId'
                                                        substep "I search for the trade and open its action menu"
                                                                            (flows.trades.openActionMenu(tradeId): every event on a trade starts with it)
      search for trade stored as ... in blotter [Java]    trades.searchTrade(tradeId)
      open action menu item for new today blotter [Java]  trades.openActionMenu(tradeId)
  page trade portal cancellation action button is visible
                                                        substep "I choose Cancel from the action menu"
      assert that 'trade_portal.row_action_cancel' ...    trades.expectCancelActionVisible()
  trigger cancellation for trade using configured risk engine mode ... [Java]
                                                          trades.clickCancelAction(tradeId)
  component trade change confirmation dialog is visible   trades.confirmDialog.expectVisible()
  component ... selects reason option 'DEALER_ERROR'    substep "I select the cancellation reason and type the comments"
      click 'trade_change_confirmation.reason_select'
      click option 'DEALER_ERROR'                         trades.confirmDialog.selectReason(p.cancelReason)
  component ... types comments as 'cancellation for test'
      type value ... into '...comments_textarea'          trades.confirmDialog.typeComments(p.cancelComments)
  confirm cancel trade and wait for page ready [Java]   substep "I confirm the cancellation"
                                                          trades.confirmDialog.confirm()

Then the cancellation is submitted successfully         case step:          flows.tradeCancellation.expectSubmitted()
  assert toast notification with type 'success' and message '...' [Java]
                                                        substep "I see the message that the cancellation is completed"
                                                          app.toast.expectMessage(Toast.message.cancellationCompleted)

And the cancellation request is pending checker approval
                                                        case step:          flows.tradeCancellation.expectPendingCheckerApproval(tradeId)
  the trade has status 'PARV' and event status 'Cancelled' in the blotter
    page trade portal navigates to Trade Portal page    substep "I open the trade portal and search for the trade"
    (cut: search for the trade)                           trades.open(), trades.searchTrade(tradeId)
    page trade portal blotter column 'status' is 'PARV' substep "its row shows it is pending approval for a cancellation"
    ... column 'eventStatus' is 'Cancelled'               trades.expectRowShows(tradeId, TradesPage.status.pendingApproval)
                                                          trades.expectRowShows(tradeId, TradesPage.eventStatus.cancelled)
```

## What to take from it

- The `Given` is one flow method with one substep per request, and it returns the trade ID. The case keeps that ID (`const tradeId = await Given(...)`) and hands it to the browser flows: the stored variable `createdTradeId` of the snippets is this value.
- Two Java helpers that each send a request became two operations of `TradesApi`; the sequence (submit, then approve with the task ID of the answer) is in the flow, not in the API object.
- The task ID travels as a value: `submitTrade` returns it, `approveTask` takes it. It came out of `ui.api`, so the path is recorded as `/checker/tasks/${var:createdTaskId}/approve`.
- The accounts in the Java source became roles: `this.as('maker')`, `this.as('checker')`. The checker never logs in: there is one user in the browser.
- The template's values became `defaults` of `testdata/trade-cancellation.json` under flat names. `portfolioId` is there although `common.json` has one: the template's value differs from the one the UI cases use, so this spec keeps its own. `counterpartyName` and `direction` are the same as in `common.json` and are not repeated.
- `productId` is not data: it is the flow's argument. `premiumAmount` is a number in the request: it is passed as `data.premiumAmount` and recorded as it is, the texts go through `p.<name>` and are recorded as parameters.
- `FX_CO` and `FX_FSB` of the Examples are `FX_PSCRIPT` and `FX_PSCRIPT_FSKO`: the test loops `productsWith('cancel')` and the old names appear nowhere.
- The literals of the snippet (`DEALER_ERROR`, `cancellation for test`) became the test data `cancelReason` and `cancelComments`.
- `type value '...' into '...comments_textarea'` fills the control inside the element: `{ inner: INNER_INPUT }`, although the key ends in `_textarea`.
- Weaker than the Java side, and reported as "to verify": the confirm step is a plain click (no wait for the `trigger-event` answer), the toast's type is not checked, and the blotter check is "the row contains the text" instead of one column.
- The check of the outcome is not in `cancelFromTradePortal`: the two `expect...` flows that the `Then` and the `And` call hold it.
