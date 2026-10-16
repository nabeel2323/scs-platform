/**
 * P13 Phase 2 — Business Calendar Service
 *
 * Calculates business-day deadlines for the administrator escalation SLA.
 * Default calendar: Mon–Fri, 08:00–18:00 UTC, excluding configured holidays.
 *
 * Key invariant: the SLA clock pauses outside configured business hours and
 * on non-business days. Three business days means three full working days of
 * available business time (10 hours each for the default calendar = 30 hours).
 */
import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'node:crypto';
import { DatabaseService } from '../../common/database/database.service';
import {
  businessCalendars, businessCalendarHolidays, businessCalendarAudit,
} from './business-calendar.schema';

/** Maximum loop iterations to prevent unbounded loops on malformed config. */
const MAX_ITERATIONS = 3660; // ~10 years of calendar days

/** Fixed UUID for the default calendar (matches migration 0060 seed). */
const DEFAULT_CALENDAR_ID = 'a0000000-0000-0000-0000-000000000001';

export interface BusinessCalendarConfig {
  id: string;
  name: string;
  timezone: string;
  startTime: string;   // HH:MM:SS
  endTime: string;     // HH:MM:SS
  workingDays: number[]; // 1=Mon..7=Sun
  isDefault: boolean;
  enabled: boolean;
}

export interface HolidayEntry {
  id: string;
  calendarId: string;
  holidayDate: string; // YYYY-MM-DD
  description: string | null;
}

@Injectable()
export class BusinessCalendarService {
  private readonly logger = new Logger(BusinessCalendarService.name);

  constructor(private readonly db: DatabaseService) {}

  // ═══════════════════════════════════════════════════════════════
  // CALENDAR LOADING
  // ═══════════════════════════════════════════════════════════════

  /** Load the default enabled calendar. Throws if missing or invalid. */
  async loadDefaultCalendar(): Promise<BusinessCalendarConfig> {
    const cal = await this.db.db.query.businessCalendars.findFirst({
      where: and(
        eq(businessCalendars.isDefault, true),
        eq(businessCalendars.enabled, true),
      ),
    });
    if (!cal) {
      throw new Error(
        'BUSINESS_CALENDAR_NOT_FOUND: No enabled default business calendar is configured. ' +
        'Administrator SLA cannot be calculated. Contact system administrator.',
      );
    }
    return this.toConfig(cal);
  }

  /** Load a specific calendar by ID. */
  async loadCalendar(calendarId: string): Promise<BusinessCalendarConfig> {
    const cal = await this.db.db.query.businessCalendars.findFirst({
      where: eq(businessCalendars.id, calendarId),
    });
    if (!cal) {
      throw new Error(`BUSINESS_CALENDAR_NOT_FOUND: Calendar ${calendarId} does not exist.`);
    }
    if (!cal.enabled) {
      throw new Error(`BUSINESS_CALENDAR_DISABLED: Calendar ${calendarId} is disabled.`);
    }
    return this.toConfig(cal);
  }

