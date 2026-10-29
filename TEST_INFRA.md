# Test Infrastructure & E2E Verification Guide

## 1. Overview & Dual Track Protocol
This test infrastructure specification establishes an opaque-box, requirement-driven end-to-end verification harness for the **Restaurant Management System (Cloud SaaS POS)**. Derived strictly from `ORIGINAL_REQUEST.md` and the master feature index in `PROJECT.md`, tests execute as black-box client requests and business workflows without depending on internal implementation private state.

The test infrastructure is designed for self-contained, lightning-fast execution via the native Node.js test runner (`node:test`) and TypeScript execution in Node 24, enabling continuous validation with zero external dependencies.

---

## 2. Feature Inventory
All 23 features identified in the master project architecture (`PROJECT.md`) are comprehensively indexed and mapped into the 4-tier testing hierarchy:

| # | Feature Key | Feature Name | Milestone | Scope & Core Contract |
|---|-------------|--------------|-----------|------------------------|
| 1 | `ORG_BRANCH_SCOPE` | Organization & Branch Scoping | M1 | Multi-tenant organization isolation where Restaurant owns Branches and operational datasets |
| 2 | `SUBSCRIPTION_GATING` | Subscription Tiering & Gating | M1 | SaaS tiers (`FREE`, `STARTER`, `PRO`, `ENTERPRISE`) with table, staff, and feature quota enforcement |
| 3 | `LOCAL_MIGRATION_BUILD` | Local Migrations & Build | M1 | Automated PostgreSQL schema validation, seed data, and clean Next.js/NestJS multi-package builds |
| 4 | `FLOOR_SPATIAL_MGMT` | Floor & Table Spatial Management | M2 | Interactive floor canvas with spatial coordinates (`posX`, `posY`), shape, capacity, and responsive layout |
| 5 | `COLOR_TABLE_STATUS` | Color-Coded Table Statuses | M2 | Visual and programmatic status indicators: Vacant (green/`AVAILABLE`), Cooking (amber/`OCCUPIED`), Billed (blue/`BILLED`) |
| 6 | `TABLE_ORDER_TRANSFER` | Table Order Transfer | M2 | Moving active orders and cart items between tables; releases source table to Vacant and marks target Occupied |
| 7 | `TOUCH_BILLING_FLOW` | Touch Billing Workflow | M3 | Touch-optimized Dine-in & Takeaway ordering with rapid item entry, minimum 44x44px touch targets |
| 8 | `MODIFIER_GROUPS` | Modifier Groups & Popovers | M3 | Add-on selection with `minSelect`/`maxSelect` constraints, required groups, and price adjustments |
| 9 | `RAPID_CART_MANIP` | Rapid Cart Manipulation | M3 | Line quantity adjustments, Half/Full portions, custom prices, item kitchen notes, and line removals |
| 10 | `OUT_OF_STOCK_TOGGLE` | One-Click Out-of-Stock Toggle | M3 | Instant 1-click toggle to 86 an item, disabling it across POS carts and customer-facing menus |
| 11 | `DIGITAL_KDS_QUEUE` | Digital KDS Queue | M3 | Live kitchen display screen grouped by station with elapsed order timers and forward status moves |
| 12 | `THERMAL_TICKET_PRINT` | Thermal Ticket Print | M3 | Dual 80mm & 58mm thermal receipt printing layouts via `@media print` CSS and ESC/POS byte streams |
| 13 | `WAITER_ATTRIBUTION` | Waiter Identification Attribution | M3 | Recording and printing active waiter name/ID on KOT kitchen tickets, bills, and KDS cards |
| 14 | `DYNAMIC_UPI_QR` | Dynamic UPI QR Generation | M4 | NPCI-compliant UPI deep links and QR payloads pre-filled with payee VPA, name, and exact bill amount |
| 15 | `CASH_CHANGE_CALC` | Cash Tender & Change Calc | M4 | Automatic calculation of change when cash tendered exceeds order balance, rejecting under-tenders |
| 16 | `SPLIT_TENDERS` | Split Tenders & Multi-Payment | M4 | Settling a single bill across multiple payment methods (Cash + Card + UPI) or partial payments |
| 17 | `OPENING_FLOAT_PETTY` | Opening Float & Petty Cash | M4 | Recording starting cash float and logging drawer petty cash expense disbursements |
| 18 | `DAILY_Z_REPORT` | Daily Z-Report Closing | M4 | End-of-day reconciliation comparing expected cash (`opening + cashSales - cashExpenses`) against counted cash |
| 19 | `TENANT_METADATA` | Tenant Metadata & Branding | M4 | Custom branding assets (logo, theme/colors), business metadata, currency, and white-labeling |
| 20 | `TAX_REGIMES` | Tax Regimes & Configurable Rates | M4 | Multi-region tax configurations: India GST (CGST/SGST split), US Sales Tax, EU VAT, and Spain IVA |
| 21 | `STAFF_MANAGEMENT` | Staff Account Management | M4 | Add, edit, and deactivate staff members with assigned roles and 4-digit PIN credentials |
| 22 | `PIN_QUICK_SWITCH` | 4-Digit PIN Quick Switch | M4 | Fast staff switching via 4-digit PIN on shared POS terminals without full re-authentication |
| 23 | `GRANULAR_RBAC` | Granular RBAC Permissions | M4 | Role-based permission enforcement restricting route and action access across Owner, Cashier, Waiter, and Kitchen |

