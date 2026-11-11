# Phase 1C — Render-phase auth reads: audit findings and implementation proposal

**Status: PROPOSAL ONLY. No production change was made for Phase 1C.**
**Baseline:** `09f6d7d5a48f76858d42c355f6c1e498a16e0a34`
**Scope of this document:** `useRequirePerms`, `AuthGuard`, `AdminSidebar`,
`account/page.tsx`, and the Buyer render-phase auth reads.
**Requested by:** Phase 1 instruction — "Implement only if a safe, state-driven
solution can be introduced without changing the security model. Otherwise,
deliver a separate implementation proposal for approval."

The instruction also said: *"Do not perform a broad refactor without first
reviewing the implementation design."* This document is that review. Approval of
it authorises a separate change; nothing here is in force yet.

---

## 1. What was audited, and what it does today

### 1.1 The primitive under review

`apps/admin/src/hooks/useRequirePerms.tsx:13` reads the session **during render**:

```tsx
export function useRequirePerms(requiredPerms: string[]): { hasAccess: boolean; missingPerms: string[] } {
  const user = getUser();                       // ← render-phase localStorage read
  const userPerms = user?.perms ?? [];
  const missingPerms = requiredPerms.filter((p) => !userPerms.includes(p));
  return { hasAccess: missingPerms.length === 0, missingPerms };
}
```

`getUser()` (`apps/admin/src/lib/auth.ts:202`) returns a module-scope variable
that is populated by `restoreSession()` at import time
(`apps/admin/src/lib/auth.ts:162`) — i.e. from `localStorage`, which does not
exist on the server. Server render therefore sees `user === null`
→ `hasAccess === false` for every non-empty permission set. Client render sees
the real permission set. **If that component were ever in the server HTML, the
two passes would disagree and hydration would be discarded at the root** — the
same class of failure Phase 1A fixed, and worse: the server pass would be
emitting the *denied* UI.

Same shape in two more places:

| Site | Read | Effect |
| --- | --- | --- |
| `apps/admin/src/components/AdminSidebar.tsx:56` | `const user = getUser()` | permission-filtered nav list built during render |
| `apps/admin/src/components/AdminSidebar.tsx:176` | `{isAuthenticated() && (…)}` | account/logout block |
| `apps/admin/src/app/account/page.tsx:32` | `const user = getUser()` | identity/session rows |
| `apps/web/src/app/merchant/**` + `apps/web/src/components/Navbar.tsx` | `getUser()` / `isAuthenticated()` / `hasMerchantAccess()` during render | role-dependent chrome |

### 1.2 Why it is not a live defect today — the gates

`apps/admin/src/app/layout.tsx:26-33` puts **both** the sidebar and every page
inside `AuthGuard`:

```tsx
<AuthGuard>
  <AdminSidebar />
  <div id="main-content" className="admin-content">{children}</div>
</AuthGuard>
```

`AuthGuard` (`apps/admin/src/components/AuthGuard.tsx:14-35`) is the correct
effect-initialized pattern: `useState(false)` → identical markup on server and
first client render → `if (!checked) return <div>Checking authentication…</div>`
→ protected children are **absent from the server HTML entirely**.

`apps/web/src/app/merchant/layout.tsx` does the same for the merchant area
(`checked` gate + `OPEN_PATHS` / `MERCHANT_NAV` role logic), and
`apps/web/src/components/AuthProvider.tsx:11-27` already models auth as
`{ user: null, loading: true }` upgraded in an effect — the state-driven shape
this proposal would extend to the permission layer.

**Conclusion of the audit:** the render-phase reads are *masked*, not *fixed*.
Every Buyer and Admin document-root hydration test passes because the gate
removes the subtree from the server pass, not because the permission logic is
hydration-safe. Evidence that the masking is real and load-bearing:

- `apps/admin/src/__tests__/hydration-admin-perms.test.tsx` (new, 2 tests) —
  with no session, the served HTML contains no `AccessDenied` banner and no
  protected screen, and the router is pushed to `/auth/login`. Clean hydration.
