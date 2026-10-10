# SCS P13 — Release Follow-Up Items (tracked separately, NOT in P13 scope)

**Purpose:** Discrete, separately-tracked follow-up items surfaced during P13 closure that must **not** be absorbed into P13 or fixed under it. Neither item blocks a stated P13 acceptance criterion or security boundary. Created from `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13-RELEASE-CLOSURE-READINESS-REPORT.md` §11 (D-1, D-2).

**Boundary rule:** P13 does not expand to fix these. A follow-up is promoted into a milestone only if a new issue is demonstrated to block a stated P13 acceptance criterion or a security boundary — which is **not** the case for either item below.

---

## FU-P13-01 — P11 moderator concurrency / ledger race (observation under load)

- **Priority:** P3 (test-integrity / concurrency assurance).
- **Status:** OPEN — tracked, not owned by P11 or P13 closure.
- **Domain:** Moderation / inventory ledger (P11 surface).
- **Symptom:** During a full-suite single-fork run, `p11-independent-runtime-verification.postgres.spec.ts` logged on stderr a moderator-race observation — `DEFECT: Moderator race produced 2 ledger entries (expected 1)` (an extra ledger row / off-by-one net-quantity under parallel moderation). The spec file still completes with **all tests passing** because its assertion is lenient (it tolerates the extra entry). This did **not** recur as a hard failure and is **not** related to P13 returns/refunds.
- **Why not fixed under P13:** It lives in the P11 moderation/ledger surface, not the P13 returns code path. P13 must not absorb unrelated remediation.
- **Recommended action:** A dedicated P11 review of optimistic-locking / `FOR UPDATE` serialization on the moderator ledger write path under load, plus tightening the spec assertion so a real race can no longer pass silently.
- **Owner role:** Backend lead — Orders/Inventory domain.
- **References:** Readiness report §11 D-1; `apps/api/src/__tests__/integration/p11-independent-runtime-verification.postgres.spec.ts`.

---

## FU-P13-02 — Admin client-side permission-gate parity (outside the P13 returns page)

- **Priority:** P3 (UX consistency; **no security impact**).
- **Status:** OPEN — tracked, not owned by P13.
- **Domain:** Admin console front-end.
- **Symptom:** Only `apps/admin/src/app/returns/page.tsx` received the client-side `AccessDenied` gate during P13. Sibling admin pages (e.g., settlements, payments) rely on the **server** `PermissionsGuard` — which is the actual, verified authorization boundary (403 confirmed for unauthorized callers) — but do not render a client-side Access-Denied surface. Unauthorized users are still blocked server-side; the gap is the missing consistent client-side empty/denied view.
- **Why not fixed under P13:** Server-side enforcement is correct and verified; adding client gates to every admin page is a broad UX-parity task beyond P13's returns scope and would widen P13 without a blocking need.
- **Recommended action:** Apply the `useRequirePerms` → `AccessDenied` pattern uniformly across admin management pages, ideally via a shared layout/HOC, with a per-page snapshot test that an unauthorized user sees Access-Denied.
- **Owner role:** Admin console front-end lead.
- **References:** Readiness report §11 D-2; `apps/admin/src/app/returns/page.tsx`; server boundary `apps/api/src/common/guards/*` (`PermissionsGuard`).
