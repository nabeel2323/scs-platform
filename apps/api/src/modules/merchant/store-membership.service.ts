import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { storeMembers, stores } from './merchant.schema';
import { organizationMembers, users } from '../identity/identity.schema';
import { eq, and, sql } from 'drizzle-orm';
import { isTenantPrivileged, type CallerContext } from '../../common/tenant-scope';
import crypto from 'node:crypto';

/**
 * Store Membership Service (P7)
 *
 * Manages store_members lifecycle: add, remove, role change, activate, deactivate.
 * All mutations are atomic with their outbox event.
 * Last-owner invariant is enforced via SELECT ... FOR UPDATE.
 */
@Injectable()
export class StoreMembershipService {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxDispatcher,
  ) {}

  // ── Read ──────────────────────────────────────────────────────

  async listMembers(storeId: string) {
    return this.db.db.query.storeMembers.findMany({
      where: eq(storeMembers.storeId, storeId),
      columns: { id: true, storeId: true, userId: true, role: true, status: true, createdAt: true, updatedAt: true },
      orderBy: (members, { asc }) => [asc(members.createdAt)],
    });
  }

  async getMember(storeId: string, userId: string) {
    const member = await this.db.db.query.storeMembers.findFirst({
      where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)),
    });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  // ── Add Member ────────────────────────────────────────────────

  async addMember(
    storeId: string,
    targetUserId: string,
    role: string,
    caller: CallerContext,
  ) {
    if (!['OWNER', 'ADMIN', 'MEMBER'].includes(role)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }

    // Verify store exists and get orgId
    const store = await this.db.db.query.stores.findFirst({
      where: eq(stores.id, storeId),
      columns: { id: true, orgId: true },
    });
    if (!store) throw new NotFoundException('Store not found');

    // Non-privileged callers: verify target user is in the same organization
    if (!isTenantPrivileged(caller)) {
      const orgMember = await this.db.db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.orgId, store.orgId),
          eq(organizationMembers.userId, targetUserId),
          eq(organizationMembers.status, 'ACTIVE'),
        ),
        columns: { id: true },
      });
      if (!orgMember) {
        throw new ForbiddenException('Target user must belong to the same organization');
      }
    }

    return this.db.db.transaction(async (tx) => {
      // Check uniqueness within transaction
      const existing = await tx.query.storeMembers.findFirst({
        where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, targetUserId)),
        columns: { id: true, status: true },
      });
      if (existing) {
        if (existing.status === 'ACTIVE') {
          throw new ConflictException('User is already an active member of this store');
        }
        // Reactivate inactive membership
        const [updated] = await tx.update(storeMembers)
          .set({ status: 'ACTIVE', role, updatedAt: new Date() })
          .where(eq(storeMembers.id, existing.id))
          .returning();

        await this.outbox.publish(
          'store_member.activated',
          storeId,
          { target_user_id: targetUserId, actor_user_id: caller.sub, new_status: 'ACTIVE', new_role: role },
          { organization_id: store.orgId, store_id: storeId },
          null,
          tx,
        );
        return updated;
      }

      const id = crypto.randomUUID();
      const [created] = await tx.insert(storeMembers).values({
        id,
        storeId,
        userId: targetUserId,
        role,
        status: 'ACTIVE',
      }).returning();

      await this.outbox.publish(
        'store_member.added',
        storeId,
        { target_user_id: targetUserId, actor_user_id: caller.sub, new_role: role },
        { organization_id: store.orgId, store_id: storeId },
        null,
        tx,
      );
      return created;
    });
  }

  // ── Remove Member ─────────────────────────────────────────────

  async removeMember(storeId: string, targetUserId: string, caller: CallerContext) {
    return this.db.db.transaction(async (tx) => {
      // Lock all ACTIVE OWNER rows for this store
      const activeOwners = await tx.select({ id: storeMembers.id, userId: storeMembers.userId })
        .from(storeMembers)
        .where(and(
          eq(storeMembers.storeId, storeId),
          eq(storeMembers.role, 'OWNER'),
          eq(storeMembers.status, 'ACTIVE'),
        ))
        .for('update');

      const target = await tx.query.storeMembers.findFirst({
        where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, targetUserId)),
      });
      if (!target) throw new NotFoundException('Member not found');

      // Last-owner protection
      if (target.role === 'OWNER' && target.status === 'ACTIVE' && activeOwners.length <= 1) {
        throw new ConflictException('Cannot remove the last active owner of a store');
      }

      // Self-removal: allowed unless last OWNER (already checked above)
      await tx.delete(storeMembers).where(eq(storeMembers.id, target.id));

      const store = await tx.query.stores.findFirst({
        where: eq(stores.id, storeId), columns: { orgId: true },
      });

      await this.outbox.publish(
        'store_member.removed',
        storeId,
        { target_user_id: targetUserId, actor_user_id: caller.sub, previous_role: target.role, previous_status: target.status },
        { organization_id: store?.orgId, store_id: storeId },
        null,
        tx,
      );
      return { deleted: true };
    });
  }

  // ── Change Role ───────────────────────────────────────────────

  async changeRole(storeId: string, targetUserId: string, newRole: string, caller: CallerContext) {
    if (!['OWNER', 'ADMIN', 'MEMBER'].includes(newRole)) {
      throw new BadRequestException(`Invalid role: ${newRole}`);
    }

    // Self-role-change denied
    if (caller.sub === targetUserId) {
      throw new ForbiddenException('Cannot change your own role');
    }

    return this.db.db.transaction(async (tx) => {
      // Lock ACTIVE OWNER rows
      const activeOwners = await tx.select({ id: storeMembers.id, userId: storeMembers.userId })
        .from(storeMembers)
        .where(and(
          eq(storeMembers.storeId, storeId),
          eq(storeMembers.role, 'OWNER'),
          eq(storeMembers.status, 'ACTIVE'),
        ))
        .for('update');

      const target = await tx.query.storeMembers.findFirst({
        where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, targetUserId)),
      });
      if (!target) throw new NotFoundException('Member not found');

      const previousRole = target.role;
      if (previousRole === newRole) {
        throw new ConflictException('Member already has this role');
      }

      // Last-owner protection: demoting an OWNER
      if (previousRole === 'OWNER' && target.status === 'ACTIVE' && activeOwners.length <= 1) {
        throw new ConflictException('Cannot demote the last active owner of a store');
      }

      await tx.update(storeMembers)
        .set({ role: newRole, updatedAt: new Date() })
        .where(eq(storeMembers.id, target.id));

      const store = await tx.query.stores.findFirst({
        where: eq(stores.id, storeId), columns: { orgId: true },
      });

      await this.outbox.publish(
        'store_member.role_changed',
        storeId,
        {
          target_user_id: targetUserId,
          actor_user_id: caller.sub,
          previous_role: previousRole,
          new_role: newRole,
        },
        { organization_id: store?.orgId, store_id: storeId },
        null,
        tx,
      );
      return { userId: targetUserId, previousRole, newRole };
    });
  }

  // ── Activate ──────────────────────────────────────────────────

  async activateMember(storeId: string, targetUserId: string, caller: CallerContext) {
    return this.db.db.transaction(async (tx) => {
      const target = await tx.query.storeMembers.findFirst({
        where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, targetUserId)),
      });
      if (!target) throw new NotFoundException('Member not found');

      if (target.status === 'ACTIVE') {
        throw new ConflictException('Member is already active');
      }

      await tx.update(storeMembers)
        .set({ status: 'ACTIVE', updatedAt: new Date() })
        .where(eq(storeMembers.id, target.id));

      const store = await tx.query.stores.findFirst({
        where: eq(stores.id, storeId), columns: { orgId: true },
      });

      await this.outbox.publish(
        'store_member.activated',
        storeId,
        {
          target_user_id: targetUserId,
          actor_user_id: caller.sub,
          previous_status: 'INACTIVE',
          new_status: 'ACTIVE',
        },
        { organization_id: store?.orgId, store_id: storeId },
        null,
        tx,
      );
      return { userId: targetUserId, status: 'ACTIVE' };
    });
  }

  // ── Deactivate ────────────────────────────────────────────────

  async deactivateMember(storeId: string, targetUserId: string, caller: CallerContext) {
    return this.db.db.transaction(async (tx) => {
      // Lock ACTIVE OWNER rows
      const activeOwners = await tx.select({ id: storeMembers.id, userId: storeMembers.userId })
        .from(storeMembers)
        .where(and(
          eq(storeMembers.storeId, storeId),
          eq(storeMembers.role, 'OWNER'),
          eq(storeMembers.status, 'ACTIVE'),
        ))
        .for('update');

      const target = await tx.query.storeMembers.findFirst({
        where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, targetUserId)),
      });
      if (!target) throw new NotFoundException('Member not found');

      if (target.status === 'INACTIVE') {
        throw new ConflictException('Member is already inactive');
      }

      // Last-owner protection
      if (target.role === 'OWNER' && activeOwners.length <= 1) {
        throw new ConflictException('Cannot deactivate the last active owner of a store');
      }

      await tx.update(storeMembers)
        .set({ status: 'INACTIVE', updatedAt: new Date() })
        .where(eq(storeMembers.id, target.id));

      const store = await tx.query.stores.findFirst({
        where: eq(stores.id, storeId), columns: { orgId: true },
      });

      await this.outbox.publish(
        'store_member.deactivated',
        storeId,
        {
          target_user_id: targetUserId,
          actor_user_id: caller.sub,
          previous_status: 'ACTIVE',
          new_status: 'INACTIVE',
        },
        { organization_id: store?.orgId, store_id: storeId },
        null,
        tx,
      );
      return { userId: targetUserId, status: 'INACTIVE' };
    });
  }

  // ── Authorization Helpers ─────────────────────────────────────

  /**
   * Verify the caller has permission to manage memberships in this store.
   * Returns the caller's store membership role (or null for privileged).
   */
  async assertCanManageMembers(storeId: string, caller: CallerContext): Promise<string | null> {
    // Privileged roles bypass
    if (isTenantPrivileged(caller)) return null;

    const membership = await this.db.db.query.storeMembers.findFirst({
      where: and(
        eq(storeMembers.storeId, storeId),
        eq(storeMembers.userId, caller.sub),
        eq(storeMembers.status, 'ACTIVE'),
      ),
      columns: { role: true },
    });

    if (!membership) {
      throw new ForbiddenException('You are not an active member of this store');
    }

    // Only OWNER and ADMIN can manage memberships
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      throw new ForbiddenException('Only store owners and admins can manage memberships');
    }

    return membership.role;
  }

  /**
   * Verify the caller can perform a specific membership operation on the target.
   * Enforces the full role matrix from BD-P7-01.
   */
  async assertCanModifyMember(
    storeId: string,
    caller: CallerContext,
    targetUserId: string,
    operation: 'add' | 'remove' | 'role_change' | 'activate' | 'deactivate',
    targetRole?: string,
    newRole?: string,
  ): Promise<void> {
    // Privileged roles can do anything
    if (isTenantPrivileged(caller)) return;

    const callerMembership = await this.db.db.query.storeMembers.findFirst({
      where: and(
        eq(storeMembers.storeId, storeId),
        eq(storeMembers.userId, caller.sub),
        eq(storeMembers.status, 'ACTIVE'),
      ),
      columns: { role: true },
    });

    if (!callerMembership) {
      throw new ForbiddenException('You are not an active member of this store');
    }

    const callerRole = callerMembership.role;

    // MEMBER cannot modify anything
    if (callerRole === 'MEMBER') {
      throw new ForbiddenException('Members cannot modify memberships');
    }

    // Get target membership (if exists)
    let targetMembership = null;
    if (operation !== 'add') {
      targetMembership = await this.db.db.query.storeMembers.findFirst({
        where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, targetUserId)),
        columns: { role: true, status: true },
      });
      if (!targetMembership) throw new NotFoundException('Target member not found');
    }

    // Self-modification rules
    const isSelf = caller.sub === targetUserId;
    if (isSelf) {
      // Self-role-change: always denied
      if (operation === 'role_change') {
        throw new ForbiddenException('Cannot change your own role');
      }
      // Self-remove and self-deactivate: allowed (last-owner check happens in the mutation)
      if (operation === 'remove' || operation === 'deactivate') {
        return; // Allowed; last-owner check in mutation method
      }
      // Self-activate: allowed
      if (operation === 'activate') {
        return;
      }
    }

    // ADMIN restrictions
    if (callerRole === 'ADMIN') {
      // Cannot touch OWNERs
      if (targetMembership?.role === 'OWNER') {
        throw new ForbiddenException('Store admins cannot modify store owners');
      }
      // Cannot touch other ADMINs (except view)
      if (targetMembership?.role === 'ADMIN' && operation !== 'add') {
        throw new ForbiddenException('Store admins cannot modify other admins');
      }
      // Can only add MEMBERs
      if (operation === 'add' && newRole && newRole !== 'MEMBER') {
        throw new ForbiddenException('Store admins can only add members');
      }
      // Can only change MEMBER role
      if (operation === 'role_change' && targetRole && targetRole !== 'MEMBER') {
        throw new ForbiddenException('Store admins can only change member roles');
      }
    }

    // OWNER can do everything (last-owner check in mutation method)
  }

  /**
   * List organization users available to add as store members.
   * Excludes existing active members of the store.
   */
  async listEligibleUsers(storeId: string, orgId: string) {
    // Get existing store member user IDs
    const existingMembers = await this.db.db.query.storeMembers.findMany({
      where: eq(storeMembers.storeId, storeId),
      columns: { userId: true },
    });
    const existingIds = new Set(existingMembers.map(m => m.userId));

    // Get all org members
    const orgMembers = await this.db.db.query.organizationMembers.findMany({
      where: eq(organizationMembers.orgId, orgId),
      columns: { userId: true, status: true },
    });

    // Filter out existing members
    const eligibleIds = orgMembers
      .filter(m => !existingIds.has(m.userId))
      .map(m => m.userId);

    if (eligibleIds.length === 0) return [];

    // Fetch user details
    const eligibleUsers = await this.db.db.query.users.findMany({
      where: sql`${users.id} IN (${sql.join(eligibleIds.map(id => sql`${id}`), sql`, `)})`,
      columns: { id: true, email: true, fullName: true },
    });

    return eligibleUsers;
  }
}
