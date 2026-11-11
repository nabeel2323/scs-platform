# React Hydration Phase 1 — Final Visual QA and Pre-PR Verification Report

- **Date:** 2026-11-11
- **Task:** Independent, read-only verification of the completed Phase 1 implementation before commit / PR submission
- **Repository:** `nabeel2323/scs-platform`
- **Mandate constraints honored:** no application source, test, CI, dependency, environment, provider, or deployment configuration was modified during this verification; nothing was committed, pushed, merged, or deployed; all existing uncommitted work was preserved. The only file created by this task is this report.

---

## 1. Executive verdict

**READY FOR PR.**

The Phase 1 implementation eliminates the React hydration defects (#425 → #418 → #423) in both applications, with **zero visual regressions** in the hydrated UI:

- **Hydration:** 0 hydration markers and 0 page errors on the implementation across all 26 JavaScript-enabled scenarios per app pair (52 total). The pristine baseline reproduces the full #425/#418/#423 chain on **every** JS-enabled scenario (26/26 baseline records, 4 page errors each).
- **Visual parity:** with the live clock pinned for determinism, **26/26 hydrated scenario pairs are pixel-identical (0 changed pixels, max channel delta 0)**. All 30 computed-style/layout pairs match except 4 no-JavaScript pairs, where the difference is the *fix itself* (baseline serves invalid escaped CSS → serif fallback; implementation serves correct CSS → Inter).
- **Responsive behavior:** the merchant-orders 768px breakpoint is exact (45/45 property matches against baseline with seeded data, 0 pixel difference at all 5 viewports); Admin sidebar breakpoints (1079/1080px), collapse/expand, mobile overlay, and permission-filtered navigation all behave identically to baseline.
- **Regression:** Buyer full suite 125/125 passed; Admin Phase 1 suite 16/16 passed; both production builds succeed (web 42/42, admin 37/37 routes); root typecheck 9/9; both lint checks pass. The **only** failing tests — 2 in `apps/admin/src/__tests__/management.test.tsx` — were reproduced **byte-identically on the pristine baseline** and are therefore pre-existing, not regressions (§7).
- **CI:** the new `test-web-admin` job is purely additive (implementation minus the new job deep-equals baseline), runs exactly the intended suites, weakens no existing gate, and introduces no deployment behavior. `release.yml` is byte-identical; `trigger-staging-release` dependencies are unchanged (§8).
- **Integrity:** implementation worktree HEAD is exactly the required baseline `09f6d7d5…`; the change set is 6 modified tracked files (+79/−47) plus 19 new code files and Phase 1 docs; no secrets, env files, provider/database/migration/auth/OTP/deployment changes; unrelated work in all other worktrees preserved (§2, §9).

Remaining items are pre-existing, out-of-scope observations (documented in §9), not blockers.

---

## 2. Exact revision and worktree inspected

| Role | Path | Revision |
| --- | --- | --- |
| Implementation under verification | `C:/TAIF/scs-audit-phase0` | detached HEAD `09f6d7d5a48f76858d42c355f6c1e498a16e0a34` + uncommitted Phase 1 change set |
| Pristine baseline | `C:/TAIF/scs-qa-baseline` | `09f6d7d5a48f76858d42c355f6c1e498a16e0a34`, clean checkout |
| Execution replica (implementation) | `C:/TAIF/scs-qa-impl` | byte-identical copy of the implementation worktree |

**Why a replica was used.** The implementation worktree's `node_modules/.pnpm` store was found corrupted (empty package directories — an environment fault, not a code fault; documented in `C:/TAIF/scs-hydration-findings/qa-ENVIRONMENT-FAULT-pnpm-store.md`). All builds, test suites, typecheck, lint, and browser QA were therefore executed in `C:/TAIF/scs-qa-impl`, a replica proven byte-identical to the implementation worktree: SHA-256 over **3,680 files — 0 differing, 0 missing, 0 extra** (`qa-impl-copy-identity.txt`). The replica's dependency store was verified clean (0 empty package dirs / 1,205). No file in `C:/TAIF/scs-audit-phase0` was modified by this verification.

**Baseline provenance.** `C:/TAIF/scs-qa-baseline` is a pristine checkout of `09f6d7d5…` with a clean install; its contracts package was built before test runs (`qa-baseline-contracts-build.txt`, exit 0) so that baseline test failures could not be attributed to an unbuilt workspace dependency.

**Change set inspected (6 modified tracked files, +79/−47):**

| File | Change |
| --- | --- |
| `apps/web/src/app/layout.tsx` | +1/−9 — inline global `<style>` replaced by `import './globals.css'`; pre-existing `suppressHydrationWarning` on `<html>` retained (present in both revisions) |
| `apps/admin/src/app/layout.tsx` | +1/−11 — same replacement; no `suppressHydrationWarning` in either revision |
| `apps/admin/src/app/page.tsx` | +17/−8 — clock moved to effect-initialized state (`useState<Date|null>(null)` + `useEffect`) |
| `apps/admin/src/components/AdminSidebar.tsx` | +1/−11 — inline `<style>` replaced by `import './AdminSidebar.css'` |
| `apps/web/src/app/merchant/orders/page.tsx` | +1/−8 — inline `<style>` replaced by `import './orders.css'` |
| `.github/workflows/ci.yml` | +58 — new additive `test-web-admin` job (§8) |

Plus 19 new code files (4 stylesheets, 13 test/harness files, 2 type-declaration directories) and Phase 1 documentation. Full status listing: `qa2-integrity.txt`.

**Toolchain:** local Node v26.4.0 (CI uses Node 22 — see §9), pnpm 9.15.9, turbo 2, vitest 2.1.9 + jsdom, Playwright 1.63.0 with Chromium 153.0.8010.12. Production builds (`next build` + `next start`) served on ports 3100 (impl-web), 3101 (base-web), 3200 (impl-admin), 3201 (base-admin); all servers were stopped after QA (ports confirmed down).

---

## 3. Pages and viewports tested

30 scenarios per revision (60 records per pass), run in two passes (unpinned and clock-pinned). Contexts: `timezoneId: 'Asia/Riyadh'`, `locale: 'en-US'`; sessions injected via `addInitScript` (no app changes).

**Buyer (`apps/web`) — 16 scenarios:**

| Scenario | Viewport | State |
| --- | --- | --- |
| home-signedout-desktop | 1440×900 | signed out |
| home-signedout-mobile | 390×844 | signed out |
| home-signedin-desktop | 1440×900 | signed in (buyer session) |
| home-signedin-mobile | 390×844 | signed in |
| menu-mobile-closed | 390×844 | hamburger closed |
| menu-mobile-open | 390×844 | hamburger opened (interaction) |
| menu-tablet-820 | 820×1180 | tablet |
| menu-tablet-769 | 769×1000 | tablet boundary |
| login-desktop | 1440×900 | signed out |
| login-mobile | 390×844 | signed out |
| merchant-orders-desktop | 1440×900 | merchant session |
| merchant-orders-mobile | 390×844 | merchant session |
| merchant-orders-767 | 767×1000 | below breakpoint |
| merchant-orders-769 | 769×1000 | above breakpoint |
| home-nojs-desktop | 1440×900 | JavaScript disabled |
| home-nojs-mobile | 390×844 | JavaScript disabled |

**Admin (`apps/admin`) — 14 scenarios:**

| Scenario | Viewport | State |
| --- | --- | --- |
| dashboard-desktop | 1440×900 | admin session; date/time display |
| dashboard-mobile | 390×844 | admin session |
| sidebar-collapsed | 1440×900 | collapse interaction |
| sidebar-reexpanded | 1440×900 | re-expand interaction |
| sidebar-mobile-overlay | 390×844 | mobile drawer overlay interaction |
| sidebar-1079 | 1079×900 | just below mobile breakpoint |
| sidebar-1080 | 1080×900 | at desktop breakpoint |
| perms-limited-desktop | 1440×900 | restricted-permission session |
| account-desktop | 1440×900 | account page |
| account-mobile | 390×844 | account page |
| login-desktop | 1440×900 | signed out |
| login-mobile | 390×844 | signed out |
| dashboard-nojs-desktop | 1440×900 | JavaScript disabled |
| dashboard-nojs-mobile | 390×844 | JavaScript disabled |

**Supplementary seeded-data pass (merchant orders):** because no API backend was running, the unseeded orders page renders its empty state and the `.mo-filterbar` breakpoint rules never mount. To close that gap, `GET /v1/stores`, `GET /v1/orders`, and `GET /v1/merchant/customers` were route-mocked in Playwright (4 orders: PENDING_CONFIRMATION / ACCEPTED / PREPARING / COMPLETED) and the page was compared at **1440, 769, 768, 767, 390 px** on both revisions (`qa/orders-seeded-comparison.md`).

**Determinism disclosure:** the Buyer home page and Admin dashboard render live clocks. In the second pass, `Date` was pinned via `context.addInitScript` (fixed-time subclass + `Date.now`) so both revisions render identical clock text; this affects only the QA harness, never the application. The unpinned pass is also reported (§5).

---

## 4. Screenshots and evidence references

All evidence lives outside the repository under `C:/TAIF/scs-hydration-findings/` (the repo itself received only this report).

**Authoritative regression outputs (implementation replica):**

| Evidence file | Contents |
| --- | --- |
| `qa2-contracts.txt` | `pnpm contracts:build` — exit 0 |
| `qa2-build-web.txt` | Buyer production build — ✓ 42/42 routes, exit 0 |
| `qa2-build-admin.txt` | Admin production build — ✓ 37/37 routes, exit 0 |
| `qa2-web-suite.txt` | Buyer full suite — 16 files / 125 tests passed, exit 0 |
| `qa2-admin-phase1.txt` | Admin Phase 1 suite — 6 files / 16 tests passed, exit 0 |
| `qa2-management-impl.txt` | Admin management suite (impl) — 2 failed / 8 passed, exit 1 |
| `qa-management-baseline.txt` | Admin management suite (pristine baseline) — 2 failed / 8 passed, exit 1 |
| `qa-management-diff.txt` | Failure-output comparison (assertion bodies byte-identical) |
| `qa2-typecheck-root.txt` | Root typecheck — 9/9 successful, exit 0 |
| `qa2-lint-web.txt` / `qa2-lint-admin.txt` | Lint — exit 0 / exit 0 |
| `phase1-admin-full.txt` | Full Admin suite — 13 files / 88 tests, 2 failed / 86 passed |
| `qa-build-web-baseline.txt`, `qa-build-admin-baseline.txt`, `qa-baseline-contracts-build.txt` | Baseline builds (42/42, 37/37) and contracts build |

**Visual QA outputs (`qa/` subdirectory):**

| Evidence file | Contents |
| --- | --- |
| `visual-qa-results.json`, `visual-qa-results-pinned.json` | 60 records per pass: hydration markers, console/page errors, served-HTML style analysis, computed styles, interactions |
| `visual-qa-comparison.md`, `visual-qa-comparison-pinned.md` | 7-section impl-vs-baseline comparison |
| `visual-qa-pixeldiff.md/.json`, `visual-qa-pixeldiff-pinned.md/.json` | Per-pair pixel diffs (threshold: per-channel delta > 12/255) |
| `visual-qa-followup.md` | Band-text probe, clock first-paint/settled, served style/link order, bundle rule indices |
| `orders-seeded-results.json`, `orders-seeded-comparison.md` | Seeded merchant-orders breakpoint verification (45 properties × 5 viewports) |
| `remaining-inline-style-scan.md/.json` | Scan of all remaining inline `<style>` blocks (22 blocks, 0 offending) |
| `screenshots/` | ~130 PNGs, named `<target>__<scenario>[-pinned].png`, e.g. `impl-web__home-signedout-desktop.png`, `base-admin__sidebar-mobile-overlay.png`, `impl-admin__perms-limited-desktop-pinned.png`, `orders-seeded-impl-mobile-390.png`, `clock-impl-settled.png` |

**Structural / integrity evidence:**

| Evidence file | Contents |
| --- | --- |
| `qa-css-equivalence.txt` | Declaration-level equivalence of all 4 extracted stylesheets (65 declarations; 0 lost / 0 added / 0 duplicated) |
| `qa-built-html-compare.txt` | Built-artifact HTML scan: baseline 39 (web) + 35 (admin) offending inline blocks → implementation 0 |
| `qa2-ci-review.txt` | Parsed YAML diff of `ci.yml`, needs graph, permissions, `release.yml` byte comparison |
| `qa2-integrity.txt` | HEAD/reflog/stash/status, protected-path check, other-worktree preservation |
| `qa-impl-copy-identity.txt` | SHA-256 replica identity proof (3,680 files, 0 differences) |
| `qa-ENVIRONMENT-FAULT-pnpm-store.md` | Environment fault that necessitated the replica |

---

## 5. Visual regression findings

### 5.1 Hydration errors — eliminated

| Metric (per pass) | Implementation | Baseline |
| --- | --- | --- |
| JS-enabled records with hydration markers | **0 / 26** | **26 / 26** |
| Page errors per JS-enabled record | **0** | 4 (#425 ×2, #418 ×1, #423 ×1) |
| Total baseline page errors | — | #425 ×52, #418 ×26, #423 ×26 |

Every baseline JS-enabled scenario reproduces the full chain `Minified React error #425 → #418 → #423` (text mismatch → hydration failure → whole-document client re-render). The implementation produces none, on any page, viewport, or session state. Both passes agree.

### 5.2 Pixel comparison — hydrated UI is identical

- **Pinned-clock pass: 26/26 JS-enabled pairs pixel-identical — 0 changed pixels, max channel delta 0, 0 size mismatches** (`visual-qa-pixeldiff-pinned.md`).
- Unpinned pass: 14/26 pairs already identical; the remaining 12 differ by 0.008–0.039% of pixels. A band-text probe proved every residual band contains only the live clock's minute digits (e.g. `12:40 PM` vs `12:41 PM` captures taken a minute apart) — a harness timing artifact, not a UI change (`visual-qa-followup.md` §1). Pinning the clock eliminated all of it.
- **No-JS pairs (4):** web desktop 3.489% (45,216 px), web mobile 31.651% (104,181 px), admin desktop 0.103% (1,337 px), admin mobile 0.406% (1,337 px). These differences are the **defect fix itself**: with JavaScript disabled, hydration never runs, so the baseline's invalid escaped CSS persists at first paint and the page renders in the serif fallback; the implementation's linked stylesheet applies correctly. Screenshots: `base-web__home-nojs-mobile.png` (serif) vs `impl-web__home-nojs-mobile.png` (Inter).

### 5.3 Computed styles, typography, colors, dimensions

30 paired scenarios probed (body font, nav height, sidebar width, content margin, filterbar/card layout, overflow): **26/30 identical**. The only 4 differences are the no-JS `body.font-family`: baseline `"Times New Roman"` vs implementation `__Inter_d8ebd1, __Inter_Fallback_d8ebd1, "Segoe UI", system-ui, -apple-system, sans-serif` — i.e., the baseline's broken first paint vs the implementation's correct one. No spacing, color, or dimension regressions anywhere.

### 5.4 Stylesheet loading order — correct

- Served HTML: implementation pages link exactly one global stylesheet (`<link rel="stylesheet" data-precedence="next">`); baseline additionally carries the offending inline `<style>` after the link.
- Route-level CSS (`orders.css`) is emitted by Next as `<link rel="preload" as="style">` and promoted to a stylesheet client-side; **DOM order is global-first, route-second** — the correct cascade. On `/merchant/orders` the implementation DOM order is `[38493ef8deb3523d.css (2,654 B, globals), 87deb4918fc0dba0.css (294 B, .mo-filterbar)]`.
- Bundle rule order verified by first-index probe: admin bundle (3,733 B) has `box-sizing` reset at 17, `--font-inter` at 143, `@media` at 275, `.admin-content` 403, `.admin-sidebar` 568, `.admin-sidebar-link` 709 — reset before components, no character references, exactly one `.admin-sidebar-link` block. Web bundle (2,654 B): reset 17, `--font-inter` 166, `@media` 298, 0 character references.
- **CSS equivalence:** all 65 declarations from the 4 removed inline blocks are present in the new stylesheets — **0 lost, 0 added, 0 duplicated** (`qa-css-equivalence.txt`). All 4 converted files: 0 remaining `<style>` blocks, correct CSS import, no `dangerouslySetInnerHTML`. `suppressHydrationWarning` count unchanged (web 1 — pre-existing on `<html>`; admin 0) in both revisions; **no new suppression was added**.

### 5.5 Served-HTML and built-artifact defect scan

| Scan | Baseline | Implementation |
| --- | --- | --- |
| Served HTML, web home | 9 app style blocks, **1 offending** | 8 blocks, **0 offending** |
| Served HTML, web login/orders | 2 blocks, **1 offending** | 1 block, **0 offending** |
| Served HTML, admin (all pages) | 1 block, **1 offending** | 0 blocks, **0 offending** |
| Built HTML artifacts, web | 39 files / 85 app blocks / **39 offending** | 39 files / 46 app blocks / **0 offending** |
| Built HTML artifacts, admin | 35 files / 35 blocks / **35 offending** | 35 files / **0 blocks / 0 offending** |

Baseline offending sample: `body { margin: 0; font-family: var(--font-inter), &#x27;Segoe UI&#x27;, … }` — HTML character references inside a raw-text `<style>` element, which a real HTML parser does not decode (the root cause of #425).

**Remaining inline styles:** 22 blocks remain across web (12), admin (3), ui-kit (7); **0 emit escapable characters** (`remaining-inline-style-scan.md`). The scanner initially flagged `Navbar.tsx:110` (4 quotes); source inspection and a DOM probe (including menu-mobile-open) proved the quotes exist only inside a `${menuOpen ? … : …}` interpolation and never reach the served CSS. These blocks are the same anti-pattern but currently harmless — listed as a risk in §9.

### 5.6 Admin dashboard date/time display

- Served HTML: date/time **absent on both revisions** (AuthGuard gating keeps the dashboard out of server HTML); first client paint: `null` on both.
- Settled (+4s, +6s): both render `Wednesday, November 11, 2026` + time, exactly once each.
- Implementation: 0 page errors; baseline: 4 (#425/#418/#423 chain from the layout defect). Phase 1B is therefore a **latent-defect fix** (the clock could never mismatch in the browser because it was never server-rendered), verified by the dedicated clock test that hydrates the dashboard document root after 61 seconds of elapsed wall time.
- Note: the scenario table's "NO WEEKDAY/DATE TEXT FOUND" entries are probe-timing artifacts (screenshot taken before the effect settled); the focused first-paint/settled probe above is authoritative.

### 5.7 Sidebar, permissions, responsive breakpoints

- `--admin-sidebar-width`: 220px expanded / 56px collapsed / 0px mobile; `.admin-content` margin-left tracks it — identical on both revisions.
- Breakpoint exact: 1079px → hamburger visible, 0 sidebar links; 1080px → 31 links, 220px sidebar.
- Mobile overlay: drawer + scrim + close button visually confirmed (`impl-admin__sidebar-mobile-overlay-pinned.png`); interaction `actionOk=true` on both.
- Permission-filtered navigation: restricted session shows exactly 4 links (Dashboard, Users, Organizations, Account Security) on both revisions.
- All 8 interactions (buyer menu open; admin collapse/re-expand/mobile overlay) succeeded on both revisions with unchanged final URLs.
- **Seeded merchant-orders breakpoint:** 45/45 property matches. 1440/769px → filterbar `wrap`/`visible`, card head `row`/`center`, actions `flex-end`; 768/767/390px → `nowrap`/`auto`/`padding-bottom 6px`, card head `column`/`stretch`, actions `flex-start`; 4 order rows and no horizontal overflow at every viewport; **0 pixel difference at all 5 viewports**. (`filterbarChildFlex "1 1 220px"` on both — the pre-existing inline style beats the non-`!important` rule; preserved, not changed.)
- Buyer navigation: hamburger present at 390px, absent at 769/820px on **both** revisions (pre-existing tablet gap, §9); nav height 57px; no horizontal overflow on any page/viewport.

### 5.8 Console errors

Implementation and baseline show the same console errors, exclusively absent-backend network failures: 92× `Failed to load resource: net::ERR_CONNECTION_REFUSED` and 30× socket.io `ws://localhost:3000` connection failures across all four targets (no API was running; `NEXT_PUBLIC_API_URL` defaults to `http://localhost:3000`). **No application console errors on the implementation; no hydration-related console output.** All baseline page errors are the hydration chain; the implementation has none.

---

## 6. Actual test / build / typecheck / lint outputs

All commands executed fresh in this verification, in `C:/TAIF/scs-qa-impl` (proven-identical replica, §2). Exit codes recorded in the evidence files.

| Check | Command | Result | Exit | Evidence |
| --- | --- | --- | --- | --- |
| Contracts build | `pnpm contracts:build` | success | 0 | `qa2-contracts.txt` |
| Buyer production build | `pnpm --filter @scs/web build` | ✓ Generating static pages (42/42) | 0 | `qa2-build-web.txt` |
| Admin production build | `pnpm --filter @scs/admin build` | ✓ Generating static pages (37/37) | 0 | `qa2-build-admin.txt` |
| Buyer complete suite | `pnpm --filter @scs/web test` | **Test Files 16 passed (16); Tests 125 passed (125)** | 0 | `qa2-web-suite.txt` |
| Admin Phase 1 suite | `pnpm --filter @scs/admin test -- <6 Phase 1 files>` (identical to CI's positional filters) | **Test Files 6 passed (6); Tests 16 passed (16)** | 0 | `qa2-admin-phase1.txt` |
| Admin management suite | `pnpm --filter @scs/admin test -- src/__tests__/management.test.tsx` | **Tests 2 failed \| 8 passed (10)** — pre-existing, see §7 | 1 | `qa2-management-impl.txt` |
| Root typecheck | `pnpm typecheck` (turbo, all packages) | **Tasks: 9 successful, 9 total** | 0 | `qa2-typecheck-root.txt` |
| Buyer lint | `pnpm --filter @scs/web lint` | pass; 2 pre-existing `react-hooks/exhaustive-deps` warnings (`merchant/returns/[id]/page.tsx:44:42`, `hooks/useProductStudio.ts:262:6`) — both files untouched by this change set | 0 | `qa2-lint-web.txt` |
| Admin lint | `pnpm --filter @scs/admin lint` | **✔ No ESLint warnings or errors** | 0 | `qa2-lint-admin.txt` |

Supplementary: full Admin suite (`phase1-admin-full.txt`) — 13 files / 88 tests, **2 failed | 86 passed**; the 2 failures are exactly the management tests below. Baseline builds also succeed (web 42/42, admin 37/37 — `qa-build-*-baseline.txt`), confirming the change set does not alter build output shape.

---

## 7. Baseline comparison of the two Admin management test failures

Per the mandate, the failures were reproduced **independently on both the pristine baseline and the implementation** before classification.

| Run | Worktree | Result | Exit | Evidence |
| --- | --- | --- | --- | --- |
| Baseline | `C:/TAIF/scs-qa-baseline` (pristine `09f6d7d5…`, contracts built first) | 1 file failed; **2 failed \| 8 passed (10)** | 1 | `qa-management-baseline.txt` |
| Implementation | `C:/TAIF/scs-qa-impl` | 1 file failed; **2 failed \| 8 passed (10)** | 1 | `qa2-management-impl.txt` |

**Identical failing tests on both revisions:**

1. `management pages and shared product details > reuses details in full-page and dialog modes`
   `TestingLibraryElementError: Unable to find an element with the text: Complete description…`
2. `management pages and shared product details > uses displayed IDs for shortcuts, suspends in dialogs, and clears paging selection`
   `AssertionError: expected "spy" to be called with arguments: [ 'visible-on-page-2', 'APPROVED' ] … Number of calls: 0`

The assertion bodies are **byte-identical** between the two runs (`qa-management-diff.txt`); only paths/timestamps differ. Neither failing test file nor any code it exercises is touched by the Phase 1 change set.

**Classification: pre-existing failures, not regressions.** They are also excluded from the new CI gate: the `test-web-admin` job runs the Admin suite with 6 positional file filters covering exactly the Phase 1 files, so `management.test.tsx` (and 5 auth-login files and shipops — 72 tests total) are not part of that gate. This is a scoping observation, recorded in §8/§9, not a gate weakening: no previously-running CI test was removed.

---

## 8. CI workflow review

Parsed-YAML comparison of `.github/workflows/ci.yml` (baseline vs implementation) plus raw byte comparison of `release.yml` (`qa2-ci-review.txt`):

**Additive-only change — proven structurally:**
- Jobs: 11 → 12. `ADDED=["test-web-admin"]`, `REMOVED=[]`, `EXISTING_JOBS_CHANGED=[]`.
- **`IMPL_MINUS_NEW_JOB_DEEP_EQUALS_BASELINE=true`** — removing the new job from the implementation YAML yields a deep-equal match to baseline.
- Top-level `name`, `on` (triggers), `env`, `concurrency`, `defaults`, `permissions` all identical. Workflow permissions remain `{contents: read, packages: read, actions: read}`.

**The new `test-web-admin` job:**
- `needs: lint` — same entry dependency as the other test jobs; runs after lint, in parallel with existing test jobs.
- Steps: `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4` (Node 22, pnpm cache), `pnpm install --frozen-lockfile`, `pnpm contracts:build`, `pnpm --filter @scs/web test` (full Buyer suite), and a named step "Admin hydration + global-styles regression tests" running `pnpm --filter @scs/admin test --` with the 6 Phase 1 test files.
- `env: NODE_ENV: test` for the job. **No `continue-on-error`, no job-level permissions block, no secrets, no deploy verbs, no provider configuration.** It runs exactly the suites verified in §6 (the Admin command is identical to the one executed locally).
- Coverage note: the Admin gate covers 6 of 13 Admin test files (the Phase 1 set). The 7 excluded files (5 auth-login, management, shipops — 72 tests, including the 2 known pre-existing failures) were never gated by CI before; nothing was removed.

**No deployment behavior or release-dependency change:**
- `release.yml` **byte-identical** (40,782 B both revisions); its jobs remain `[validate, database-release, deploy, health-check, summary]`.
- `trigger-staging-release` needs list **identical to baseline**: `[lint, test-unit, test-integration, migration-gate, test-contract, build, mobile, container-build]` — it does **not** include `test-web-admin`.
- Observation (not a defect introduced here): the develop→staging release trigger therefore does not wait on the new frontend gate. A red `test-web-admin` blocks the PR check but not the staging release. Recorded as a risk in §9; changing it would alter release dependencies, which this change set correctly avoids.

---

## 9. Remaining risks and limitations

**Pre-existing defects / observations (unchanged by this change set, reproduced on baseline):**

1. **2 Admin management test failures** (§7) — pre-existing at `09f6d7d5…`; need their own fix outside Phase 1.
2. **Buyer tablet navigation gap (769–1024px):** no hamburger and no desktop nav links in that band on both revisions; pixel-identical, so out of scope here.
3. **Admin dashboard Quick Access cards are not permission-filtered** (sidebar is; recorded in the Phase 1C proposal `REACT-HYDRATION-PHASE-1C-RENDER-PHASE-AUTH-PROPOSAL.md`).
4. **22 inline `<style>` blocks remain** (web 12, admin 3, ui-kit 7). All currently emit no escapable characters, but they are the same anti-pattern that caused this incident; any future edit introducing `' " < > &` re-opens the defect. Recommended Phase 2: migrate them to stylesheets and add a lint/CI guard.
5. **2 pre-existing Buyer lint warnings** (`react-hooks/exhaustive-deps`) in files untouched by this change set.
6. **Staging release trigger does not depend on `test-web-admin`** (§8) — deliberate non-change; consider adding it in a separate, explicitly approved CI change.

**Verification limitations (disclosed):**

7. **No API backend was running.** Authenticated pages were exercised with injected sessions; data-driven pages render empty/error states unless seeded. The merchant-orders breakpoint was verified with route-mocked data (§3); other data-heavy surfaces (catalog, inventory, pricing, dashboards with live metrics) were verified for layout/hydration, not for data rendering. Console network errors on both targets are exclusively this absent backend (§5.8).
8. **Execution replica.** All runs used `C:/TAIF/scs-qa-impl`, proven byte-identical to the implementation worktree (3,680 files, SHA-256, 0 differences) because the worktree's pnpm store was corrupted (§2). The implementation worktree itself was never modified.
9. **Node version skew:** local Node v26.4.0 vs CI Node 22. All checks passed locally; CI on Node 22 is the authoritative gate and should be watched on the PR.
10. **Clock pinning** was applied only in the determinism pass and only in the QA harness (§3); the unpinned pass is fully reported and its residuals were proven to be clock digits.
11. **OTP worktree unreadable** (`C:/TAIF/scs-otp-s128-develop`, git "dubious ownership"): it could not be inspected; no writes were made to it and git config was not changed. Main worktree (`C:/TAIF/scs-platform`, branch `feature/buyer-staging-deployment-remediation`, 8 unrelated modified files + scratch dirs) and b2-test worktree (staged catalog page edit) were verified preserved (`qa2-integrity.txt`).
12. **Visual QA scope:** Chromium only, the viewports listed in §3, production builds. No cross-browser (Firefox/Safari) or real-device testing was performed.

**Integrity confirmations (§4 mandate):** implementation HEAD is exactly `09f6d7d5a48f76858d42c355f6c1e498a16e0a34` (detached; reflog shows only the 2026-11-09 worktree creation; no stash; nothing staged). Protected paths — `vercel.json`, `render.yaml`, `infra/`, `apps/api/`, `packages/`, `supabase/`, `.env*`, `pnpm-lock.yaml`, all `package.json` — are clean. No environment or secret files added. No provider, database, migration, authentication-lifecycle, OTP, or deployment settings changed. Nothing committed or pushed. All QA servers stopped (ports 3100/3101/3200/3201 confirmed down).

---

## 10. Recommendation

## **READY FOR PR**

Every mandated check passed with fresh, recorded evidence:

- Hydration defects #425/#418/#423 eliminated in both apps (0 markers / 0 page errors across 52 JS-enabled scenario runs); baseline reproduces them on every scenario.
- Hydrated UI pixel-identical to baseline (26/26 pairs, 0 changed pixels); the only visual differences are the intended first-paint fix under no-JS.
- Buyer suite 125/125, Admin Phase 1 suite 16/16, both production builds, root typecheck 9/9, both lints — all green.
- The only failing tests (2 Admin management) reproduced byte-identically on the pristine baseline → pre-existing, not regressions.
- CI change purely additive; no gate weakened; no deployment behavior; release workflow and trigger dependencies untouched.
- Change-set integrity verified; all unrelated uncommitted work preserved; nothing committed, pushed, or deployed.

The items in §9 are pre-existing or out-of-scope follow-ups (Phase 2 inline-style migration, management-test fix, tablet nav gap, release-trigger dependency decision) and do not block this PR.