- `apps/admin/src/__tests__/hydration-admin-session.test.tsx` (new, 4 tests) —
  with a seeded session, the gated tree appears **only after** hydration, and
  the sidebar contains exactly the permitted links (`/users`, `/account` in;
  `/brands`, `/catalog-import` out).
- `apps/web/src/__tests__/hydration-buyer-session.test.tsx` (3) and
  `hydration-buyer-signed-out.test.tsx` (2) — same for merchant/retailer roles,
  including the redirect assertions.

So the security model is currently correct: nothing privileged renders while
auth is unknown, and no protected markup reaches the network.

---

## 2. Why no code change was made in Phase 1

A state-driven permission hook is achievable, but in this codebase it is not a
localized edit, and two of its three consequences are user-visible behaviour
changes that Phase 1 explicitly forbade without approval ("Preserve all existing
application behavior", "Do not weaken role or permission enforcement"):

1. **Blast radius: 59 call sites across 46 production files.** `hasAccess` is
   consumed as a synchronous boolean in three distinct shapes — early `return
   <AccessDenied/>` (e.g. `ManagementPage.tsx:102`), early `return null` (e.g.
   `EntityActions.tsx:30`), and **a data-fetch gate**
   (`useAdminResource(url, ready && hasAccess)`, e.g. `ManagementPage.tsx:63`,
   `EntityActions.tsx:43-44`). A three-state return type
   (`'unknown' | 'granted' | 'denied'`) must be reasoned about at every one of
   those 59 sites, or a request that used to be withheld will fire while the
   session is still being restored — which would be a *new* information leak
   (an unauthenticated `GET /admin/...` is at best a 401, at worst a response
   rendered into the wrong account's screen).
2. **It changes what a denied user sees first.** Today, inside the gate, a
   missing permission renders `AccessDenied` on its first client frame. With an
   `unknown` state, that frame becomes a loading frame. Defensible — arguably
   better — but a real UX delta that needs a decision, not a side effect.
3. **It has no hydration failure to fix yet.** Because the gate holds, the
   three-state change buys robustness against a *future* regression (someone
   moving a gated component out from under `AuthGuard`, or switching to a
   server component that passes the session down as a prop), not a present
   defect. Phase 1's mandate was the confirmed defects. Spending the change
   budget on it here, silently, is the wrong trade.

`suppressHydrationWarning` was not used, `dangerouslySetInnerHTML` was not used,
and no permission check was relaxed to make the tests pass. The tests pass
because the existing gates are genuinely correct.

---

## 3. Proposed implementation (for approval)

**Goal:** make permission rendering state-driven and hydration-safe *without*
changing the security model, and without a 46-file sweep in one step.

### Step 1 — Add the state, keep the boolean (no call-site churn)

Extend the hook with a non-breaking surface:

```tsx
export type PermState = 'unknown' | 'granted' | 'denied';

export function usePermissionState(requiredPerms: string[]): {
  state: PermState;
  hasAccess: boolean;      // identical semantics to today, once known
  missingPerms: string[];
} {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    setUser(getUser());
    setSettled(true);
  }, []);

  if (!settled) return { state: 'unknown', hasAccess: false, missingPerms: requiredPerms };
  const missingPerms = requiredPerms.filter((p) => !(user?.perms ?? []).includes(p));
  return { state: missingPerms.length ? 'denied' : 'granted',
           hasAccess: missingPerms.length === 0, missingPerms };
}
```

**One gap this step has to close first:** the Admin app has no auth-change
listener. `apps/web` exposes `onAuthChange` (`apps/web/src/lib/auth.ts:181`) and
its `AuthProvider` subscribes to it; `apps/admin/src/lib/auth.ts` exposes no
equivalent, so a state copy of `getUser()` would go stale inside a mounted
screen when the session changes without navigation (the case
`logout()`-from-sidebar handles today by re-reading on the next render). Step 1
therefore also adds a read-only subscription to Admin's auth module, mirroring
web's — an added notification path over the same in-memory value, with no change
to token storage, refresh, device trust, OTP, or session lifecycle. If that
addition is not acceptable, Step 1 must instead re-read in an effect keyed on
`usePathname()`, which is what today's render-phase read effectively does.

`useRequirePerms` is then re-expressed in terms of it, returning
`hasAccess: state === 'granted'` while `state === 'unknown'` — so **every
existing call site keeps its current behaviour with zero edits**: unknown is
reported as "no access", which is what the server pass reports today, and it can
never render privileged content while auth is unknown. Only the fetch-gate sites
matter, and they already gate on `ready && hasAccess` — `hasAccess === false`
during `unknown` means no new request fires. This is the property that keeps the
change security-preserving by construction, and it must be pinned by a test
before any other step.

### Step 2 — Convert only the three structural consumers

`ManagementPage.tsx`, `EntityActions.tsx`, `ProductDetails.tsx` render the
denied UI or short-circuit the tree. Give each an explicit `unknown` branch that
renders the same skeleton/spinner the surrounding gate already uses, so no
`AccessDenied` flash is introduced. This is the only user-visible change in the
whole plan, it is contained to three components, and it needs a design sign-off.

### Step 3 — Make the gate the contract, mechanically

Today "everything protected lives under `AuthGuard`" is a convention enforced by
one line in `layout.tsx`. Add:

- a document-root test that fails if any admin route renders protected markup
  in the served HTML while signed out (extend
  `hydration-admin-perms.test.tsx` to a route sweep over the existing page
  list), and
- a lint/CI check that rejects `getUser()` / `isAuthenticated()` inside a
  component that is not under the gate, or
- better: pass the session down from `AuthGuard` through context so a render
  phase read of `localStorage` becomes impossible by construction. That is the
  end state; Steps 1-2 make it reachable without a big-bang rewrite.

### Step 4 — Only then retire the render-phase reads

Replace `const user = getUser()` in `AdminSidebar.tsx:56` and
`account/page.tsx:32` with the context/state value, and re-run the Buyer/Admin
document-root suites plus the timezone-split tests.

### Acceptance criteria

| # | Check | Command |
| --- | --- | --- |
| 1 | No privileged markup in served HTML while signed out (all admin routes) | new route-sweep test |
| 2 | No `admin/*` request issued while `state === 'unknown'` | spy `fetch` in a new test |
| 3 | Granted/denied link sets and `AccessDenied` content unchanged | existing `hydration-admin-session.test.tsx`, `management.test.tsx` |
| 4 | Both apps hydrate clean at the document root, UTC server vs Riyadh client | existing clock + document-root suites with `TZ` set |
| 5 | Token storage, refresh, device trust, OTP, session handling untouched | `git diff` review — no changes under the auth token paths |

### Estimate and risk

Step 1 is small and mechanical; Step 2 is the design decision; Step 3's context
variant is the part that actually removes the hazard class. Total is a modest
PR, but it is a *security-adjacent* PR touching the permission layer, so it
should land on its own review, with the CI test from Step 3 blocking regressions
before any later refactor can unmask the old defect.

**Recommendation:** approve Step 1 + Step 3 (the safety rails) as a follow-up to
Phase 1; take Step 2 separately once the "first frame for a denied user"
question is answered by design.

---

## 4. What was explicitly not changed

No permission check, threshold, or filter was modified. `AuthGuard`,
`merchant/layout.tsx`, `AuthProvider`, `lib/auth.ts` (token storage, refresh,
device trust, OTP, session lifecycle) are byte-for-byte unchanged in this work —
`git diff` for Phase 1 lists them nowhere. The Phase 1 change set is confined to
the CSS extraction (1A), the dashboard clock (1B), two component stylesheets
(1D), tests, the CI job, and documentation.
