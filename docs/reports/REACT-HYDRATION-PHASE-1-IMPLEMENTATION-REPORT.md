# Phase 1 — Critical React Hydration Remediation: Implementation Report

**Status:** Implemented and locally verified. **Not deployed. Not committed. Not pushed.**
**Repository:** `nabeel2323/scs-platform`
**Required baseline:** `09f6d7d5a48f76858d42c355f6c1e498a16e0a34` — this worktree is checked out at exactly that commit (`git rev-parse HEAD` → `09f6d7d5…`, detached HEAD, no commit created).
**Workspace:** isolated git worktree `C:/TAIF/scs-audit-phase0` (main checkout `C:/TAIF/scs-platform` untouched).
**Execution mode:** IMPLEMENTATION — CONTROLLED SCOPE.
**Date:** 2026-11-10
**Defect inventory this executes:** `CROSS-APPLICATION-REACT-HYDRATION-READ-ONLY-INVESTIGATION.md` (Phase 0 read-only investigation).

This report is evidence-based. Every claim cites a `file:line` in this repository, a named test that was actually executed, or command output reproduced below. Where something was **not** done or **not** verified, it says so.

---

## 1. Deliverables index (all nine, in the order requested)

| # | Required deliverable | Where |
| --- | --- | --- |
| 1 | Implementation report | this document |
| 2 | Exact list of changed files | §3 |
| 3 | Before/after technical explanation | §4 |
| 4 | Test results, with actual command output | §5 |
| 5 | Build results for both applications | §6 |
| 6 | Security regression results (authentication + permissions) | §7 |
| 7 | Documentation updates | §8 |
| 8 | Remaining issues and limitations | §10 |
| 9 | Explicit confirmation that no deployment or provider configuration changed | §2 and §11 |

---

## 2. Authorization boundary

Every restriction in the brief was honoured. None of these actions was performed:

| Restriction | Status |
| --- | --- |
| Do not deploy | Nothing deployed. No `vercel deploy`, no Render deploy trigger, no `git push`, no release run started |
| Do not change provider settings | Vercel, Render, Supabase, SMTP, SMS, WhatsApp, Redis, Postgres — not touched. No provider API was called |
| Do not change databases or migrations | No file under `apps/api/**`, `packages/**`, `infra/**` or any migration is in the change set (§3) |
| Do not modify OTP, SMTP, SMS or WhatsApp configuration | Untouched; no `.env*` file exists in this worktree and none was created |
| Do not change environment variables | `NEXT_PUBLIC_API_URL`, API URL, CSP, `turbo.json` `globalEnv`/`globalDependencies`, both `next.config.js`, all `.env.example` — unchanged |
| Do not commit or push without approval | `git rev-parse HEAD` is the baseline `09f6d7d5`; all work is uncommitted working-tree state |
| Preserve unrelated working-tree changes | The four Phase 0 / staging reports already present as untracked files (`docs/reports/ENVIRONMENT-ARCHITECTURE-PHASE-0-*.md`, `docs/reports/STAGING-RENDER-RUNTIME-*.md`) were left exactly as found; nothing was reverted, restaged, or deleted |

The one workflow-file change (`.github/workflows/ci.yml`, +58 lines, one new job, zero lines removed) exists **because Phase 1E required it** — "Add tests to the existing test framework and ensure they run in CI". It adds a test job only: no deploy step, no provider credential, no change to `build`'s `needs`, no change to `trigger-staging-release`, and no change to `release.yml`.

Two prohibitions inside the implementation brief were also honoured absolutely:

- **No `dangerouslySetInnerHTML`** was introduced. The only occurrence in either app is pre-existing and unrelated (JSON-LD in `apps/web/src/app/products/[id]/ProductDetailClient.tsx:400`).
- **No `suppressHydrationWarning` was added** to hide anything. `git diff` adds no instance; the Buyer root layout's pre-existing `<html suppressHydrationWarning>` (`apps/web/src/app/layout.tsx:22`) was left in place, untouched, and §4.1 explains why it never masked this defect.

---

## 3. Exact list of changed files

### 3.1 Modified — 6 files (production 5, CI 1)

