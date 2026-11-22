'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  fetchKpis,
  fetchAdminOrgUpdateRequests,
  fetchCatalogImports,
  fetchAdminCatalogRequests,
  type KpiResponse,
  type AdminOrgUpdateRequest,
  type CatalogImport,
  type AdminCatalogRequest,
} from '../lib/api';
import { useRequirePerms } from '../hooks/useRequirePerms';
import {
  PageHeader,
  KpiCard,
  QuickLink,
  IconUsers,
  IconShield,
  IconPackage,
  IconDollar,
  IconActivity,
  IconBarChart,
  IconClipboard,
  IconRefresh,
  colors,
  typeScale,
  shadows,
  radii,
  transitions,
} from '@scs/ui-kit';

/* ── Dashboard Page ──────────────────────────────────────── */

export default function AdminHomePage() {
  const [kpis, setKpis] = useState<KpiResponse | null>(null);
  const [updateReqs, setUpdateReqs] = useState<AdminOrgUpdateRequest[]>([]);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [orgUpdatesLoading, setOrgUpdatesLoading] = useState(true);
  const { hasAccess: canReadKpis } = useRequirePerms(['admin:kpis:read']);
  const { hasAccess: canReadOrgUpdates } = useRequirePerms(['admin:users:read']);
  const { hasAccess: canManageImports } = useRequirePerms(['catalog:imports:manage']);
  const { hasAccess: canManageRequests } = useRequirePerms(['catalog:requests:manage']);
  const [recentImports, setRecentImports] = useState<CatalogImport[]>([]);
  const [pendingCatalogRequests, setPendingCatalogRequests] = useState<AdminCatalogRequest[]>([]);
  const [operationsLoading, setOperationsLoading] = useState(true);
  const [operationsError, setOperationsError] = useState('');
  // Effect-initialized like the Buyer home page: the server and the first
  // client render both emit no clock, so a wall-clock or timezone difference
  // between the two passes can no longer produce mismatched text at the root.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
  }, []);

  useEffect(() => {
    let active = true;
    if (canReadKpis) {
      setKpisLoading(true);
      fetchKpis()
        .then((data) => { if (active) setKpis(data); })
        .catch(() => {})
        .finally(() => { if (active) setKpisLoading(false); });
    } else {
      setKpis(null);
      setKpisLoading(false);
    }
    if (canReadOrgUpdates) {
      setOrgUpdatesLoading(true);
      fetchAdminOrgUpdateRequests('PENDING')
        .then((rows) => { if (active) setUpdateReqs(rows); })
        .catch(() => {})
        .finally(() => { if (active) setOrgUpdatesLoading(false); });
    } else {
      setUpdateReqs([]);
      setOrgUpdatesLoading(false);
    }
    return () => { active = false; };
  }, [canReadKpis, canReadOrgUpdates]);

  useEffect(() => {
    let active = true;
    const tasks: Promise<void>[] = [];
    setOperationsLoading(true);
    setOperationsError('');
    if (canManageImports) {
      tasks.push(
        fetchCatalogImports({ limit: 5 })
          .then((rows) => {
            if (active) setRecentImports(rows);
          })
          .catch((error) => {
            if (active)
              setOperationsError(
                error instanceof Error ? error.message : 'Unable to load catalog imports',
              );
          }),
      );
    }
    if (canManageRequests) {
      tasks.push(
        fetchAdminCatalogRequests({ status: 'PENDING' })
          .then((rows) => {
            if (active) setPendingCatalogRequests(rows);
          })
          .catch((error) => {
            if (active)
              setOperationsError(
                error instanceof Error ? error.message : 'Unable to load catalog requests',
              );
          }),
      );
    }
    Promise.all(tasks).finally(() => {
      if (active) setOperationsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [canManageImports, canManageRequests]);

  const fmt = (n: number) => (n / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });

  return (
    <>
      {/* ── Header Banner ─────────────────────────────────── */}
      <PageHeader
        title="Dashboard"
        subtitle="Platform overview & quick access"
        trailing={
          now ? (
            <div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                {now.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
              <div
                style={{
                  fontSize: typeScale.caption.fontSize,
                  color: 'rgba(255,255,255,0.35)',
                  marginTop: 2,
                }}
              >
                {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ) : undefined
        }
      />

      {/* ── Content ───────────────────────────────────────── */}
      <div style={{ padding: '28px 40px 48px', maxWidth: 1320 }}>
        {/* KPI Row */}
        {canReadKpis && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: 18,
              marginBottom: 40,
            }}
          >
            <KpiCard
              icon={<IconUsers />}
              label="Total Users"
              value={kpisLoading ? '—' : String(kpis?.users.total ?? 0)}
              accent={colors.brand[700]}
              tint={colors.brand[50]}
            />
            <KpiCard
              icon={<IconShield />}
              label="Verified Merchants"
              value={kpisLoading ? '—' : String(kpis?.merchants.verified ?? 0)}
              accent={colors.ok}
              tint={colors.okBg}
            />
            <KpiCard
              icon={<IconPackage />}
              label="Pending Merchants"
              value={kpisLoading ? '—' : String(kpis?.merchants.pending ?? 0)}
              accent={colors.warn}
              tint={colors.warnBg}
            />
            <KpiCard
              icon={<IconPackage />}
              label="Total Orders"
              value={kpisLoading ? '—' : String(kpis?.orders.total ?? 0)}
              accent={colors.info}
              tint={colors.infoBg}
            />
            <KpiCard
              icon={<IconDollar />}
              label="Revenue"
              value={kpisLoading ? '—' : `${fmt(kpis?.revenue.totalMinor ?? 0)} SAR`}
              accent="#7c3aed"
              tint="#f3efff"
            />
            <KpiCard
              icon={<IconActivity />}
              label="Completion Rate"
              value={kpisLoading ? '—' : `${kpis?.orders.completionRate ?? 0}%`}
              accent="#047857"
              tint={colors.okBg}
            />
          </div>
        )}

        {/* Pending Organization Updates Widget */}
        {canReadOrgUpdates && (
          <div
            style={{
              background: colors.surface,
              borderRadius: radii.md,
              border: `1px solid ${colors.border}`,
              boxShadow: shadows.md,
              marginBottom: 40,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: colors.brand[500], display: 'flex' }}>
                  <IconRefresh size={18} />
                </span>
                <h2 style={{ ...typeScale.h4, color: colors.brand[700], margin: 0 }}>
                  Pending Organization Updates
                </h2>
                <span
                  style={{
                    background: updateReqs.length > 0 ? colors.warnBg : colors.bgSubtle,
                    color: updateReqs.length > 0 ? colors.warn : colors.muted,
                    ...typeScale.caption,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: radii.full,
                  }}
                >
                  {orgUpdatesLoading ? '…' : updateReqs.length}
                </span>
              </div>
              <Link
                href="/organizations"
                style={{
                  ...typeScale.bodySm,
                  color: colors.brand[500],
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                View all →
              </Link>
            </div>
            {orgUpdatesLoading ? (
            <div
              style={{
                padding: '28px 22px',
                textAlign: 'center',
                color: colors.muted,
                ...typeScale.body,
              }}
            >
                Loading organization update requests…
              </div>
            ) : updateReqs.length === 0 ? (
              <div
                style={{
                  padding: '28px 22px',
                  textAlign: 'center',
                  color: colors.muted,
                  ...typeScale.body,
                }}
              >
                No pending update requests
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', ...typeScale.body }}>
                <thead>
                  <tr
                    style={{
                      background: colors.bgSubtle,
                      borderBottom: `1px solid ${colors.border}`,
                    }}
                  >
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '10px 18px',
                        ...typeScale.label,
                        color: colors.muted,
                        letterSpacing: '0.5px',
                      }}
                    >
                      Organization
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '10px 18px',
                        ...typeScale.label,
                        color: colors.muted,
                        letterSpacing: '0.5px',
                      }}
                    >
                      Proposed Changes
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '10px 18px',
                        ...typeScale.label,
                        color: colors.muted,
                        letterSpacing: '0.5px',
                      }}
                    >
                      Submitted
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '10px 18px',
                        ...typeScale.label,
                        color: colors.muted,
                        letterSpacing: '0.5px',
                      }}
                    >
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {updateReqs.slice(0, 5).map((req) => {
                    const changes = Object.entries(req.payload || {})
                      .filter(([, v]) => v)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(', ');
                    return (
                      <tr key={req.id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                        <td
                          style={{ padding: '12px 18px', color: colors.brand[700], fontWeight: 500 }}
                        >
                          {req.orgName || 'Unknown'}
                        </td>
                        <td
                          style={{
                            padding: '12px 18px',
                            color: colors.muted,
                            ...typeScale.bodySm,
                            maxWidth: 300,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {changes || '—'}
                        </td>
                        <td
                          style={{ padding: '12px 18px', color: colors.muted, ...typeScale.bodySm }}
                        >
                          {new Date(req.createdAt).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                          <Link
                            href="/organizations"
                            style={{
                              display: 'inline-block',
                              padding: '4px 12px',
                              ...typeScale.caption,
                              fontWeight: 600,
                              background: colors.brand[50],
                              color: colors.brand[700],
                              border: `1px solid ${colors.brand[300]}`,
                              borderRadius: radii.sm,
                              textDecoration: 'none',
                            }}
                          >
                            Review
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {(canManageImports || canManageRequests) && (
          <>
            <SectionTitle>Catalog Operations</SectionTitle>
            {operationsError && (
              <p role="alert" style={{ color: '#b91c1c', ...typeScale.bodySm }}>
                {operationsError}
              </p>
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
                gap: 14,
                marginBottom: 32,
              }}
            >
              {canManageImports && (
                <div
                  style={{
                    background: colors.surface,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radii.md,
                    boxShadow: shadows.md,
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      marginBottom: 14,
                    }}
                  >
                    <h3 style={{ ...typeScale.h4, color: colors.brand[700], margin: 0 }}>
                      Recent Catalog Imports
                    </h3>
                    <Link
                      href="/catalog-import"
                      style={{
                        ...typeScale.bodySm,
                        color: colors.brand[500],
                        textDecoration: 'none',
                      }}
                    >
                      View all →
                    </Link>
                  </div>
                  {operationsLoading ? (
                    <p style={{ color: colors.muted }}>Loading imports…</p>
                  ) : recentImports.length === 0 ? (
                    <p style={{ color: colors.muted }}>No catalog imports yet.</p>
                  ) : (
                    recentImports.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '9px 0',
                          borderTop: `1px solid ${colors.borderLight}`,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: colors.brand[700],
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.fileName}
                          </div>
                          <div style={{ ...typeScale.caption, color: colors.muted }}>
                            {item.totalRows} rows · {new Date(item.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <span
                          style={{
                            ...typeScale.caption,
                            color: item.status === 'FAILED' ? colors.err : colors.muted,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
              {canManageRequests && (
                <div
                  style={{
                    background: colors.surface,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radii.md,
                    boxShadow: shadows.md,
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      marginBottom: 14,
                    }}
                  >
                    <h3 style={{ ...typeScale.h4, color: colors.brand[700], margin: 0 }}>
                      Pending Catalog Requests
                    </h3>
                    <Link
                      href="/requests"
                      style={{
                        ...typeScale.bodySm,
                        color: colors.brand[500],
                        textDecoration: 'none',
                      }}
                    >
                      Review all →
                    </Link>
                  </div>
                  {operationsLoading ? (
                    <p style={{ color: colors.muted }}>Loading requests…</p>
                  ) : pendingCatalogRequests.length === 0 ? (
                    <p style={{ color: colors.muted }}>No pending catalog requests.</p>
                  ) : (
                    pendingCatalogRequests.slice(0, 5).map((request) => (
                      <div
                        key={request.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '9px 0',
                          borderTop: `1px solid ${colors.borderLight}`,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: colors.brand[700] }}>
                            {request.type}
                          </div>
                          <div style={{ ...typeScale.caption, color: colors.muted }}>
                            Store {request.storeId.slice(0, 8)} ·{' '}
                            {new Date(request.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <span
                          style={{ ...typeScale.caption, color: colors.warn, whiteSpace: 'nowrap' }}
                        >
                          Pending
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Quick Access */}
        <SectionTitle>Quick Access</SectionTitle>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
            gap: 14,
          }}
        >
          <Link href="/users" style={{ textDecoration: 'none', color: 'inherit' }}>
            <QuickLink
              icon={<IconUsers />}
              title="User Management"
              desc="Manage users, roles & permissions"
            />
          </Link>
          <Link href="/orders" style={{ textDecoration: 'none', color: 'inherit' }}>
            <QuickLink
              icon={<IconPackage />}
              title="Order Monitor"
              desc="Track all platform orders, filter by status"
            />
          </Link>
          <Link href="/merchants" style={{ textDecoration: 'none', color: 'inherit' }}>
            <QuickLink
              icon={<IconShield />}
              title="Merchant Directory"
              desc="Browse all stores & verification status"
            />
          </Link>
          <Link href="/verification" style={{ textDecoration: 'none', color: 'inherit' }}>
            <QuickLink
              icon={<IconShield />}
              title="Verification Queue"
              desc="Review pending merchant applications"
            />
          </Link>
          <Link href="/kpis" style={{ textDecoration: 'none', color: 'inherit' }}>
            <QuickLink
              icon={<IconBarChart />}
              title="KPI Dashboard"
              desc="Activation funnel, conversion & revenue"
            />
          </Link>
          <Link href="/audit" style={{ textDecoration: 'none', color: 'inherit' }}>
            <QuickLink
              icon={<IconClipboard />}
              title="Audit Log"
              desc="System-wide activity trail"
            />
          </Link>
        </div>
      </div>
    </>
  );
}

/* ── Section Title ───────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
      <h2 style={{ ...typeScale.h4, color: colors.brand[700], margin: 0 }}>{children}</h2>
      <div style={{ flex: 1, height: 1, background: colors.border }} />
    </div>
  );
}
