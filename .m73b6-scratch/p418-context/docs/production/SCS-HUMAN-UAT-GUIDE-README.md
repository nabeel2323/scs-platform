# SCS Platform — Human UI Acceptance Testing Guide

## Purpose

This guide provides a **complete, interactive testing environment** for human QA testers to verify the SCS Platform through the actual browser and mobile UI.

This is **NOT** an automated test suite. All test cases begin as `NOT TESTED` and remain so until a human physically performs the test and records the result.

The guide covers the entire marketplace lifecycle:

```
Platform Governance → Catalog → Merchant → Offer → Inventory
→ Buyer → Cart → Checkout → Multi-Merchant Order
→ Merchant Fulfillment → Partial Acceptance
→ Inventory Synchronization → Dispute → Review
```

---

## How to Open

1. Navigate to `docs/production/`
2. Open `SCS-HUMAN-UAT-GUIDE.html` in any modern browser (Chrome, Firefox, Edge, Safari)
3. No server required — the file is fully self-contained
4. Works offline after initial load

---

## Environment Preparation

### Required Infrastructure

| Component | URL | Notes |
|-----------|-----|-------|
| API | `http://localhost:3100` | NestJS backend |
| Buyer Web | `http://localhost:3000` | Next.js buyer + merchant |
| Admin | `http://localhost:3001` | Next.js admin console |
| PostgreSQL | `localhost:5432` | Database |
| Mobile | Flutter emulator or device | Buyer + merchant screens |

### Required Accounts

| Role | Email Placeholder | Purpose |
|------|-------------------|---------|
| SUPER_ADMIN | `SUPER_ADMIN_EMAIL` | Full platform access |
| ADMIN | `ADMIN_EMAIL` | Catalog governance, user management |
| MODERATOR | `MODERATOR_EMAIL` | Catalog moderation |
| MERCHANT_OWNER | `MERCHANT_EMAIL` | Product studio, offers, orders |
| MERCHANT_STAFF | `STAFF_EMAIL` | Merchant staff operations |
| BUYER | `BUYER_EMAIL` | Shopping, checkout, orders |

Replace placeholders with actual credentials from your environment.

### Seed Data

Run catalog seed commands before testing:

```bash
pnpm db:seed:catalog        # Base catalog structure
pnpm db:seed:catalog:demo   # Demo products and variants
```

Verify seed data loaded:
- Categories exist in Admin → Categories
- Products exist in Admin → Products
- At least one merchant with active offers

---

## How to Use the Guide

### Dashboard

The dashboard shows real-time statistics:
- Total test cases and completion percentage
- Pass/Fail/Blocked/Not Tested counts
- Progress by application, role, and module
- Critical test status

### Test Suites

The guide contains **38 test suites** organized by functional area:

| Suite | Area | Description |
|-------|------|-------------|
| 01 | Test Environment | Verify infrastructure and accounts |
| 02 | Authentication | Login, logout, session management |
| 03-06 | Admin | Dashboard, users, organizations, merchants |
| 07-09 | Catalog Governance | Categories, brands, attributes, product types |
| 08-09 | Products & Variants | Canonical products and variants |
| 10 | Product Studio | Merchant product creation wizard |
| 11-13 | Merchant | Offers, pricing, inventory |
| 14-16 | Buyer | Search, product details, offer comparison |
| 17-19 | Commerce | Cart, checkout, multi-merchant checkout |
| 20-22 | Orders | Lifecycle, partial acceptance, inventory sync |
| 23-25 | Post-Order | Disputes, reviews, notifications |
| 26-27 | Import | Catalog import center, import-to-commerce |
| 28-31 | Security & Quality | RBAC, errors, validation, idempotency |
| 32 | Mobile | Flutter app testing |
| 33-35 | Cross-System | E2E journeys, data integrity |
| 36-38 | UX | Responsive, quality, console sanity |

### Running Tests

1. **Select a suite** from the sidebar
2. **Click a test case** to expand it
3. **Follow each step** by checking the checkbox when completed
4. **Set the status** using the status buttons:
   - `PASS` — All steps completed, expected results observed
   - `FAIL` — An expected result was not achieved
   - `BLOCKED` — Cannot continue (environment issue, missing dependency)
   - `N/A` — Test does not apply to this environment
   - `NOT TESTED` — Default state (no human has tested yet)
5. **Record evidence** in the text area (screenshot filenames, entity IDs, observations)
6. **Record created entity IDs** in the fields provided

### Live Test Session

Use the "Live Test Session" section to record:
- Environment URLs
- Account credentials (placeholders only — never real passwords)
- Created entity IDs (Organization, Merchant, Store, Product, Variant, Offer, Order, etc.)

These IDs persist across page reloads and are included in exports.

---

## Status Rules