| File | Δ | What changed |
| --- | --- | --- |
| `apps/web/src/app/layout.tsx` | +1 / −9 | `<head><style>{…}</style></head>` removed; `import './globals.css'` added |
| `apps/admin/src/app/layout.tsx` | +1 / −11 | same, including the two `.admin-content` rules |
| `apps/admin/src/app/page.tsx` | +17 / −8 | render-phase `new Date()` → effect-initialized `now` state |
| `apps/admin/src/components/AdminSidebar.tsx` | +1 / −11 | inline `<style>` block removed; `import './AdminSidebar.css'` added |
| `apps/web/src/app/merchant/orders/page.tsx` | +1 / −8 | inline mobile `<style>` block removed; `import './orders.css'` added |
| `.github/workflows/ci.yml` | +58 / −0 | new `test-web-admin` job (Web & Admin App Tests) |

### 3.2 Added — 19 files

**Stylesheets (4)** — content moved verbatim from the deleted `<style>` text:
`apps/web/src/app/globals.css` (48 L) · `apps/admin/src/app/globals.css` (62 L) · `apps/admin/src/components/AdminSidebar.css` (72 L) · `apps/web/src/app/merchant/orders/orders.css` (33 L)

**Type declarations (2)** — needed so `tsc --noEmit` accepts a side-effect CSS import:
`apps/web/src/types/styles.d.ts` · `apps/admin/src/types/styles.d.ts` (each `declare module '*.css';`)

**Document-root test harness (2, identical)** —
`apps/web/src/__tests__/document-root-harness.tsx` · `apps/admin/src/__tests__/document-root-harness.tsx` (199 L each)

**Tests (11 files, 29 new tests)** —
Buyer/merchant: `global-styles.test.tsx` (2) · `hydration-document-root.test.tsx` (3) · `hydration-merchant-orders.test.tsx` (3) · `hydration-buyer-session.test.tsx` (3) · `hydration-buyer-signed-out.test.tsx` (2)
Admin: `global-styles.test.tsx` (2) · `sidebar-styles.test.tsx` (2) · `hydration-document-root.test.tsx` (3) · `hydration-admin-clock.test.tsx` (3) · `hydration-admin-session.test.tsx` (4) · `hydration-admin-perms.test.tsx` (2)

### 3.3 Documentation added (3 files)

`docs/playbooks/hydration-safe-markup-patterns.md` · `docs/reports/REACT-HYDRATION-PHASE-1C-RENDER-PHASE-AUTH-PROPOSAL.md` · `docs/reports/REACT-HYDRATION-PHASE-1-IMPLEMENTATION-REPORT.md` (this file).

### 3.4 Confirmed NOT in the change set

No file under `apps/api/`, `apps/mobile/`, `packages/`, `infra/`, `e2e/`, no `next.config.js`, no `vercel.json`, no `.env*`, no `turbo.json`, no `package.json`, no migration, no `lib/auth.ts`, no `AuthGuard.tsx`, no `merchant/layout.tsx`, no `AuthProvider.tsx` — i.e. nothing that could alter authentication, permissions, API contracts, token storage, or deployment.

---

## 4. Before / after, per phase

### 4.1 Phase 1A — root-layout CSS (the confirmed primary defect)

**Mechanism.** React renders a text child through `escapeTextForBrowser`, so `' " < > &` arrive in the HTML as `&#x27; &quot; &lt; &gt; &amp;`. `<style>` is an HTML **raw-text element**: a real parser does not decode character references inside it. The DOM text node therefore keeps `&#x27;` while the client's own render produces `'`. The trees disagree at that node → **#425** (text content mismatch) → **#418** (hydration error) → **#423** (root could not hydrate) → React discards the whole server tree and re-renders the entire document client-side, on every page, on every load.

**Before** (`apps/web/src/app/layout.tsx`, same shape in admin):

```tsx
<html lang="en" dir="ltr" className={inter.variable} suppressHydrationWarning>
  <head>
    <style>{`
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; font-family: var(--font-inter), 'Segoe UI', system-ui, -apple-system, sans-serif; }
      …
    `}</style>
  </head>
```

**After:**

```tsx
import './globals.css';
…
<html lang="en" dir="ltr" className={inter.variable} suppressHydrationWarning>
  <body style={{ margin: 0, background: '#f2f5f6' }}>
```

Every declaration moved to `src/app/globals.css` verbatim, including the admin-only `.admin-content { margin-left: var(--admin-sidebar-width, 220px); … }` and its `@media (max-width: 1079px)` override. Font loading (`Inter({ variable: '--font-inter' })`), `metadata`, the `<html lang dir className>` attributes, the skip link, `ToastProvider`/`AuthProvider` nesting and the `#main-content` container are unchanged.

