# Test Data Map

## Scenario
Supplier Onboarding Modernization: a procurement user creates a supplier onboarding request in Salesforce; MuleSoft maps it to the Oracle E-Business Suite Supplier API; EBS validates and creates the supplier master record.

## Application graph
Salesforce → MuleSoft: salesforce-supplier-onboarding → Supplier API: Create Supplier → AP_SUPPLIER_PKG.CREATE_SUPPLIER → AP_SUPPLIERS

## Functional chain
1. Submit Onboarding Request — Salesforce
2. Create Supplier — Oracle E-Business Suite
3. Supplier_Onboarding_Request__c → MuleSoft flow → Supplier API → EBS procedure → AP_SUPPLIERS

## Project chain
Epic: Supplier onboarding automation
→ Feature: Supplier creation integration
→ User Story: Create supplier from onboarding request
→ Acceptance criteria: mapping, vendor ID return, Tax ID preservation

A second user story covers duplicate Tax ID prevention. A non-functional requirement covers integration-failure auditability.

## Test chain
| Requirement | Test | Status | Defect |
|---|---|---|---|
| Create supplier | Create supplier successfully | Pass | — |
| Create supplier | Supplier API preserves Tax ID mapping | Pass | — |
| Block duplicate supplier | Block duplicate supplier by Tax ID | Fail | Duplicate response does not identify existing supplier |
| Audit integration failures | Integration timeout remains traceable | Not Run | Timeout loses correlation ID |

## Meeting chain
The discovery meeting contains the same business rules as the committed requirements. Its accepted candidate is the duplicate-Tax-ID business rule.

## AI Root Cause Advisor evidence
The primary defect is linked to Supplier API: Create Supplier, AP_SUPPLIER_PKG.CREATE_SUPPLIER, MuleSoft: salesforce-supplier-onboarding and AP_SUPPLIERS. This intentionally gives the advisor evidence across the integration boundary.