  /** Load holidays for a calendar within a date range. */
  async loadHolidays(calendarId: string, from: Date, to: Date): Promise<Set<string>> {
    const fromDate = this.toDateString(from);
    const toDate = this.toDateString(to);
    const holidays = await this.db.db.query.businessCalendarHolidays.findMany({
      where: and(
        eq(businessCalendarHolidays.calendarId, calendarId),
      ),
    });
    const result = new Set<string>();
    for (const h of holidays) {
      if (h.holidayDate >= fromDate && h.holidayDate <= toDate) {
        result.add(h.holidayDate);
      }
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // BUSINESS-TIME QUERIES
  // ═══════════════════════════════════════════════════════════════

  /** Check if an instant falls within business hours for the default calendar. */
  async isBusinessHours(instant: Date, calendarId?: string): Promise<boolean> {
    const cal = calendarId
      ? await this.loadCalendar(calendarId)
      : await this.loadDefaultCalendar();

    const dayOfWeek = this.getISODayOfWeek(instant);
    if (!cal.workingDays.includes(dayOfWeek)) return false;

    const holidays = await this.loadHolidays(
      cal.id, instant, new Date(instant.getTime() + 86400000),
    );
    if (holidays.has(this.toDateString(instant))) return false;

    const timeOfDay = this.getTimeOfDayMs(instant);
    const startMs = this.parseTimeMs(cal.startTime);
    const endMs = this.parseTimeMs(cal.endTime);
    return timeOfDay >= startMs && timeOfDay < endMs;
  }

  /**
   * Find the next business-time instant >= the given timestamp.
   * If already in business hours, returns the same instant.
   */
  async nextBusinessInstant(instant: Date, calendarId?: string): Promise<Date> {
    const cal = calendarId
      ? await this.loadCalendar(calendarId)
      : await this.loadDefaultCalendar();

    this.validateCalendar(cal);

    let current = new Date(instant.getTime());
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const dayOfWeek = this.getISODayOfWeek(current);

      if (!cal.workingDays.includes(dayOfWeek)) {
        // Advance to start of next day
        current = this.startOfNextDay(current);
        continue;
      }

      const dateStr = this.toDateString(current);
      const holidays = await this.loadHolidays(cal.id, current, current);
      if (holidays.has(dateStr)) {
        current = this.startOfNextDay(current);
        continue;
      }

      const timeOfDay = this.getTimeOfDayMs(current);
      const startMs = this.parseTimeMs(cal.startTime);
      const endMs = this.parseTimeMs(cal.endTime);

      if (timeOfDay < startMs) {
        // Before business hours — snap to opening
        return this.setTimeOfDay(current, startMs);
      }
      if (timeOfDay >= endMs) {
        // After business hours — advance to next day opening
        current = this.startOfNextDay(current);
        continue;
      }
      // Within business hours
      return current;
    }

    throw new Error('BUSINESS_CALENDAR_MAX_ITERATIONS: Calendar calculation exceeded safety limit.');
  }

  /**
   * Add N business days to a start timestamp using working-time accumulation.
   *
   * "Three business days" means three full business days of available working
   * time (e.g., 3 × 10 hours = 30 hours for the default 08:00–18:00 calendar).
   *
   * Algorithm:
   * 1. Snap start to the next business instant.
   * 2. Calculate total working milliseconds required: days × (endTime − startTime).
   * 3. Walk forward through business time, consuming available working time
   *    on each business day (partial first day, full middle days, partial last day).
   * 4. The deadline is the instant at which all required working time is consumed.
   *
   * This is NOT a simplistic date-count — it accumulates actual working time,
   * correctly handling partial first days, weekends, and holidays.
   */
  async addBusinessDays(start: Date, days: number, calendarId?: string): Promise<Date> {
    if (days < 0) throw new Error('addBusinessDays: days must be non-negative');
    if (days === 0) return this.nextBusinessInstant(start, calendarId);

    const cal = calendarId
      ? await this.loadCalendar(calendarId)
      : await this.loadDefaultCalendar();

    this.validateCalendar(cal);

    // Total working time required in milliseconds
    const startMs = this.parseTimeMs(cal.startTime);
    const endMs = this.parseTimeMs(cal.endTime);
    const msPerDay = endMs - startMs;
    const totalWorkingMs = days * msPerDay;

    return this.addWorkingTime(start, totalWorkingMs, cal);
  }

  /**
   * Add a specific amount of working time (in ms) to a start instant.
   * Walks forward through business time, consuming available hours each day.
   */
  private async addWorkingTime(
    start: Date,
    workingMs: number,
    cal: BusinessCalendarConfig,
  ): Promise<Date> {
    if (workingMs <= 0) return this.nextBusinessInstant(start);

    // Extend the range generously to cover weekends/holidays
    const rangeEnd = new Date(start.getTime() + (Math.ceil(workingMs / 3600000) + 60) * 3600000);
    const holidays = await this.loadHolidays(cal.id, start, rangeEnd);

    const startMs = this.parseTimeMs(cal.startTime);
    const endMs = this.parseTimeMs(cal.endTime);

    // Snap to next business instant
    let current = await this.nextBusinessInstant(start);
    let remaining = workingMs;
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const dayOfWeek = this.getISODayOfWeek(current);
      const dateStr = this.toDateString(current);

      // Skip non-working days
      if (!cal.workingDays.includes(dayOfWeek) || holidays.has(dateStr)) {
        current = this.startOfNextDay(current);
        // Snap to start of business hours if the new day is a working day
        const skipDow = this.getISODayOfWeek(current);
        if (cal.workingDays.includes(skipDow) && !holidays.has(this.toDateString(current))) {
          current = this.setTimeOfDay(current, startMs);
        }
        continue;
      }

      // Available working time on this day
      const currentTimeMs = this.getTimeOfDayMs(current);
      const availableMs = endMs - currentTimeMs;

      if (remaining <= availableMs) {
        // Deadline falls on this day
        return new Date(current.getTime() + remaining);
      }

      // Consume the rest of this day and move to next
      remaining -= availableMs;
      current = this.startOfNextDay(current);
      // Snap to start of business hours for the new day if it's a working day
      const newDow = this.getISODayOfWeek(current);
      if (cal.workingDays.includes(newDow) && !holidays.has(this.toDateString(current))) {
        current = this.setTimeOfDay(current, startMs);
      }
    }

    throw new Error('BUSINESS_CALENDAR_MAX_ITERATIONS: addBusinessDays exceeded safety limit.');
  }

  // ═══════════════════════════════════════════════════════════════
  // CALENDAR MANAGEMENT (admin-only)
  // ═══════════════════════════════════════════════════════════════

