'use client';

/**
 * P13 Phase 2 — Business Calendar Administration
 *
 * Route: /calendar
 * Allows authorized admins to configure the business calendar used for
 * escalation SLA deadline calculation.
 */
import { useState, useEffect, useCallback } from 'react';
import { adminRequest } from '../../lib/api';
import { AccessDenied, useRequirePerms } from '../../hooks/useRequirePerms';
import { PageHeader, radii } from '@scs/ui-kit';

interface CalendarConfig {
  id: string;
  name: string;
  timezone: string;
  startTime: string;
  endTime: string;
  workingDays: number[];
  isDefault: boolean;
  enabled: boolean;
}

interface Holiday {
  id: string;
  calendarId: string;
  holidayDate: string;
  description: string | null;
}

interface AuditEntry {
  id: string;
  action: string;
  changedBy: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
}

const DAY_ENTRIES = [
  { name: 'Mon', num: 1 }, { name: 'Tue', num: 2 }, { name: 'Wed', num: 3 },
  { name: 'Thu', num: 4 }, { name: 'Fri', num: 5 }, { name: 'Sat', num: 6 }, { name: 'Sun', num: 7 },
];

function fmtDate(s: string) {
  try { return new Date(s).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

export default function CalendarAdminPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['admin:returns:read']);
  const [ready, setReady] = useState(false);
  const [calendars, setCalendars] = useState<CalendarConfig[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [selectedCal, setSelectedCal] = useState<CalendarConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Holiday form
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayDesc, setNewHolidayDesc] = useState('');

  const load = useCallback(async () => {
    if (!hasAccess) { setLoading(false); return; }
    try {
      const cals = await adminRequest<CalendarConfig[]>('admin/business-calendars');
      setCalendars(cals);
      const def = cals.find(c => c.isDefault && c.enabled);
      if (def) {
        setSelectedCal(def);
        const [hols, aud] = await Promise.all([
          adminRequest<Holiday[]>(`admin/business-calendars/${def.id}/holidays`),
          adminRequest<AuditEntry[]>(`admin/business-calendars/${def.id}/audit`),
        ]);
        setHolidays(hols);
        setAudit(aud);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [hasAccess]);

  useEffect(() => { setReady(true); }, []);
  useEffect(() => { load(); }, [load]);

  const addHoliday = async () => {
    if (!selectedCal || !newHolidayDate) return;
    try {
      await adminRequest(`admin/business-calendars/${selectedCal.id}/holidays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holidayDate: newHolidayDate, description: newHolidayDesc || undefined }),
      });
      setSuccess('Holiday added');
      setNewHolidayDate('');
      setNewHolidayDesc('');
      await load();
    } catch (e: any) { setSuccess(''); setError(e.message); }
  };

  const removeHoliday = async (date: string) => {
    if (!selectedCal) return;
    try {
      await adminRequest(`admin/business-calendars/${selectedCal.id}/holidays/${date}`, { method: 'DELETE' });
      setSuccess('Holiday removed');
      await load();
    } catch (e: any) { setSuccess(''); setError(e.message); }
  };

  if (!ready) return <div style={{ padding: '24px 28px', color: 'rgba(255,255,255,0.5)' }}>Loading…</div>;
  if (!hasAccess) return <div style={{ padding: '24px 28px' }}><AccessDenied requiredPerms={['admin:returns:read']} missingPerms={missingPerms} /></div>;

  const inputStyle = {
    padding: '6px 10px', borderRadius: radii.md,
    border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)',
    color: '#fff', fontSize: 13,
  };

  return (
    <div style={{ padding: '24px 28px' }}>
      <PageHeader title="Business Calendar" subtitle="Configure working days, hours, and holidays for escalation SLA calculation" />

      {error && <div style={{ color: '#ef4444', marginBottom: 16, fontSize: 13, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: radii.md }}>{error}</div>}
      {success && <div style={{ color: '#22c55e', marginBottom: 16, fontSize: 13, padding: '8px 12px', background: 'rgba(34,197,94,0.1)', borderRadius: radii.md }}>{success}</div>}

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.5)', padding: 40, textAlign: 'center' }}>Loading calendar configuration…</div>
      ) : !selectedCal ? (
        <div style={{ color: '#f59e0b', padding: 40, textAlign: 'center' }}>No business calendar configured. Contact system administrator.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Calendar Configuration */}
          <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: radii.lg, padding: 20 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#fff' }}>
              {selectedCal.name} {selectedCal.isDefault && '(Default)'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', fontSize: 13 }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>Timezone</div>
                <div style={{ color: '#fff' }}>{selectedCal.timezone}</div>
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>Status</div>
                <div style={{ color: selectedCal.enabled ? '#22c55e' : '#ef4444' }}>{selectedCal.enabled ? 'Enabled' : 'Disabled'}</div>
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>Working Hours</div>
                <div style={{ color: '#fff' }}>{selectedCal.startTime.slice(0, 5)} — {selectedCal.endTime.slice(0, 5)}</div>
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>Hours per Day</div>
                <div style={{ color: '#fff' }}>
                  {((parseInt(selectedCal.endTime) - parseInt(selectedCal.startTime)) || 0).toString()}h
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 6 }}>Working Days</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {DAY_ENTRIES.map((d) => (
                    <span key={d.name} style={{
                      padding: '4px 10px', borderRadius: radii.md, fontSize: 12, fontWeight: 600,
                      background: selectedCal.workingDays.includes(d.num) ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                      color: selectedCal.workingDays.includes(d.num) ? '#3b82f6' : 'rgba(255,255,255,0.3)',
                      border: `1px solid ${selectedCal.workingDays.includes(d.num) ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    }}>
                      {d.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Holidays */}
          <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: radii.lg, padding: 20 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#fff' }}>Holidays ({holidays.length})</h2>

            {/* Add holiday form */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <input type="text" value={newHolidayDesc} onChange={e => setNewHolidayDesc(e.target.value)} placeholder="Description (optional)" style={{ ...inputStyle, flex: 1 }} />
              <button onClick={addHoliday} disabled={!newHolidayDate} style={{
                padding: '6px 14px', borderRadius: radii.md, fontSize: 13, fontWeight: 600,
                background: newHolidayDate ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                color: '#fff', border: 'none', cursor: newHolidayDate ? 'pointer' : 'not-allowed',
              }}>Add</button>
            </div>

            {/* Holiday list */}
            {holidays.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No holidays configured.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {holidays.map(h => (
                  <div key={h.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: radii.md,
                  }}>
                    <div>
                      <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{h.holidayDate}</span>
                      {h.description && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginLeft: 8 }}>{h.description}</span>}
                    </div>
                    <button onClick={() => removeHoliday(h.holidayDate)} style={{
                      padding: '2px 8px', borderRadius: radii.md, fontSize: 11,
                      background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'none', cursor: 'pointer',
                    }}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Audit Log */}
          <div style={{ gridColumn: '1 / -1', border: '1px solid rgba(255,255,255,0.12)', borderRadius: radii.lg, padding: 20 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#fff' }}>Configuration Audit Log</h2>
            {audit.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No audit entries.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {audit.map(a => (
                  <div key={a.id} style={{
                    padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: radii.md,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12,
                  }}>
                    <div>
                      <span style={{
                        padding: '2px 6px', borderRadius: radii.md, fontSize: 10, fontWeight: 700,
                        background: a.action === 'CREATED' ? 'rgba(34,197,94,0.15)' : a.action === 'UPDATED' ? 'rgba(59,130,246,0.15)' : 'rgba(245,158,11,0.15)',
                        color: a.action === 'CREATED' ? '#22c55e' : a.action === 'UPDATED' ? '#3b82f6' : '#f59e0b',
                      }}>{a.action}</span>
                      <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: 8 }}>{fmtDate(a.createdAt)}</span>
                      {a.changedBy && <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 8, fontFamily: 'monospace' }}>{a.changedBy.slice(0, 8)}…</span>}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                      {a.oldValue && <span>Old: {JSON.stringify(a.oldValue)}</span>}
                      {a.newValue && <span> New: {JSON.stringify(a.newValue)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