---

## 3. 4-Tier Test Architecture & Directory Layout

The E2E test suites are organized into four distinct tiers under `apps/web/tests/e2e/`:

```
apps/web/tests/e2e/
├── helpers/
│   ├── tenancy-engine.ts           # Multi-tenant scoping, tiers, quotas, feature flags
│   ├── table-floor-engine.ts       # Table floor spatial mechanics, status lifecycle, transfer logic
│   ├── pos-cart-engine.ts          # Touch POS cart, modifiers, out-of-stock toggle, portions
│   ├── kot-kds-engine.ts           # KOT generation, station routing, thermal layout, waiter attribution
│   ├── settlement-drawer-engine.ts # UPI QR generation, cash change, split tender, Z-report cash reconciliation
│   └── auth-rbac-engine.ts         # Staff management, 4-digit PIN authentication, route/action RBAC
├── tier1_features/                 # Tier 1: Feature Coverage (>=5 tests per feature for all 23 features)
│   ├── feature_01_organization_branch_scoping.test.ts
│   ├── feature_02_subscription_tiering_gating.test.ts
│   ├── feature_03_local_migrations_build.test.ts
│   ├── feature_04_floor_table_spatial.test.ts
│   ├── feature_05_color_coded_table_statuses.test.ts
│   ├── feature_06_table_order_transfer.test.ts
│   ├── feature_07_touch_billing_workflow.test.ts
│   ├── feature_08_modifier_groups_popovers.test.ts
│   ├── feature_09_rapid_cart_manipulation.test.ts
│   ├── feature_10_out_of_stock_toggle.test.ts
│   ├── feature_11_digital_kds_queue.test.ts
│   ├── feature_12_thermal_ticket_print.test.ts
│   ├── feature_13_waiter_identification.test.ts
│   ├── feature_14_dynamic_upi_qr.test.ts
│   ├── feature_15_cash_tender_change.test.ts
│   ├── feature_16_split_tenders_multi_payment.test.ts
│   ├── feature_17_opening_float_petty_cash.test.ts
│   ├── feature_18_daily_z_report_closing.test.ts
│   ├── feature_19_tenant_metadata_branding.test.ts
│   ├── feature_20_tax_regimes_configurable_rates.test.ts
│   ├── feature_21_staff_account_management.test.ts
│   ├── feature_22_pin_quick_switch.test.ts
│   └── feature_23_granular_rbac_permissions.test.ts
├── tier2_boundaries/               # Tier 2: Boundary & Corner Cases (>=5 tests per feature for all 23 features)
│   ├── boundary_01_organization_branch_scoping.test.ts
│   ├── boundary_02_subscription_tiering_gating.test.ts
│   ├── boundary_03_local_migrations_build.test.ts
│   ├── boundary_04_floor_table_spatial.test.ts
│   ├── boundary_05_color_coded_table_statuses.test.ts
│   ├── boundary_06_table_order_transfer.test.ts
│   ├── boundary_07_touch_billing_workflow.test.ts
│   ├── boundary_08_modifier_groups_popovers.test.ts
│   ├── boundary_09_rapid_cart_manipulation.test.ts
│   ├── boundary_10_out_of_stock_toggle.test.ts
│   ├── boundary_11_digital_kds_queue.test.ts
│   ├── boundary_12_thermal_ticket_print.test.ts
│   ├── boundary_13_waiter_identification.test.ts
│   ├── boundary_14_dynamic_upi_qr.test.ts
│   ├── boundary_15_cash_tender_change.test.ts
│   ├── boundary_16_split_tenders_multi_payment.test.ts
│   ├── boundary_17_opening_float_petty_cash.test.ts
│   ├── boundary_18_daily_z_report_closing.test.ts
│   ├── boundary_19_tenant_metadata_branding.test.ts
│   ├── boundary_20_tax_regimes_configurable_rates.test.ts
│   ├── boundary_21_staff_account_management.test.ts
│   ├── boundary_22_pin_quick_switch.test.ts
│   └── boundary_23_granular_rbac_permissions.test.ts
├── tier3_pairwise/                 # Tier 3: Cross-Feature Combinations
│   ├── pairwise_table_cart_kot.test.ts
│   ├── pairwise_payment_settlement_zreport.test.ts
│   ├── pairwise_staff_pin_rbac_switching.test.ts
│   ├── pairwise_outofstock_kds_routing.test.ts
│   ├── pairwise_subscription_quotas_tables.test.ts
│   └── pairwise_tax_regime_thermal_receipts.test.ts
└── tier4_scenarios/                # Tier 4: Real-World Operational Workloads
    ├── scenario_lunch_rush_lifecycle.test.ts
    ├── scenario_table_transfer_split_settlement.test.ts
    ├── scenario_fast_casual_takeaway_stock_surge.test.ts
    ├── scenario_multi_tenant_quota_upgrade_isolation.test.ts
    └── scenario_shift_handover_drawer_discrepancy.test.ts
```

