/**
 * Test utility — document-root hydration harness for the Next.js App Router.
 *
 * A component rendered into a `<div>` cannot prove hydration safety: Next 14's
 * client entry hydrates *the document itself*
 * (`next/dist/client/app-index.js` → `const appElement = document;` →
 * `hydrateRoot(appElement, reactEl, …)`), and only a real HTML parser decides
 * whether the bytes the server sent round-trip into the DOM text React compares
 * against. This helper reproduces that path:
 *
 *   1. `renderToString` the real server tree (React DOM's own text escaping).
 *   2. Parse the result with a real HTML parser (`DOMParser`). Like a browser,
 *      it treats `<style>` as a *raw-text* element, so character references
 *      inside it are **not** decoded.
 *   3. Install the parsed `<html>` as the live document element.
 *   4. `hydrateRoot(document, …)`, collecting every recoverable error and every
 *      hydration diagnostic React emits.
 *
 * Not named `*.test.tsx`, so Vitest does not collect it as a suite.
 */

import type { ReactElement, ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { act } from '@testing-library/react';
import { expect, vi } from 'vitest';

/**
 * Character references React's `escapeTextForBrowser` emits for `' " < > &`.
 * Inside a raw-text element a browser leaves them literal, so the DOM text
 * stops matching the React text child and hydration fails.
 */
export const CHARACTER_REFERENCES = ['&#x27;', '&#39;', '&quot;', '&gt;', '&lt;', '&amp;'];

/** Every way React 18 announces a hydration failure, minified or DEV. */
const HYDRATION_DIAGNOSTIC =
  /Text content did not match|Hydration failed because the initial UI does not match|There was an error while hydrating|An error occurred during hydration|Did not expect server HTML to contain|Minified React error #(41\d|42\d)/i;

export interface DocumentRootRun {
  /** Exact bytes the server pass produced. */
  prerenderedHtml: string;
  /** Errors handed to `hydrateRoot`'s `onRecoverableError`. */
  recoverableErrors: string[];
  /** Hydration failures logged through `console.error`. */
  diagnostics: string[];
  /**
   * An error that escaped the hydration commit. A client re-render triggered by
   * a failed hydration throws out of `act()` instead of reporting itself as a
   * hydration diagnostic, so it is captured here rather than masking the
   * diagnostics that explain it.
   */
  commitError?: string;
  /** Every `console.error` line React emitted during the commit, for triage. */
  consoleErrors: string[];
  unmount(): void;
}

const activeRuns: DocumentRootRun[] = [];

/**
 * A bare document root for a subtree the app's own layout keeps out of server
 * HTML (the auth gates render a placeholder until an effect opens them). The
 * tree under test stays real; only the surrounding `<html>/<head>/<body>` is
 * this harness's, so the page's own hydration behaviour can be observed.
 */
export function asDocumentRoot(children: ReactNode): ReactElement {
  return (
    <html>
      {/* This harness authors the document root Next hydrates, which really
          does have a <head>; next/head adds nodes to it at runtime instead. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head />
      <body>{children}</body>
    </html>
  );
}

/**
 * A failed document-scope hydration empties the document: React clears the
 * container before switching the whole root to client rendering. Component
 * effect cleanups that reach for `document.documentElement` would then throw,
 * replacing the real hydration failure with unrelated noise — so the shell is
 * restored before anything else touches the document.
 */
function ensureDocumentShell(): void {
  if (document.documentElement) return;
  const shell = document.createElement('html');
  shell.appendChild(document.createElement('head'));
  shell.appendChild(document.createElement('body'));
  document.appendChild(shell);
}

/** Prerender `element` and install the parsed result as the live document. */
export function prerenderIntoDocument(element: ReactElement): string {
  const html = renderToString(element);
  const parsed = new DOMParser().parseFromString(`<!doctype html>${html}`, 'text/html');
  // An HTML parser always materializes a `<head>`, even when the markup had
  // none — and Next fills that head with metadata at build time. In this
  // harness the React tree is the only source of truth, so a head the tree
  // never rendered must not be left behind for it to disagree with.
  if (!/<head[\s>]/i.test(html) && parsed.head) parsed.head.remove();
  const imported = document.importNode(parsed.documentElement, true);
  ensureDocumentShell();
  document.replaceChild(imported, document.documentElement);
  return html;
}

/** Prerender, parse, then hydrate the same tree at document scope. */
export interface HydrateOptions {
  /** Runs immediately before the server pass — e.g. set the clock the server sees. */
  beforePrerender?(): void;
  /** Runs after the document is installed, immediately before hydration. */
  beforeHydrate?(): void;
}

export async function hydrateDocumentRoot(element: ReactElement, options: HydrateOptions = {}): Promise<DocumentRootRun> {
  const recoverableErrors: string[] = [];
  const diagnostics: string[] = [];
  const allConsoleErrors: string[] = [];

  options.beforePrerender?.();
  const prerenderedHtml = prerenderIntoDocument(element);
  options.beforeHydrate?.();

  const consoleError = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const line = args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' ');
    allConsoleErrors.push(line);
    if (HYDRATION_DIAGNOSTIC.test(line)) diagnostics.push(line);
  });

  let root: Root | undefined;
  let commitError: string | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(document, element, {
        onRecoverableError: (error: unknown) => {
          recoverableErrors.push(error instanceof Error ? error.message : String(error));
        },
      });
    });
  } catch (error: unknown) {
    commitError = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  }

  const run: DocumentRootRun = {
    prerenderedHtml,
    recoverableErrors,
    diagnostics,
    commitError,
    consoleErrors: allConsoleErrors,
    unmount: () => {
      if (root) {
        ensureDocumentShell();
        // Unmounting a tree whose container is the document makes React delete
        // the `<html>` element it hydrated, and only then run the deleted
        // subtree's passive cleanups — so a component that touches
        // `document.documentElement.style` there throws. This is harness
        // teardown, not app behaviour (a real App Router root is never
        // unmounted), and hydration itself was already judged by the arrays
        // above, so the teardown error is contained rather than propagated.
        const activeRoot = root;
        try {
          act(() => activeRoot.unmount());
        } catch {
          ensureDocumentShell();
        }
      }
      consoleError.mockRestore();
    },
  };
  activeRuns.push(run);
  return run;
}

/** Unmount every run and restore every console spy. Call from `afterEach`. */
export function cleanupDocumentRoots(): void {
  while (activeRuns.length) activeRuns.pop()?.unmount();
}

/** Fail unless the document hydrated with no recoverable error and no diagnostic. */
export function expectHydrationClean(run: DocumentRootRun): void {
  expect(run.commitError, `hydration commit threw; console:\n${run.consoleErrors.join('\n')}`).toBeUndefined();
  expect(run.recoverableErrors).toEqual([]);
  expect(run.diagnostics).toEqual([]);
}

/**
 * Text of every `<style>` element as a real parser put it in the document —
 * i.e. exactly what React compares against while hydrating.
 */
export function servedStyleBlocks(html: string): string[] {
  const parsed = new DOMParser().parseFromString(`<!doctype html>${html}`, 'text/html');
  return Array.from(parsed.querySelectorAll('style'), (node) => node.textContent ?? '');
}

/** Style texts that contain at least one character-reference artifact. */
export function styleBlocksWithArtifacts(html: string): string[] {
  return servedStyleBlocks(html).filter((css) => CHARACTER_REFERENCES.some((ref) => css.includes(ref)));
}