**Why `suppressHydrationWarning` did not hide this:** it applies to the element it is written on, not to descendants. The mismatch lived in `<head><style>`'s text node — one level below `<html>` — so the warning fired at full strength regardless. That is why the flag stayed (pre-existing, out of scope, and harmless) and why removing the escaping source was the only correct fix.

**Build-level proof** (not just tests): the reset now reaches the browser as a linked stylesheet, and no prerendered page contains an escaped application style block.

```
prerendered HTML files scanned: 74
application-authored <style> blocks containing character references: 0
href in apps/admin/.next/server/app/index.html → /_next/static/css/b34089300daa8af4.css   (contains the literal "Segoe UI" stack, unescaped)
```

### 4.2 Phase 1B — Admin dashboard clock

**Before** (`apps/admin/src/app/page.tsx`): `const now = new Date();` computed during render and formatted into the page header. Server and client compute it at different instants in (potentially) different timezones, so the text differs → the same #425 family, and it also made the app nondeterministic under any timezone split.

**After:** the Buyer home page's existing safe pattern —

```tsx
const [now, setNow] = useState<Date | null>(null);
useEffect(() => { setNow(new Date()); }, []);
…
trailing={ now ? (<div>…toLocaleDateString('en-US', { weekday, month, day, year })…
                   {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}…</div>)
               : undefined }
```

The server pass and the first client pass both emit **no** clock, so they are identical; the clock appears after mount. Formatting strings are unchanged. No suppression, no placeholder text. The `new Date(req.createdAt)` inside the data-driven org-update table was deliberately left alone: that table only exists after a client fetch, so it never had a server counterpart to disagree with.

### 4.3 Phase 1C — authentication and permission rendering: audited, deliberately not refactored

Findings, in one line each:

- The render-phase primitive is unsafe in isolation: `useRequirePerms` calls `getUser()` during render (`apps/admin/src/hooks/useRequirePerms.tsx:13`), and `getUser()` reads a module value filled from `localStorage` by `restoreSession()` at import time (`apps/admin/src/lib/auth.ts:162`). On the server that is `null` → `hasAccess === false`.
- It is currently **masked, not fixed**: `apps/admin/src/app/layout.tsx:26-33` renders `AdminSidebar` and every page inside `AuthGuard`, whose `useState(false)` + effect gate keeps the protected subtree out of the server HTML entirely. `apps/web/src/app/merchant/layout.tsx` and `AuthProvider.tsx:11-27` implement the same safe shape for the Buyer app.
- Consequence: **no live hydration defect and no leak** — verified by 12 of the new tests (§7) — but the safety rests on a one-line convention.

The brief said "Do not perform a broad refactor without first reviewing the implementation design" and "Implement only if a safe, state-driven solution can be introduced without changing the security model. Otherwise, deliver a separate implementation proposal for approval." A state-driven permission type is reachable, but in this codebase it lands on **59 `hasAccess` call sites across 46 production files**, three of which feed it into a **data-fetch gate** (`useAdminResource(url, ready && hasAccess)`, e.g. `ManagementPage.tsx:63`, `EntityActions.tsx:43-44`), and it changes the first frame a denied user sees. That is a security-adjacent behavioural change, so **no production code was changed for Phase 1C** and a proposal was delivered instead: `docs/reports/REACT-HYDRATION-PHASE-1C-RENDER-PHASE-AUTH-PROPOSAL.md` (4 steps, explicit acceptance criteria, recommendation to approve the safety rails only). No permission check was relaxed to make a test pass.

### 4.4 Phase 1D — component-level inline styles

`AdminSidebar.tsx` and `merchant/orders/page.tsx` each carried a `<style>` text child whose content contains characters React escapes — the sidebar's `[data-active="true"]` selectors and `content: ''`, the orders block's `.mo-filterbar > *` combinator. Both were moved to co-located stylesheets imported by the owning component (`AdminSidebar.css`, `orders.css`), declarations preserved verbatim, and each move is pinned by a test that asserts every declaration still exists. Layout appearance, responsive breakpoints (1080 px sidebar, 768 px orders) and behaviour are unchanged.