---

## 4. Test Runner & Execution Commands

### Primary Test Runner
- **Command**: `pnpm --filter web test`
  Executes the full suite including both base unit tests and all 4 tiers of E2E tests.
- **Dedicated E2E Runner**: `pnpm run test:e2e` (from root) or `pnpm --filter web test:e2e`
  Executes all Tier 1, Tier 2, Tier 3, and Tier 4 E2E tests directly.
- **Direct CLI Execution**:
  `cd apps/web && node --test --no-warnings 'tests/e2e/**/*.test.ts'`

### Test Runner Characteristics
- **Zero Daemon Dependencies**: Tests run self-contained in-memory without requiring external Docker or running database daemons.
- **High Concurrency & Speed**: Full suite executes in ~3 to 5 seconds.
- **Deterministic**: No random flakiness, no sleep polling, explicit assertions using `node:assert/strict`.

---

## 5. Coverage Thresholds
- **Tier 1 (Feature Coverage)**: 23 features x >=5 tests = **>=115 tests**
- **Tier 2 (Boundary & Corner Cases)**: 23 features x >=5 tests = **>=115 tests**
- **Tier 3 (Cross-Feature Combinations)**: 6 pairwise suites = **>=30 tests**
- **Tier 4 (Real-World Scenarios)**: 5 comprehensive workflows = **>=20 tests**
- **Total E2E Tests**: **>=280 tests**
