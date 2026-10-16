@playwright @ADO#trade_creation @ADO#trade_lifecycle
Feature: Trade Creation E2E
  As a Trader  I want to create and submit FX TRF trades in the portal
  So that trades progress through the correct trade states and are visible in the blotter

  @ADO#positive @ADO#smoke @test
  Scenario Outline: [TC-TRADE-CREATION-<product_type>-UI-001] Should be able to create a <product_type> Trade
    When maker is logged in to the trade portal
    And creates a new '<product_type>' trade
    Then trade is created with pending approval status and info

    Examples:
      | product_type    |
      | FX_PSCRIPT      |
      | FX_TRF          |
      | FX_PSCRIPT_FSKO |
      | FX_PSCRIPT_TRF  |

  @ADO#positive @ADO#regression
  Scenario Outline: [TC-TRADE-CREATION-<product_type>-UI-002] Should be able to create a <product_type> StepIn Full trade
    When maker is logged in to the trade portal
    And creates a new '<product_type>' StepIn full trade
    Then trade is created with pending approval status and info

    Examples:
      | product_type    |
      | FX_TRF          |
      | FX_PSCRIPT_FSKO |
      | FX_PSCRIPT      |
      | FX_PSCRIPT_TRF  |

  @ADO#positive @ADO#regression
  Scenario Outline: [TC-TRADE-CREATION-<product_type>-UI-003] Should be able to create a <product_type> StepIn Partial trade
    When maker is logged in to the trade portal
    And creates a new '<product_type>' StepIn partial trade
    Then trade is created with pending approval status and info

    Examples:
      | product_type    |
      | FX_TRF          |
      | FX_PSCRIPT_FSKO |
      | FX_PSCRIPT      |
      | FX_PSCRIPT_TRF  |