Scope was set by measurement, not guesswork: after the remediation the two apps still contain **15** inline `<style>` text-child blocks, and exactly **one** is flagged by static scanning (`apps/web/src/components/Navbar.tsx:110`) — and that one is a **false positive** already cleared against live served HTML in the read-only investigation (finding B5): its apostrophes are inside a JS conditional `` ${menuOpen ? 'display: flex !important;' : ''} `` and contribute no quote character to the emitted CSS text. The remaining blocks contain no escapable character in their emitted output, which is why the in-repo counter-example `packages/ui-kit/src/components/Skeleton.tsx:10` hydrates cleanly. That statement rests on a source scan plus the built-output scan in §4.1 (0 escaped application style blocks across 74 prerendered pages); it is not backed by an individual test per block — see limitation 9.

---

## 5. Test results (actual output)

### 5.1 RED — the new tests failing before the fixes

`…/scs-hydration-findings/phase1-red-admin.txt` (5 files):

```
 FAIL  src/__tests__/global-styles.test.tsx > Admin global stylesheet > carries every declaration from the root-layout reset it replaced
 FAIL  src/__tests__/global-styles.test.tsx > Admin global stylesheet > does not inline the global reset into the served document
 FAIL  src/__tests__/hydration-admin-clock.test.tsx > … > hydrates the dashboard document root after 61 seconds of elapsed wall time
 FAIL  src/__tests__/hydration-admin-clock.test.tsx > … > hydrates the dashboard document root when the browser timezone differs from the server
 FAIL  src/__tests__/hydration-admin-clock.test.tsx > … > shows the mounted browser date and time on the dashboard
 FAIL  src/__tests__/hydration-admin-session.test.tsx > … > hydrates the signed-in Admin document root without a recoverable error
 FAIL  src/__tests__/hydration-admin-session.test.tsx > … > renders only the navigation links the administrator's permissions allow
 FAIL  src/__tests__/hydration-document-root.test.tsx > … > hydrates the complete Admin document root without a recoverable error
 FAIL  src/__tests__/hydration-document-root.test.tsx > … > serves application-authored style text without character-reference artifacts
 FAIL  src/__tests__/sidebar-styles.test.tsx > … > serves the sidebar style rules without character-reference artifacts
 FAIL  src/__tests__/sidebar-styles.test.tsx > … > keeps every sidebar declaration in a stylesheet under src/
 Test Files  5 failed (5)
      Tests  11 failed | 1 passed (12)
```

and the failure reason was the defect itself, not a broken test — served CSS containing `&#x27;` plus the two canonical React messages:

```
Received: "…body{margin:0;font-family:var(--font-inter),&#x27;segoeui&#x27;,system-ui,…"
+   "Text content does not match server-rendered HTML.",
+   "Hydration failed because the initial UI does not match what was rendered on the server.",
```

`…/phase1-red-web.txt` (3 files):

```
 FAIL  src/__tests__/global-styles.test.tsx > Buyer global stylesheet > carries every declaration from the root-layout reset it replaced
 FAIL  src/__tests__/global-styles.test.tsx > Buyer global stylesheet > does not inline the global reset into the served document
 FAIL  src/__tests__/hydration-document-root.test.tsx > Buyer document-root hydration > hydrates the complete Buyer document root without a recoverable error
 FAIL  src/__tests__/hydration-document-root.test.tsx > Buyer document-root hydration > serves application-authored style text without character-reference artifacts
 FAIL  src/__tests__/hydration-document-root.test.tsx > Buyer document-root hydration > hydrates the home page document root when the browser timezone differs from the server
 FAIL  src/__tests__/hydration-merchant-orders.test.tsx > … (3 tests)
 Test Files  3 failed (3)
      Tests  8 failed (8)
```

**Honest TDD disclosure.** 4 of the 11 new test files were written *after* the corresponding fix and passed on first run, because they lock behaviour that was already correct rather than repairing an observed defect: the 5 Buyer gate tests (`hydration-buyer-session`, `hydration-buyer-signed-out`) and the 2 Admin permission-gate tests (`hydration-admin-perms`). They are regression locks on Phase 1C's security invariants, not red→green proofs. Every test that targets a Phase 1A/1B/1D defect is in the RED list above and was watched to fail for the expected reason.

### 5.2 GREEN — the same commands after the fixes

Buyer/merchant app, full suite, exactly the CI command (`phase1-ci-web-step.txt`):

