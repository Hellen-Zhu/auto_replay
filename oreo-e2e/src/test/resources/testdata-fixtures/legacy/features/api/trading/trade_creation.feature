@api @ADO#trade_creation @ADO#trade_lifecycle
Feature: Trade Creation API
  As a Trader
  I want to submit new trades via the API
  So that dual-authorised trades enter the live trading creation and unauthorised actions are blocked

  @ADO#positive @ADO#smoke @capability#create
  Scenario Outline: [TC-TRADE-CREATION-<product_type>-API-001] Valid <product_type> trade submission enters Pending Approval state
    Given maker has valid data for '<product_type>' New trade submission
    When performs the Trade Creation action via api
    Then the trade is created with status as 'Pending Approval Draft' and persisted successfully

    Examples:
      | product_type    |
      | FX_TRF          |
      | FX_PSCRIPT      |
      | FX_PSCRIPT_FSKO |
      | FX_PSCRIPT_TRF  |

  @ADO#positive @ADO#regression @capability#stepInPartial
  Scenario Outline: [TC-TRADE-CREATION-<product_type>-API-002] Valid <product_type> Step In Partial trade submission enters Pending Approval state
    Given maker has valid data for '<product_type>' StepIn Partial trade submission
    When performs the Trade Creation action via api
    Then the trade is created with status as 'Pending Approval Draft' and persisted successfully

    Examples:
      | product_type    |
      | FX_TRF          |
      | FX_PSCRIPT      |
      | FX_PSCRIPT_FSKO |
      | FX_PSCRIPT_TRF  |

  @ADO#positive @ADO#regression @capability#stepInFull
  Scenario Outline: [TC-TRADE-CREATION-<product_type>-API-003] Valid <product_type> Step In Full trade submission enters Pending Approval state
    Given maker has valid data for '<product_type>' StepIn Full trade submission
    When performs the Trade Creation action via api
    Then the trade is created with status as 'Pending Approval Draft' and persisted successfully

    Examples:
      | product_type    |
      | FX_TRF          |
      | FX_PSCRIPT      |
      | FX_PSCRIPT_FSKO |
      | FX_PSCRIPT_TRF  |

  @ADO#negative @ADO#regression
  Scenario: [TC-TRADE-CREATION-API-004] Trade creation is rejected when counterparty is absent for FX_TRF trade
    Given maker has invalid 'counterparty' data for 'FX_TRF' StepIn Partial trade submission
    When performs the Trade Creation action via api
    Then the trade creation request is rejected with a validation error

  @ADO#negative @ADO#regression
  Scenario: [TC-TRADE-CREATION-API-005] Trade creation is rejected when portfolio is absent for FX_TRF trade
    Given maker has invalid 'portfolio' data for 'FX_TRF' StepIn Full trade submission
    When performs the Trade Creation action via api
    Then the trade creation request is rejected with a validation error

  @ADO#negative @ADO#regression
  Scenario: [TC-TRADE-CREATION-API-006] User without Maker role cannot submit a FX_TRF trade
    Given checker has valid data for 'FX_TRF' New trade submission
    When performs the Trade Creation action via api
    Then the trade creation request is rejected with permission denied
