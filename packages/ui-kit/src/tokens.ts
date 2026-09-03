/**
 * TAIF Design System — Design Tokens
 *
 * Brand: #174a5b (deep teal)
 * Typography: Inter (Latin) + IBM Plex Sans Arabic (Arabic)
 * Semantic colors, spacing, radii, shadows for web + admin apps.
 */

// ── Brand ────────────────────────────────────────────────────
export const brand = {
  50: '#f2f7f9',
  100: '#e7f0f3',
  300: '#7fb5c5',
  500: '#1e6178',
  700: '#0f3340',
  900: '#0c2831',
  DEFAULT: '#174a5b',
} as const;

// ── Semantic ─────────────────────────────────────────────────
export const colors = {
  brand,
  ink: '#16232b',
  muted: '#5b6b74',
  surface: '#ffffff',
  bg: '#f2f5f6',
  line: '#d9e2e6',
  ok: '#1b7a4b',
  okBg: '#eaf5ef',
  warn: '#b45309',
  warnBg: '#fdf3e7',
  err: '#b3372f',
  errBg: '#fbeeec',
  info: '#1d5fa8',
  infoBg: '#e8f1f9',
  amber: '#c98a2d',
} as const;

// ── Typography ───────────────────────────────────────────────
export const fonts = {
  sans: '"Inter","Segoe UI",system-ui,-apple-system,Roboto,"Noto Sans Arabic","Helvetica Neue",Arial,sans-serif',
  arabic: '"IBM Plex Sans Arabic","Noto Sans Arabic","Inter",sans-serif',
  mono: '"Cascadia Code","JetBrains Mono",Consolas,"SFMono-Regular",Menlo,monospace',
} as const;

export const fontSizes = {
  xs: '11.5px',
  sm: '12.8px',
  base: '15.5px',
  lg: '17px',
  xl: '20px',
  '2xl': '23px',
  '3xl': '28px',
  '4xl': '44px',
} as const;

// ── Spacing ──────────────────────────────────────────────────
export const spacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
} as const;

// ── Radii ────────────────────────────────────────────────────
export const radii = {
  sm: '6px',
  md: '10px',
  lg: '14px',
  full: '999px',
} as const;

// ── Shadows ──────────────────────────────────────────────────
export const shadows = {
  sm: '0 1px 2px rgba(22,35,43,.06)',
  md: '0 1px 2px rgba(22,35,43,.06),0 4px 14px rgba(22,35,43,.05)',
  lg: '0 4px 24px rgba(22,35,43,.10)',
} as const;

// ── Breakpoints (responsive) ─────────────────────────────────
export const breakpoints = {
  compact: '0px',
  medium: '640px',
  expanded: '1080px',
} as const;

// ── Order status semantics (shared with StatusPill) ──────────
export const orderStatusColors: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: colors.infoBg, fg: colors.info },
  SUBMITTED: { bg: colors.infoBg, fg: colors.info },
  PENDING_CONFIRMATION: { bg: colors.infoBg, fg: colors.info },
  ACCEPTED: { bg: colors.okBg, fg: colors.ok },
  PARTIALLY_ACCEPTED: { bg: colors.warnBg, fg: colors.warn },
  PREPARING: { bg: brand[100], fg: brand.DEFAULT },
  READY: { bg: brand[100], fg: brand.DEFAULT },
  ASSIGNED: { bg: colors.infoBg, fg: colors.info },
  PICKED_UP: { bg: colors.infoBg, fg: colors.info },
  OUT_FOR_DELIVERY: { bg: colors.infoBg, fg: colors.info },
  DELIVERED: { bg: colors.okBg, fg: colors.ok },
  COMPLETED: { bg: colors.okBg, fg: colors.ok },
  CANCELLED: { bg: '#eef1f3', fg: colors.muted },
  REJECTED: { bg: '#eef1f3', fg: colors.muted },
  DISPUTED: { bg: colors.errBg, fg: colors.err },
};