```
> vitest run
 ✓ src/__tests__/hydration-document-root.test.tsx (3 tests) 980ms
 ✓ src/__tests__/global-styles.test.tsx (2 tests) 363ms
 ✓ src/__tests__/hydration-merchant-orders.test.tsx (3 tests) 923ms
 ✓ src/__tests__/hydration-buyer-session.test.tsx (3 tests)
 ✓ src/__tests__/hydration-buyer-signed-out.test.tsx (2 tests)
 …
 Test Files  16 passed (16)
      Tests  125 passed (125)
   Duration  28.30s
WEB_STEP_EXIT=0
```

Admin app, the six Phase 1 files, exactly the CI command:

```
 ✓ src/__tests__/hydration-admin-perms.test.tsx (2 tests) 151ms
 ✓ src/__tests__/global-styles.test.tsx (2 tests) 285ms
 ✓ src/__tests__/hydration-document-root.test.tsx (3 tests) 301ms
 ✓ src/__tests__/sidebar-styles.test.tsx (2 tests) 644ms
 ✓ src/__tests__/hydration-admin-session.test.tsx (4 tests) 1159ms
 ✓ src/__tests__/hydration-admin-clock.test.tsx (3 tests) 1536ms
 Test Files  6 passed (6)
      Tests  16 passed (16)
   Duration  9.35s
```

Admin app, **whole** package (`pnpm exec vitest run`, `phase1-admin-full.txt`):

```
 Test Files  1 failed | 12 passed (13)
      Tests  2 failed | 86 passed (88)
 FAIL  src/__tests__/management.test.tsx > … reuses details in full-page and dialog modes
 FAIL  src/__tests__/management.test.tsx > … uses displayed IDs for shortcuts, suspends in dialogs, and clears paging selection
ADMIN_FULL_EXIT=1
```

Those 2 failures are **pre-existing and unrelated to hydration**, proven rather than asserted: `management.test.tsx` was run in the untouched main checkout (`C:/TAIF/scs-platform`), where the same 2 tests fail identically, and the file's 6-file import graph is md5-identical between the two checkouts. They assert on the shared management components, which Phase 1 does not touch. The new CI job therefore position-filters the admin run to the Phase 1 files and documents that gap in-place (§5.3). No test was deleted, skipped, or weakened.

Typecheck and lint:

```
$ pnpm typecheck                    # root, turbo, all packages
 Tasks:    9 successful, 9 total       ROOT_TYPECHECK_EXIT=0
$ pnpm --filter @scs/web typecheck  → tsc --noEmit, clean
$ pnpm --filter @scs/admin typecheck → tsc --noEmit, clean
$ apps/web: next lint → 0 errors, 2 pre-existing warnings
   ./src/app/merchant/returns/[id]/page.tsx:44:42  react-hooks/exhaustive-deps
   ./src/hooks/useProductStudio.ts:262:6           react-hooks/exhaustive-deps
$ apps/admin: next lint → "✔ No ESLint warnings or errors"     ADMIN_LINT_EXIT=0
```

### 5.3 CI wiring (Phase 1E: "ensure they run in CI")

`.github/workflows/ci.yml` gained one job, `test-web-admin` ("Web & Admin App Tests"), `needs: lint`, running:

```
pnpm install --frozen-lockfile
pnpm contracts:build                 # both apps import @scs/contracts' built dist
pnpm --filter @scs/web test          # whole buyer/merchant suite
pnpm --filter @scs/admin test -- <the six Phase 1 files>
```

Both commands above were executed locally *verbatim* and are the outputs quoted in §5.2, so the CI job's steps are not speculative. Before this change the pipeline had **no** test gate for either Next app (`test-unit` and `test-integration` both target `@scs/api`; the root `pnpm test` was never invoked), which is exactly how the defect survived to `main`. The job file parses (`js-yaml`), the job list is `lint | boundary-lint | test-unit | test-web-admin | test-integration | migration-gate | test-contract | build | k6-smoke | mobile | container-build | trigger-staging-release`, and no existing job's `needs`, `if`, env or steps were modified.

---

## 6. Build results for both applications

| App | Command | Result |
| --- | --- | --- |
| Buyer/merchant (`@scs/web`) | `pnpm exec next build` | `✓ Compiled successfully`, 42/42 static pages generated, `WEB_BUILD_EXIT=0`, First Load JS shared by all **87.3 kB** |
| Admin (`@scs/admin`) | `pnpm exec next build` (clean `.next`) | `✓ Compiled successfully`, 37/37 static pages generated, `ADMIN_BUILD_EXIT=0`, First Load JS shared by all **87.3 kB** |