| Status | Meaning |
|--------|---------|
| `NOT TESTED` | Default. No human has performed this test. |
| `PASS` | Human completed all steps and observed expected results. |
| `FAIL` | Human completed steps but an expected result was not achieved. |
| `BLOCKED` | Human cannot complete the test due to external blocker. |
| `N/A` | Test genuinely does not apply to this environment. |

**A test NEVER becomes PASS automatically.** Human interaction is required.

---

## Recording Evidence

For each test, record:
- **Screenshots** — Filename or reference
- **Entity IDs** — Product ID, Variant ID, Offer ID, Order ID, etc.
- **Observations** — What you saw, any unexpected behavior
- **Blockers** — If blocked, what prevented completion

---

## Exporting Results

### Export JSON
Saves the complete test session (all statuses, evidence, session data) as a JSON file. Use for backup or sharing.

### Import JSON
Restores a previously exported test session.

### Export HTML Report
Generates a standalone HTML report with summary statistics, failed/blocked tests, and sign-off information.

### Print
Print-friendly formatting for physical records.

---

## Interpreting Failures

When a test **FAILS**:
1. Record the exact step that failed
2. Record what happened vs. what was expected
3. Take a screenshot if possible
4. Note the entity IDs involved
5. Check if the failure is a known limitation (see below)

When a test is **BLOCKED**:
1. Record the blocker (e.g., "service unavailable", "account not created")
2. Note which other tests depend on this one

---

## Automated Evidence vs. Human Acceptance

The guide includes a section listing automated backend tests found in the repository:

- `catalog-lifecycle.e2e.spec.ts`
- `transaction-lifecycle.e2e.spec.ts`
- `phase1-marketplace.e2e.spec.ts`
- `phase2-multi-merchant.e2e.spec.ts`
- `phase3-security.e2e.spec.ts`
- `phase4-import-commerce.e2e.spec.ts`

These tests provide evidence that the **backend logic works**, but they do **NOT** constitute human UI acceptance. A backend test passing does not mean the UI is usable, the workflow is intuitive, or the visual output is correct.

**All human UI tests remain `NOT TESTED` until physically performed.**

---

## Known Limitations

| Limitation | Impact | Status |
|------------|--------|--------|
| DRIVER role not fully implemented | Mobile driver screens are UI scaffold only | OUT OF SCOPE |
| Mobile has no role-based UI gating | Any authenticated user can reach any screen (server 403s protect data) | KNOWN GAP |
| Some admin pages show minimal content | Merchants, Orders, Products list pages are stubs | KNOWN GAP |

These are documented in the guide. Tests affected by these limitations should be marked `N/A` or `BLOCKED` with explanation.

---

## Final Sign-Off Procedure

After completing all applicable test suites:

1. Navigate to the "Final Sign-Off" section
2. Enter your name, date, and environment
3. Select overall acceptance: `ACCEPTED`, `CONDITIONALLY ACCEPTED`, or `NOT ACCEPTED`
4. Add notes summarizing findings
5. Export the HTML Report for the record

**The guide does NOT auto-generate an "Approved" status.** The tester must explicitly sign off.

---

## Critical Tests

The following are marked as **CRITICAL** — failure of any indicates a fundamental platform issue:

- Authentication (all roles)
- RBAC / Tenant isolation
- Catalog product creation
- Variant creation
- Offer creation
- Inventory management
- Buyer search and PDP
- Cart and checkout
- Multi-merchant checkout
- Order creation and acceptance
- Partial acceptance
- Inventory/order synchronization
- Dispute creation
- Catalog import
- Import → Commerce lifecycle

Critical failures appear prominently on the dashboard.

---

## Data Integrity Notes

The SCS Platform follows a canonical catalog architecture:

```
Category → Product Type → Canonical Product → Variant → Merchant Offer
```

**Canonical Product** defines WHAT the product is (platform-owned).
**Variant** defines a specific SKU-level configuration.
**Merchant Offer** defines HOW a merchant sells it (price, stock, MOQ, lead time).

Tests verify that:
- Platform taxonomy is protected from merchant modification
- Merchant offer data is isolated per store
- Checkout uses server-side pricing (never trusts client)
- Financial invariant: `total = subtotal - discount + tax + delivery`

---

## File Structure

```
docs/production/
├── SCS-HUMAN-UAT-GUIDE.html          ← Main interactive guide (open this)
├── SCS-HUMAN-UAT-GUIDE-README.md     ← This file
└── (optional) SCS-HUMAN-UAT-DATA.md  ← Additional test data reference
```

---

## Support

If the guide itself has a bug (broken JavaScript, missing test case, incorrect route):
- Document the issue in the Notes field of the affected test
- Export the JSON session and share with the documentation team

Do NOT modify the production application to work around guide issues.
