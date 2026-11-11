# Hydration-safe markup patterns (Buyer + Admin)

**Audience:** anyone editing `apps/web` or `apps/admin` — root layouts, page
headers, sidebars, auth-gated screens, or anything that renders CSS or a clock.
**Applies to:** Next 14.2.35 App Router, React 18.3.1, both `@scs/web` (buyer +
merchant) and `@scs/admin`.
**Introduced by:** Phase 1 hydration remediation. Companion evidence lives in
`docs/reports/REACT-HYDRATION-PHASE-1-IMPLEMENTATION-REPORT.md`.

---

## 1. Why these rules exist (root cause, once)

React renders a text child through `escapeTextForBrowser`, so `' " < > &` become
`&#x27; &quot; &lt; &gt; &amp;` in the HTML string it sends. A real HTML parser
then rebuilds the DOM. For **ordinary text** the parser decodes those references
back to the original characters, so server bytes and DOM text agree and hydration
matches.

`<style>` is a **raw-text element**: the parser does *not* decode character
references inside it. So an inline stylesheet written as a React text child
ships `&#x27;` and the DOM text node keeps the literal seven characters
`&#x27;`, while the client's own render produces a plain `'`. The two trees
disagree at that text node → React 18 reports error **#425** (text content
mismatch), then **#418** (hydration error bubbled to the root), then **#423**
(root could not hydrate) and throws the tree away, re-rendering the **entire
document client-side**. That is why one apostrophe in a root layout is not a
cosmetic problem: it costs a full client re-render of every page in the app,
kills the SEO/accessibility value of the server pass, and can blank the
`aria-hidden`/focus state that the CSS was there to provide.

Two consequences that decide the rules below:

1. The mismatch is at the **document root**, because the App Router hydrates
   `document` itself (`next/dist/client/app-index.js`: `const appElement =
   document;` → `hydrateRoot(appElement, …)`). A test that mounts a page inside
   a `<div>` cannot reproduce it.
2. Whether a given `<style>` block is defective depends on the **characters in
   the emitted text**, not on the block existing. A keyframes string with no
   quotes (e.g. `packages/ui-kit/src/components/Skeleton.tsx:10`) is harmless.
   A layout reset containing `'Segoe UI'` is not.

---

## 2. Rule 1 — Global CSS is a stylesheet, never a React text child

**Do this.** Put the CSS in a `.css` file and import it for its side effect.

```tsx
// apps/web/src/app/layout.tsx
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={inter.variable}>
      <body style={{ margin: 0, background: '#f2f5f6' }}>
        …
```

Next's App Router hoists imported side-effect CSS into `<head>` as a real
`<link>` (or an inlined `<style>` emitted by the bundler, *not* by React's text
renderer), so nothing passes through `escapeTextForBrowser`.

**Don't do this.**

```tsx
<head>
  <style>{`body { font-family: var(--font-inter), 'Segoe UI'; }`}</style>
</head>
```

**Don't reach for these two "fixes"** — both are banned in this repo for this
class of defect:

- `dangerouslySetInnerHTML={{ __html: css }}` skips escaping, so the mismatch
  disappears. It also removes React's protection from an XSS-shaped habit and
  keeps the anti-pattern in the tree. Use a stylesheet.
- `suppressHydrationWarning` **does not suppress this at all.** It applies to
  the attributes/text of the element it is placed on, not to descendants. The
  Buyer root layout has carried it on `<html>` for a long time and the defect
  still fired at full volume. Treat it as a tool for genuinely unavoidable
  client-only attributes (browser extensions, `theme` flags), never as a mute
  button for a real mismatch.

Component-scoped rules belong in a co-located stylesheet, as
`apps/admin/src/components/AdminSidebar.css` and
`apps/web/src/app/merchant/orders/orders.css` now do. Both files are imported by
the component that owns them and their contents are asserted verbatim by
`src/__tests__/sidebar-styles.test.tsx` and
`src/__tests__/hydration-merchant-orders.test.tsx`, so moving CSS out of JS must
not silently drop a declaration.

> TypeScript note: a side-effect import of a plain global stylesheet has no
> exports to type. `next/types/global.d.ts` covers `*.module.css` only, so each
> app declares `declare module '*.css';` in `src/types/styles.d.ts`.

---

## 3. Rule 2 — Anything time- or locale-dependent is effect-initialized

A value read during render is computed **twice** — once on the server, once on
the client — and any difference between the two passes is a text mismatch. Clocks
and `toLocale*String` formatting are the classic offenders: a server in UTC and
a browser in `Asia/Riyadh` disagree by three hours, and even when the timezone
matches the wall clock moves between the two renders.

```tsx
// apps/admin/src/app/page.tsx — correct
const [now, setNow] = useState<Date | null>(null);