Full logs: `…/scs-hydration-findings/phase1-build-web.txt` and `…/phase1-build-admin-clean.txt`. The admin build emits two **pre-existing** autoprefixer warnings on `src/components/management.module.css` (lines 7:44 and 32:32, "mixed support, consider using flex-end/flex-start") in a file Phase 1 does not touch, plus a webpack pack-cache serialization notice for the same file; both are warnings, not errors, and both predate this work.

One honest limitation: shared-chunk sizes are quoted from the post-fix builds only — a before/after bundle comparison would need a baseline build of `09f6d7d5` as well, which was not performed. What was measured instead, from the baseline blobs and the new stylesheets, is in §10 item 5: 2,807 bytes of CSS moved out of the JS text children (carrying 11 escaped characters, 53 bytes of escaping overhead) into 2,762 bytes of declarations in four linked stylesheets.

---

## 7. Security regression results — authentication and permissions

Twelve of the 29 new tests exercise the **real** `AuthGuard`, the **real** `useRequirePerms`/`AccessDenied`, the **real** `merchant/layout.tsx` gate and the **real** `AdminSidebar` permission filter, against prerendered HTML — not stubs.

| Invariant required by the brief | Test that proves it | Result |
| --- | --- | --- |
| Never render protected content while authentication is unknown | `hydration-admin-document-root > keeps protected dashboard content out of the document while authentication is unknown`; `hydration-admin-perms > never puts permission-protected content in the served document`; `hydration-buyer-session > serves no protected merchant markup before the gate has been checked` | pass |
| Signed-out users remain denied protected content | `hydration-buyer-signed-out > never puts protected merchant content in the served document` and `> keeps the screen out of the DOM and sends the visitor to sign in` (asserts `router.replace('/auth/login')`) | pass |
| Authenticated users receive exactly their permissions (sidebar) | `hydration-admin-session > renders only the navigation links the administrator's permissions allow` — `/users` and `/account` present, `/brands` and `/catalog-import` absent for a `perms: ['admin:users:read']` session | pass |
| Authenticated users receive exactly their permissions (page-level) | `hydration-admin-session > grants the screen when the administrator holds every required permission` / `> denies the screen and names the missing permission otherwise`; `hydration-admin-perms > denies the screen after mount and sends the visitor to sign in` | pass |
| Client-side access restriction survives the CSS/clock remediation | `hydration-admin-session > hydrates the signed-in Admin document root without a recoverable error` (asserts `#main-content` exists **and** `router.push` was **not** called) | pass |
| Role restriction on the Buyer side | `hydration-buyer-session > renders the protected merchant screen for a merchant role and never redirects` / `> keeps the protected merchant screen away from a signed-in non-merchant` (RETAILER → `router.replace('/search')`) | pass |
| Server-side restriction unchanged | API/`middleware` auth surface was not in the change set; the served-HTML assertions above are the client-side half of the same guarantee | pass (no change to audit) |

Token storage, refresh, device trust, OTP and session handling were not modified at all: `git diff` lists neither `apps/*/src/lib/auth.ts`, nor `AuthGuard.tsx`, nor `merchant/layout.tsx`, nor `AuthProvider.tsx`. Permission checks and the `perms` arrays in `AdminSidebar.tsx:20-50` are untouched.

---

## 8. Documentation updates

`docs/playbooks/hydration-safe-markup-patterns.md` (new) is the durable developer-facing doc and covers all five items the brief asked for: the root cause explained once and completely (§1 there), the correct implementation patterns — stylesheet-not-text-child (§2), effect-initialized time/locale values (§3), gate-keeps-protected-content-out (§4) — plus the two banned "fixes" and why each fails; how the regression tests work and how to add one (§5); a pre-merge checklist (§6); and step-by-step deployment verification instructions (§7), including the artifact check (`view-source` for `&#x27;`), the console check for #425/#418/#423, the 60-second Admin reload check, the UTC-server/Riyadh-browser split check, and the authorization check against view-source rather than the screen.

`docs/reports/REACT-HYDRATION-PHASE-1C-RENDER-PHASE-AUTH-PROPOSAL.md` (new) is the separate Phase 1C deliverable: what was audited, why the current design is masked rather than defective, why no code changed, and a 4-step plan with acceptance criteria and a recommendation.

This report is the third.

---

## 9. Acceptance criteria — the seven mandated regression checks

