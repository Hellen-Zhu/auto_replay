# Worked example: trade creation

The Java side of a case that is already ported. Its result is in `tests/trade-creation.spec.ts`, `framework/flows/trade-creation.flow.ts`, `framework/pages/new-trade.page.ts` and `testdata/`: read them next to this trace.

## Java side

`features/ui/trading/trade_creation.feature`:

```gherkin
Scenario Outline: TC-TRADE-CREATION-<product_type>-UI-001 ...
  When maker is logged in to the trade portal
  And creates a new '<product_type>' trade
  Then trade is created with pending approval status and info

  Examples:
    | product_type |
    | FX_TRF       |
```

The flow snippet the second step matches, and the page snippets and Java steps behind it:

```
# - FLOW: TRADE CREATION -
@When "^creates a new '([^']*)' trade$"
  When page trade portal clicks new trade button
  And page new trade container is visible
  And page new trade selects basic mandatory info
  And upload '$1' dat file
  And page new trade book and captures trade id as 'createdTradeId'
  And page trade detail header card contains from stored variable 'createdTradeId'

# - PAGE: TRADE PORTAL -
@When "^page trade portal clicks new trade button$"
  When click 'trade_portal.new_trade_btn'

# - PAGE: NEW TRADE -
@Then "^page new trade container is visible$"
  Then assert that 'new_trade.container' is eventually visible

@When "^page new trade selects basic mandatory info$"
  When page new trade selects counterparty from stored variable 'basic.counterpartyName'
  And page new trade selects portfolio from stored variable 'basic.portfolioId'
  And page new trade selects productId from stored variable 'basic.productId'
  And page new trade selects direction from stored variable 'basic.direction'

@When "^page new trade selects counterparty from stored variable '([^']*)'$"
  When type inner value '$1' from stored variable into 'new_trade.counterparty_select'
  And click option from stored variable '$1'

@When "^page new trade (save|book) and captures trade id as '([^']*)'$"
  When click $1 using configured risk engine mode for new trade creation
  And component trade change confirmation dialog is visible
  And confirm new trade creation and capture response as 'tradeCreateResponse'
  And store e2e response field 'data.trade.id' from stored variable 'tradeCreateResponse' as '$2'

# - PAGE: TRADE DETAIL -
@Then "^page trade detail header card contains from stored variable '([^']*)'$"
  Then assert that 'trade_detail.header_card' eventually contains from stored variable '$1'
```

```java
// NewTradeSteps.java
@When("^upload '([^']*)' dat file$")
public void uploadProductDatFile(String productType) { uploadDatFile(ProductDatFiles.valueOf(productType).path()); }
// uploadDatFile: getLocator("new_trade.file_input").setInputFiles(<classpath resource>)

@When("^click book using configured risk engine mode for new trade creation$")   // -> "new_trade.book_btn"
```

## Trace and where each line went

```
And creates a new 'FX_TRF' trade                        case step (title):  And(`creates a new '${product}' trade`, () => flows.tradeCreation.createTrade(product, data))
  FLOW "^creates a new '([^']*)' trade$"                flow method:        TradeCreationFlow.createTrade(product, data), returns the trade ID

    page trade portal clicks new trade button           substep "I open the New Trade form"
      click 'trade_portal.new_trade_btn'                  topBar.clickNewTrade()
    page new trade container is visible                   (a wait for the next action: stays in the flow)
      assert that 'new_trade.container' is ... visible    newTrade.expectOpen()

    page new trade selects basic mandatory info         substep "I select the basic mandatory info"
      page new trade selects counterparty ... 'basic.counterpartyName'
        type inner value ... into 'new_trade.counterparty_select'
        click option from stored variable ...             newTrade.setField('counterpartyName', p.counterpartyName)
      ... portfolio, direction                            the same, one NewTradePage.fields line each
      ... productId ... 'basic.productId'                 newTrade.setField('productId', product)   <- the argument, not data

    upload 'FX_TRF' dat file            [Java step]     substep "I upload the FX_TRF dat file"
                                                          newTrade.uploadDat(datFile(product))

    page new trade book and captures trade id as 'createdTradeId'
                                                        substep "I book the trade and confirm"
      click book using configured risk engine mode [Java]   newTrade.clickBook()
      component trade change confirmation dialog is visible newTrade.confirmDialog.expectVisible()
      confirm new trade creation and capture response [Java]
      store e2e response field 'data.trade.id' ... as 'createdTradeId'
                                                            newTrade.confirmDialog.confirmAndCapture({ ...NewTradePage.createApi, saveAs: 'createdTradeId' })

    page trade detail header card contains from stored variable 'createdTradeId'
                                                        NOT in createTrade: it checks the outcome. It is in
                                                        expectPendingApproval(tradeId), which the Then calls
```

## What to take from it

- Three levels on each side: feature step = case step (`title`); flow snippet = flow method, its lines grouped into substeps; page / component snippets and their leaves = atomic operations on element keys.
- Four page snippets of the same shape (type into a combobox, click the option) are four lines of the `NewTradePage.fields` table and one operation, `setField`, not four methods.
- `basic.counterpartyName` became `counterpartyName` in `testdata/common.json` and is used as `p.counterpartyName`, so the case file records `${param:counterpartyName}`. `basic.productId` did not become data.
- `createdTradeId` is the return value of `createTrade`; the case hands it to `expectPendingApproval(tradeId)`.
- Two Java steps and a store step collapsed into one `confirmAndCapture`; its URL, method and field are `NewTradePage.createApi`.
- The Examples table is gone: the test loops `productsWith('create')`.