  /** Create a new business calendar. */
  async createCalendar(
    params: {
      name: string; timezone?: string; startTime?: string; endTime?: string;
      workingDays?: number[]; isDefault?: boolean;
    },
    changedBy: string | null,
  ): Promise<BusinessCalendarConfig> {
    const id = crypto.randomUUID();
    const cal = {
      id,
      name: params.name,
      timezone: params.timezone || 'UTC',
      startTime: params.startTime || '08:00:00',
      endTime: params.endTime || '18:00:00',
      workingDays: params.workingDays || [1, 2, 3, 4, 5],
      isDefault: params.isDefault || false,
      enabled: true,
      createdBy: changedBy,
    };

    await this.db.db.transaction(async (tx) => {
      await tx.insert(businessCalendars).values(cal);
      await tx.insert(businessCalendarAudit).values({
        id: crypto.randomUUID(),
        calendarId: id,
        action: 'CREATED',
        changedBy,
        newValue: { name: cal.name, timezone: cal.timezone, workingDays: cal.workingDays },
      });
    });

    return cal;
  }

  /** Add a holiday to a calendar. */
  async addHoliday(
    calendarId: string, holidayDate: string, description: string | null,
    changedBy: string | null,
  ): Promise<void> {
    const id = crypto.randomUUID();
    await this.db.db.transaction(async (tx) => {
      await tx.insert(businessCalendarHolidays).values({
        id, calendarId, holidayDate, description, createdBy: changedBy,
      });
      await tx.insert(businessCalendarAudit).values({
        id: crypto.randomUUID(),
        calendarId,
        action: 'HOLIDAY_ADDED',
        changedBy,
        newValue: { holidayDate, description },
      });
    });
  }

  /** Remove a holiday from a calendar. */
  async removeHoliday(
    calendarId: string, holidayDate: string, changedBy: string | null,
  ): Promise<void> {
    await this.db.db.transaction(async (tx) => {
      await tx.delete(businessCalendarHolidays).where(
        and(
          eq(businessCalendarHolidays.calendarId, calendarId),
          eq(businessCalendarHolidays.holidayDate, holidayDate),
        ),
      );
      await tx.insert(businessCalendarAudit).values({
        id: crypto.randomUUID(),
        calendarId,
        action: 'HOLIDAY_REMOVED',
        changedBy,
        oldValue: { holidayDate },
      });
    });
  }

  /** List all calendars. */
  async listCalendars(): Promise<BusinessCalendarConfig[]> {
    const rows = await this.db.db.query.businessCalendars.findMany({
      orderBy: [desc(businessCalendars.isDefault), businessCalendars.name],
    });
    return rows.map(r => this.toConfig(r));
  }

  /** Update an existing calendar. Validates and audits the change. */
  async updateCalendar(
    calendarId: string,
    updates: {
      name?: string; timezone?: string; startTime?: string; endTime?: string;
      workingDays?: number[]; isDefault?: boolean; enabled?: boolean;
    },
    changedBy: string | null,
  ): Promise<BusinessCalendarConfig> {
    const existing = await this.loadCalendar(calendarId);
    const oldValue: Record<string, unknown> = {};
    const newValue: Record<string, unknown> = {};

    if (updates.name !== undefined && updates.name !== existing.name) {
      oldValue['name'] = existing.name; newValue['name'] = updates.name;
    }
    if (updates.timezone !== undefined && updates.timezone !== existing.timezone) {
      oldValue['timezone'] = existing.timezone; newValue['timezone'] = updates.timezone;
    }
    if (updates.startTime !== undefined && updates.startTime !== existing.startTime) {
      oldValue['startTime'] = existing.startTime; newValue['startTime'] = updates.startTime;
    }
    if (updates.endTime !== undefined && updates.endTime !== existing.endTime) {
      oldValue['endTime'] = existing.endTime; newValue['endTime'] = updates.endTime;
    }
    if (updates.workingDays !== undefined && JSON.stringify(updates.workingDays) !== JSON.stringify(existing.workingDays)) {
      oldValue['workingDays'] = existing.workingDays; newValue['workingDays'] = updates.workingDays;
    }

    // Validate new working hours if changed
    const newStart = updates.startTime || existing.startTime;
    const newEnd = updates.endTime || existing.endTime;
    if (this.parseTimeMs(newStart) >= this.parseTimeMs(newEnd)) {
      throw new Error('BUSINESS_CALENDAR_MISCONFIGURED: start_time must be before end_time');
    }

    // Validate working days if changed
    const newDays = updates.workingDays || existing.workingDays;
    if (newDays.length === 0) {
      throw new Error('BUSINESS_CALENDAR_MISCONFIGURED: working days cannot be empty');
    }

    await this.db.db.transaction(async (tx) => {
      const setClause: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.name !== undefined) setClause['name'] = updates.name;
      if (updates.timezone !== undefined) setClause['timezone'] = updates.timezone;
      if (updates.startTime !== undefined) setClause['startTime'] = updates.startTime;
      if (updates.endTime !== undefined) setClause['endTime'] = updates.endTime;
      if (updates.workingDays !== undefined) setClause['workingDays'] = updates.workingDays;
      if (updates.isDefault !== undefined) setClause['isDefault'] = updates.isDefault;
      if (updates.enabled !== undefined) setClause['enabled'] = updates.enabled;

      await tx.update(businessCalendars).set(setClause).where(eq(businessCalendars.id, calendarId));

      if (Object.keys(newValue).length > 0) {
        await tx.insert(businessCalendarAudit).values({
          id: crypto.randomUUID(),
          calendarId,
          action: 'UPDATED',
          changedBy,
          oldValue,
          newValue,
        });
      }
    });