| # | Required check | How it is covered | Status |
| --- | --- | --- | --- |
| 1 | Both complete document roots hydrate without a recoverable error | `hydration-document-root.test.tsx` ×2 + `hydration-admin-session`, `hydration-merchant-orders`, `hydration-buyer-session` — all through the document-root harness that hydrates `document`, never a `<div>` | **pass** |
| 2 | No escaped character references in application-authored `<style>` | `serves application-authored style text without character-reference artifacts` ×2, `serves the sidebar style rules…`, `serves the orders filter-bar CSS…`, `does not inline the global reset…` ×2 — asserted on prerendered HTML; independently confirmed against 74 built pages (0 blocks) | **pass** |
| 3 | Admin dashboard hydration-safe after elapsed time | `hydration-admin-clock > hydrates the dashboard document root after 61 seconds of elapsed wall time` (fake-timers `beforePrerender`/`beforeHydrate` gap) | **pass** |
| 4 | Signed-out users remain denied protected content | 3 dedicated tests (§7) | **pass** |
| 5 | Authenticated users receive the correct permissions | 5 dedicated tests (§7) | **pass** |
| 6 | Timezone/locale differences do not cause hydration failures | `hydrates … when the browser timezone differs from the server` ×2 (admin + buyer) with `process.env['TZ']` split between the two passes | **pass** |
| 7 | Existing unit / integration / lint / typecheck / build checks remain green | web 16/16 files, 125/125 tests; admin 86/88 with 2 pre-existing failures proven at baseline (§5.2); root typecheck 9/9; lint clean apart from 2 pre-existing web warnings; both `next build`s exit 0. API: see §10 items 2-3 | **pass, with the disclosed pre-existing failures** |

Completion criteria from the brief, restated: both applications pass document-root hydration tests ✅; the Admin clock test passes after elapsed time ✅; existing authorization behavior remains intact ✅. **Nothing was skipped or simulated** — the only simulation in the suite is the intentional clock advance via fake timers, which is the thing being tested.

---

## 10. Remaining issues and limitations

