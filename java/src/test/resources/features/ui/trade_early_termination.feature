@playwright @ADO#trade_early_termination @ADO#trade_lifecycle @test
Feature: Trade Early Termination E2E
  As a Trader
  I want to view the correct trade status after an EarlyTermination event is processed
  So that I can confirm the trade has been terminated in the system

  @ADO#positive @ADO#smoke
  Scenario Outline: [TC-TRADE-EARLY-TERMINATION-<product_type>-UI-001] should able to perform EarlyTermination event for <product_type> trade successfully
    Given a Live '<product_type>' trade exists in the blotter
    And maker is logged in to the trade portal
    When perform the Early Termination event on the '<product_type>' trade
    Then the early termination is completed successfully
    And the trade is closed as Terminated

    Examples:
      | product_type |
      | FX_CO        |
      | FX_TRF       |
      | FX_FSB       |
