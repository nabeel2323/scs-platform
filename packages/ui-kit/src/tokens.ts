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
  surfaceElevated: '#ffffff',
  bg: '#f2f5f6',
  bgSubtle: '#f7f9fa',
  border: '#d9e2e6',
  borderLight: '#e5ecf0',
  line: '#d9e2e6',
  ok: '#1b7a4b',
  okBg: '#eaf5ef',
  okBorder: '#a7f3d0',
  warn: '#b45309',
  warnBg: '#fdf3e7',
  err: '#b3372f',
  errBg: '#fbeeec',
  errBorder: '#fca5a5',
  info: '#1d5fa8',
  infoBg: '#e8f1f9',
  amber: '#c98a2d',
  disabled: '#b0bec5',
  disabledBg: '#f0f3f5',
  overlay: 'rgba(7,30,50,0.45)',
  focusRing: '0 0 0 3px rgba(30,97,120,0.35)',
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

/** Semantic typography scale — maps roles to concrete size/weight/lineHeight. */
export const typeScale = {
  display:  { fontSize: '28px', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.3px' },
  h1:       { fontSize: '23px', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.2px' },
  h2:       { fontSize: '20px', fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.1px' },
  h3:       { fontSize: '17px', fontWeight: 600, lineHeight: 1.35 },
  h4:       { fontSize: '15px', fontWeight: 600, lineHeight: 1.4 },
  bodyLg:   { fontSize: '15.5px', fontWeight: 400, lineHeight: 1.55 },
  body:     { fontSize: '14px', fontWeight: 400, lineHeight: 1.5 },
  bodySm:   { fontSize: '12.8px', fontWeight: 400, lineHeight: 1.45 },
  caption:  { fontSize: '11.5px', fontWeight: 500, lineHeight: 1.4, letterSpacing: '0.2px' },
  label:    { fontSize: '12px', fontWeight: 600, lineHeight: 1.4, letterSpacing: '0.3px' },
  button:   { fontSize: '13px', fontWeight: 600, lineHeight: 1, letterSpacing: '0.1px' },
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
  xl: '0 8px 32px rgba(22,35,43,.12)',
} as const;

// ── Transitions ──────────────────────────────────────────────
export const transitions = {
  fast: '0.12s ease',
  normal: '0.2s ease',
  slow: '0.3s ease',
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

// ── Extended status map (web Shared.tsx consolidation) ───────
export const statusColors: Record<string, { bg: string; fg: string }> = {
  ...orderStatusColors,
  // Store / verification statuses
  VERIFIED: { bg: colors.okBg, fg: colors.ok },
  PENDING: { bg: colors.warnBg, fg: colors.warn },
  ACTIVE: { bg: colors.okBg, fg: colors.ok },
  // Notification statuses
  SENT: { bg: colors.infoBg, fg: colors.info },
  READ: { bg: '#eef1f3', fg: colors.muted },
  FAILED: { bg: colors.errBg, fg: colors.err },
  // Dispute statuses
  OPEN: { bg: colors.warnBg, fg: colors.warn },
  EVIDENCE: { bg: colors.warnBg, fg: colors.warn },
  RESPONSE: { bg: colors.infoBg, fg: colors.info },
  REVIEW: { bg: brand[100], fg: brand.DEFAULT },
  RESOLVED: { bg: colors.okBg, fg: colors.ok },
  CLOSED: { bg: '#eef1f3', fg: colors.muted },
  // Legacy alias
  CONFIRMED: { bg: colors.infoBg, fg: colors.info },
  PAYMENT_PENDING: { bg: colors.warnBg, fg: colors.warn },
};
