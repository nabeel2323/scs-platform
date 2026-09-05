import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../common/database/database.service';
import { auditLogs } from './audit.schema';

/**
 * Audit trail writer (§3.9).
 *
 * `audit_logs` is append-only and enforces a CHECK on actor_type, so every
 * write is normalised here. Other modules may inject AuditService to record
 * domain-specific entries with before/after snapshots; the HTTP middleware
 * covers all mutating requests generically.
 */

export type AuditActorType = 'BUYER' | 'MERCHANT' | 'DRIVER' | 'ADMIN' | 'SYSTEM';

export interface AuditEntry {
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  orgId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/** HTTP context a service-layer caller can forward when it has no `req`. */
export interface AuditRequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

/** Role claim → actor_type. Unrecognised roles degrade to SYSTEM. */
const ROLE_TO_ACTOR_TYPE: Record<string, AuditActorType> = {
  SUPER_ADMIN: 'ADMIN',
  ADMIN: 'ADMIN',
  MODERATOR: 'ADMIN',
  MERCHANT_OWNER: 'MERCHANT',
  MERCHANT_STAFF: 'MERCHANT',
  BUYER: 'BUYER',
  DRIVER: 'DRIVER',
};

/** Column widths from migration 0002_platform — overlong values would fail the write. */
const ACTION_MAX = 60;
const RESOURCE_MAX = 60;
const USER_AGENT_MAX = 300;

const IP_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly db: DatabaseService) {}

  /** Maps a JWT role claim onto the actor_type CHECK constraint. */
  static actorTypeForRole(role?: string | null): AuditActorType {
    if (!role) return 'SYSTEM';
    return ROLE_TO_ACTOR_TYPE[role] ?? 'SYSTEM';
  }

  /**
   * Appends an audit row. Deliberately never throws: losing an audit entry is
   * a defect, but it must not fail the request that triggered it.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.db.db.insert(auditLogs).values({
        id: randomUUID(),
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        action: entry.action.slice(0, ACTION_MAX),
        resource: entry.resource.slice(0, RESOURCE_MAX),
        resourceId: entry.resourceId ?? null,
        orgId: entry.orgId ?? null,
        metadata: entry.metadata ?? {},
        ip: AuditService.normalizeIp(entry.ip),
        userAgent: entry.userAgent?.slice(0, USER_AGENT_MAX) ?? null,
      });
    } catch (err) {
      this.logger.error(
        `Audit write failed (${entry.action} ${entry.resource}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** `inet` rejects malformed input; proxy chains and unix sockets must not fail the write. */
  private static normalizeIp(ip?: string | null): string | null {
    if (!ip) return null;
    // Express reports IPv4-mapped IPv6 as ::ffff:127.0.0.1 — inet accepts it,
    // but a comma-separated X-Forwarded-For chain does not.
    const candidate = ip.split(',')[0]?.trim();
    if (!candidate || !IP_PATTERN.test(candidate)) return null;
    return candidate;
  }
}
