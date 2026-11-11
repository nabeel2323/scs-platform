/**
 * Ambient declarations for side-effect stylesheet imports.
 *
 * `next/types/global.d.ts` types `*.module.css` imports, but the App Router
 * also allows importing a plain global stylesheet from a layout
 * (`import './globals.css'`), which has no exports to type. Without this,
 * `tsc --noEmit` rejects the import that the hydration remediation relies on.
 */
declare module '*.css';