useEffect(() => {
  setNow(new Date());
}, []);

// server + first client render both emit nothing; the clock appears after mount
<PageHeader
  title="Dashboard"
  trailing={now ? (<div>{now.toLocaleDateString(…)}{now.toLocaleTimeString(…)}</div>) : undefined}
/>
```

```tsx
// wrong
const now = new Date();          // render-phase read → mismatched text
```

The state starts as `null`/`undefined` — **not** as a placeholder string — so the
server HTML and the first client render are byte-identical. `apps/web`'s home
page already used this pattern; `apps/admin`'s dashboard now matches it.

Same rule covers `Math.random()`, `Date.now()`, `window.innerWidth` at render
time, and `Intl` formatting of unsorted locale data. `AdminSidebar`'s responsive
breakpoint is the model for the window case: `isMobile` starts `false` and the
real value is applied in an effect
(`apps/admin/src/components/AdminSidebar.tsx:59-71`).

Data-driven timestamps are a different case and are fine: rendering
`new Date(req.createdAt)` inside a table that only exists after a client `fetch`
never had a server counterpart to disagree with.

---

## 4. Rule 3 — Protected content stays out of the tree while auth is unknown

`AuthGuard` (`apps/admin/src/components/AuthGuard.tsx`) and the merchant gate
(`apps/web/src/app/merchant/layout.tsx`) are the pattern to copy:

```tsx
const [checked, setChecked] = useState(false);        // unknown = false
useEffect(() => { … setChecked(true) … }, []);
if (!checked) return <div>Checking authentication…</div>;
return <>{children}</>;
```

Three properties make it both hydration-safe and safe-in-principle:

- `useState(false)` is the same on the server and the first client render, so the
  gate emits identical markup on both passes — no hydration surface at all.
- Protected children are not in the server HTML, so a token-less response body
  cannot leak privileged markup to a proxy, an extension, or view-source.
- The redirect happens in the effect, once real session state is known.

A render-phase auth read (`const user = getUser()` at
`apps/admin/src/components/AdminSidebar.tsx:56`, or
`useRequirePerms`'s `getUser()` at
`apps/admin/src/hooks/useRequirePerms.tsx:13`) is *not* a hydration defect while
it sits inside one of these gates, because the gate keeps the subtree out of the
server pass entirely. It becomes a defect the moment someone moves such a
component outside a gate, or converts the gate to a synchronous read. Do not
"optimise" a gate into reading auth during render — see
`docs/reports/REACT-HYDRATION-PHASE-1C-RENDER-PHASE-AUTH-PROPOSAL.md` for the
scoped, security-preserving way to change this if it is ever needed.

---

## 5. How the regression tests work

`src/__tests__/document-root-harness.tsx` (identical copy in each app) is the
thing that makes these rules enforceable. It:

1. renders the **real** root layout — `<html>/<head>/<body>` and all — with
   `renderToString` from `react-dom/server`, i.e. through React's own text
   escaping rather than a hand-written string;
2. parses that HTML with `DOMParser`, which reproduces the escaping/raw-text
   asymmetry a browser exhibits (`&#x27;` really does survive inside `<style>`);
3. replaces `document.documentElement` with the parsed tree, then calls
   `hydrateRoot(document, element, { onRecoverableError })`;
4. returns `{ prerenderedHtml, recoverableErrors, diagnostics, commitError,
   consoleErrors }`. `expectHydrationClean(run)` asserts the hydration commit
   threw nothing (`commitError`), that `onRecoverableError` was never called,
   and that no hydration diagnostic reached `console.error`; `consoleErrors` is
   kept only to make the failure message diagnosable.

Because the harness hydrates `document`, it catches the class of defect that a
component-level test inside a `<div>` structurally cannot. Two harness details
worth knowing before you "fix" it:

- `ensureDocumentShell()` exists because unmounting a root whose container is
  `document` deletes `<html>` *before* passive cleanups run; a component that
  touches `document.documentElement.style` in its cleanup would otherwise throw
  during teardown only. That throw is a harness artifact, never app behavior —
  which is why the harness captures `commitError` separately instead of
  swallowing failures.
- A localStorage session must be seeded inside `vi.hoisted(…)`, because
  `src/lib/auth.ts` restores the session at module scope
  (`restoreSession()`, line 175) and a write after the imports have run would be
  invisible to it.

Run them:

```bash
pnpm contracts:build                 # both apps import @scs/contracts' dist
pnpm --filter @scs/web test          # whole buyer/merchant suite
pnpm --filter @scs/admin test -- \
  src/__tests__/hydration-document-root.test.tsx \
  src/__tests__/global-styles.test.tsx \
  src/__tests__/sidebar-styles.test.tsx \
  src/__tests__/hydration-admin-clock.test.tsx \
  src/__tests__/hydration-admin-session.test.tsx \
  src/__tests__/hydration-admin-perms.test.tsx
```

CI runs exactly these commands in the `Web & Admin App Tests` job
(`.github/workflows/ci.yml`, job `test-web-admin`). The admin list is explicit
because two pre-existing `management.test.tsx` assertions fail at the Phase 1
baseline; when they are repaired, collapse that step to
`pnpm --filter @scs/admin test`.

### Adding a test for a new page

Wrap it the same way:

```tsx
const run = await hydrateDocumentRoot(
  asDocumentRoot(<RootLayout><MyPage /></RootLayout>),
);
expectHydrationClean(run);
```

and if the page can render a `<style>` text child or a clock, assert on
`run.prerenderedHtml` — that string is the served bytes, so it is where character
references and time-dependent text show up.

---

## 6. Pre-merge checklist for anything touching markup

1. New CSS? Add a `.css` file and import it. Never `<style>{`…`}</style>` with a
   literal that contains `' " < > &`.
2. New date/time/locale/intl/random/window read? `useState` an empty/unknown
   value and set it in `useEffect`.
3. New protected screen? Render it inside the existing gate; do not read a token
   during render.
4. Add or extend a document-root test; it must fail before your production
   change and pass after.
5. `pnpm --filter @scs/web test` (or the admin list above), plus
   `pnpm typecheck` and `pnpm lint`.
6. Grep the served HTML for the artifacts, not the source:
   `curl -s https://<env>/ | grep -c '&#x27;'` must be `0` for a page that has no
   reason to encode text.

---

## 7. Verifying a deployment (no repo change required)

After any build of either app ships to an environment:

1. **Artifact check on the served document.** View-source the home page and the
   admin dashboard. `&#x27;`, `&quot;`, `&lt;`, `&gt;` and `&amp;` must not
   appear inside any `<style>` block belonging to the application. The Buyer
   global reset must now be a real stylesheet rule, not escaped text.
2. **Console check.** Load each entry route with DevTools open on a *production*
   build. `Warning: Text content does not match server-rendered HTML`,
   `Minified React error #425/#418/#423`, and "Did not expect server HTML to
   contain…" must all be absent.
3. **60-second check (Admin).** Open the dashboard, wait over a minute, reload.
   The header must hydrate cleanly with the clock appearing after mount; the
   date line may be blank in view-source and filled in the live DOM — that is the
   effect-initialized pattern working, not a failure.
4. **Timezone-split check.** With the server in UTC (`TZ=UTC`), browse as a
   client in `Asia/Riyadh`. Any mismatch on the dashboard header is a regression
   of Rule 2.
5. **Authorization check.** Signed-out, `/admin` routes must render only the
   gate, never protected markup — verify in view-source, not just on screen.
   With a restricted permission set, the sidebar links and the target page's
   `AccessDenied` banner must match exactly the granted perms.
6. **No behaviour drift.** `NEXT_PUBLIC_API_URL`, CSP headers, font loading
   (`--font-inter` on `<html>`), and the skip-link/`#main-content` structure are
   unchanged by these fixes; if a deployment verification flags a visual or
   header change, treat it as a separate defect.