    return this.loadCalendar(calendarId);
  }

  /** List holidays for a calendar. */
  async listHolidays(calendarId: string): Promise<HolidayEntry[]> {
    const holidays = await this.db.db.query.businessCalendarHolidays.findMany({
      where: eq(businessCalendarHolidays.calendarId, calendarId),
      orderBy: businessCalendarHolidays.holidayDate,
    });
    return holidays.map(h => ({
      id: h.id,
      calendarId: h.calendarId,
      holidayDate: h.holidayDate,
      description: h.description,
    }));
  }

  /** List audit entries for a calendar. */
  async listAudit(calendarId: string): Promise<Array<{
    id: string; calendarId: string; action: string; changedBy: string | null;
    oldValue: unknown; newValue: unknown; createdAt: string;
  }>> {
    const entries = await this.db.db.query.businessCalendarAudit.findMany({
      where: eq(businessCalendarAudit.calendarId, calendarId),
      orderBy: [desc(businessCalendarAudit.createdAt)],
      limit: 100,
    });
    return entries.map(e => ({
      id: e.id,
      calendarId: e.calendarId,
      action: e.action,
      changedBy: e.changedBy,
      oldValue: e.oldValue,
      newValue: e.newValue,
      createdAt: e.createdAt?.toISOString() ?? '',
    }));
  }

  // ═══════════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════════════

  private validateCalendar(cal: BusinessCalendarConfig): void {
    if (cal.workingDays.length === 0) {
      throw new Error(
        `BUSINESS_CALENDAR_MISCONFIGURED: Calendar "${cal.name}" has no working days.`,
      );
    }
    const startMs = this.parseTimeMs(cal.startTime);
    const endMs = this.parseTimeMs(cal.endTime);
    if (startMs >= endMs) {
      throw new Error(
        `BUSINESS_CALENDAR_MISCONFIGURED: Calendar "${cal.name}" has start_time >= end_time.`,
      );
    }
  }

  private toConfig(row: any): BusinessCalendarConfig {
    return {
      id: row.id,
      name: row.name,
      timezone: row.timezone,
      startTime: row.startTime,
      endTime: row.endTime,
      workingDays: row.workingDays,
      isDefault: row.isDefault,
      enabled: row.enabled,
    };
  }

  /** Get ISO day of week: 1=Mon, 2=Tue, ..., 7=Sun. */
  private getISODayOfWeek(date: Date): number {
    const day = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    return day === 0 ? 7 : day;
  }

  /** Get milliseconds since midnight UTC. */
  private getTimeOfDayMs(date: Date): number {
    return date.getUTCHours() * 3600000
      + date.getUTCMinutes() * 60000
      + date.getUTCSeconds() * 1000
      + date.getUTCMilliseconds();
  }

  /** Parse HH:MM:SS to milliseconds since midnight. */
  private parseTimeMs(timeStr: string): number {
    const parts = timeStr.split(':');
    const hStr: string = parts[0] !== undefined ? parts[0] : '0';
    const mStr: string = parts[1] !== undefined ? parts[1] : '0';
    const sStr: string = parts[2] !== undefined ? parts[2] : '0';
    return (parseInt(hStr, 10) || 0) * 3600000
      + (parseInt(mStr, 10) || 0) * 60000
      + (parseInt(sStr, 10) || 0) * 1000;
  }

  /** Set time-of-day on a Date (UTC) and return new Date. */
  private setTimeOfDay(date: Date, timeMs: number): Date {
    const result = new Date(Date.UTC(
      date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
    ));
    result.setTime(result.getTime() + timeMs);
    return result;
  }

  /** Advance to start of next day (00:00:00 UTC). */
  private startOfNextDay(date: Date): Date {
    return new Date(Date.UTC(
      date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1,
    ));
  }

  /** Format Date as YYYY-MM-DD string (UTC). */
  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