1. **Two pre-existing `@scs/admin` test failures** (`management.test.tsx`: "reuses details in full-page and dialog modes", "uses displayed IDs for shortcuts, suspends in dialogs, and clears paging selection"). Proven pre-existing (§5.2). They keep the admin package from being wired into CI as a whole, which is why `test-web-admin` position-filters it. Fixing them is a separate task; the CI job carries a comment telling the next person to collapse the step to `pnpm --filter @scs/admin test` once they pass.
2. **API suites were run only partially.** `pnpm --filter @scs/api test:unit` → `Tests 1 failed | 2489 passed | 96 skipped (2586)`, `Test Files 2 failed | 124 passed | 1 skipped`. The one failing test (`m723b1-carrier-foundation-hardening > validates correct email format`, "Test timed out in 5000ms") **passes when re-run in isolation** (`56 passed`) — it timed out because my own two jobs were running concurrently. The other entry is a file-level `SyntaxError: Invalid or unexpected token` raised while `manual-sha-validation.spec.ts` dynamically imports its script under test (that file's 19 tests are reported *skipped*, not failed); the identical spec **passes in the untouched checkout**, and `git diff 09f6d7d5..adbe390 -- apps/api packages` is empty, so the difference is worktree-local environment (that checkout has `.env`, `.env.local`, `.env.development`; this one has only `.env.example`), not source. Neither is attributable to Phase 1 — no API file is in the change set — but I am recording them instead of claiming a clean API run.
3. **`pnpm --filter @scs/api test:coverage` (the actual CI `test-unit` gate, with its per-module thresholds and testcontainers integration specs) was not executed** — it needs Docker provisioned Postgres/Redis and a long run. It is unaffected by this change set for the same reason as item 2. Same for `test-integration`, `migration-gate`, `test-contract`, `mobile`, `container-build` and every `release.yml` job: none consume a file Phase 1 changed.
4. **Phase 1C is unresolved by design.** The render-phase permission read is still there, masked by the gates. The proposal in §4.3/§8 needs a decision: approve the state-driven hook + the CI gate that makes the convention mechanical, or accept the convention as-is.
5. **No before/after bundle-size A/B build** was performed (§6): the numbers quoted are post-fix only. What *was* measured directly from the baseline blobs and the new stylesheets: the four remediated blocks carried **2,807 bytes** of CSS as JS text children and **11 escapable characters** (`'` × 6 in the two font stacks, `"` × 4 in `[data-active="true"]`, `>` × 1 in `.mo-filterbar > *`), which React inflated to **53 extra bytes** of character references in every served document; the four new stylesheets hold **2,762 bytes** of declarations (comments excluded). So the payload shift between the JS chunk and the linked stylesheet is ≈45 bytes, and the escaping overhead is gone — but a true `First Load JS` delta would need a baseline build of `09f6d7d5` for comparison, which was not run.
6. **Visual regression was verified by construction, not by pixel diffing.** Every moved declaration is asserted to still exist in its stylesheet (`carries every declaration from the root-layout reset it replaced`, `keeps every sidebar declaration in a stylesheet under src/`, `keeps every orders-screen declaration…`), in the order and with the selectors it had. No Playwright/Chromium screenshot diff was run against a baseline, so a cascade-order side effect of moving CSS from a mid-document `<style>` to a `<link>` would not be caught by these tests. The mechanism is low-risk here (the reset had no later rule depending on being overridden by source order; the sidebar/orders blocks were the only rules for their selectors in those trees), but the guarantee is analytic rather than pixel-based.
7. **Runtime verification against a deployed environment was not possible** — deployment is prohibited by the brief, so the served-HTML evidence comes from `renderToStaticMarkup` in the harness and from the prerendered `.next/server/app/*.html` output of a production build. The step-by-step instructions for what to check when a build does ship are in the playbook §7.
8. **Repo-wide `prettier --check` still fails (35 files, including files Phase 1 never touched)** — pre-existing formatting debt plus CRLF/`core.autocrlf` with `endOfLine = "lf"` and no `.gitattributes`; the CI step stays `continue-on-error` as documented in `ci.yml:100-110`. Measured, not assumed: `prettier --check` on four files Phase 1 does not touch (`AuthGuard.tsx`, `useRequirePerms.tsx`, `Navbar.tsx`, `ManagementPage.tsx`) warns on all four, and `git ls-files --eol` reports `i/lf  w/crlf` for the touched layouts — the index is LF while this Windows working tree is CRLF, so a Linux CI checkout sees LF and the complaint is a local working-tree artifact. New files follow their neighbours' conventions; no pre-existing file was reformatted.
9. **15 inline `<style>` text-child blocks remain** in the two apps. Analysis says none emits an escapable character (§4.4), and the built-output scan found zero escaped application style blocks across 74 prerendered pages — but each of those 15 is not individually pinned by its own test, so a future edit that introduces an apostrophe into one of them would only be caught if it lands on a route the document-root tests cover. A follow-up (Phase 2) should either convert them or add a lint rule banning `<style>{` with a literal template.

---

## 11. Confirmation: no deployment or provider configuration was changed

Stated explicitly, as required:

- **No deployment of any kind.** No Vercel project, deployment, domain or environment setting was created, read-modified, or invoked. No Render service, environment variable, or deploy trigger was touched. No Supabase resource was touched. No release workflow run was started, and none of `release.yml`, `.github/workflows/*` deploy jobs, or `trigger-staging-release` was modified.
- **No provider or environment configuration changed.** `NEXT_PUBLIC_API_URL`, the API base URL, CSP/headers, `next.config.js` for either app, `turbo.json`, every `.env.example`, all OTP/SMTP/SMS/WhatsApp settings, all database configuration and every migration are byte-for-byte unchanged; the change set in §3 contains no such file.
- **The only CI edit is additive** — one new test job (+58 lines, 0 removed), no deploy step, no credential, no existing job altered.
- **Nothing was committed or pushed.** All work is uncommitted in `C:/TAIF/scs-audit-phase0`, and the main checkout `C:/TAIF/scs-platform` was not written to.

## 12. Suggested next actions (for your decision, not started)

1. Approve or reject the Phase 1C proposal (§4.3): the state-driven permission hook plus the CI convention-gate.
2. Schedule a visual QA pass on the Buyer home page, the Admin dashboard, the Admin sidebar (collapsed + mobile overlay) and `/merchant/orders` under a production build, to close limitation 6.
3. Fix the 2 pre-existing `management.test.tsx` failures, then collapse the admin CI step to `pnpm --filter @scs/admin test`.
4. On your approval, commit these files to a Phase 1 branch and open a PR so `test-web-admin` runs on real GitHub Actions hardware (Linux/UTC) rather than only locally.
