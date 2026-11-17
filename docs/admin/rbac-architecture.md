# RBAC Architecture and Authorization Guide

**Version:** 1.0
**Status:** Implemented
**Branch:** `feature/admin-user-management-rbac-2026`

## Overview

The SCS Platform uses Role-Based Access Control (RBAC) to manage authorization across the platform. Users receive permissions through their organization membership roles, not through direct permission assignments.

## Architecture

### Permission Model

```
User → Organization Membership → Role → Role Permissions
```

Each permission is represented by a stable key (e.g., `admin:users:read`, `catalog:products:write`). Permissions are grouped into roles, and roles are assigned to users through organization memberships.

### Permission Domains

Permissions are organized by domain (module prefix before the first colon):

| Domain | Description |
|--------|-------------|
| `admin` | Platform administration |
| `auth` | Authentication and authorization |
| `catalog` | Product catalog management |
| `orders` | Order management |
| `fulfillment` | Shipping and delivery |
| `finance` | Financial operations |
| `support` | Customer support |
| `audit` | Audit and compliance |
| `whatsapp` | WhatsApp messaging |
| `sms` | SMS messaging |

## Provider Registration

Permissions are registered in the RBAC seed data (`apps/api/src/common/database/rbac-seed.data.ts`). The seed defines:

1. **Permissions** — Unique permission keys with descriptions
2. **Roles** — Role definitions with assigned permission keys
3. **Role Assignments** — Which permissions belong to which roles

Adding a new permission requires:
1. Adding the permission key to the `PERMISSIONS` array
2. Assigning it to appropriate roles in the `ROLES` array
3. Running the seed migration

## Authorization Enforcement

### Server-Side Enforcement

All authorization is enforced on the server side using NestJS guards:

- **`JwtAuthGuard`** — Validates JWT authentication
- **`PermissionsGuard`** — Checks required permissions
- **`@RequirePermission()`** — Decorator for endpoint-level permission checks

### Client-Side Enforcement

The admin UI hides unauthorized actions using `useRequirePerms()` hook, but this is UX-only — server-side enforcement is authoritative.

### Channel Permissions

The `OTP_CHANNELS` environment variable controls which OTP channels are permitted. This is a separate permission layer from RBAC.

## Security Boundaries

### Platform Role Protection

| Role | Can Assign | Cannot Assign |
|------|-----------|---------------|
| SUPER_ADMIN | All roles | — |
| ADMIN | Most roles | SUPER_ADMIN |
| MODERATOR | Limited roles | Platform roles |
| MERCHANT_OWNER | Merchant roles only | Platform roles |

### Last SUPER_ADMIN Protection

The last active SUPER_ADMIN cannot be:
- Removed from their organization
- Demoted to a lower role
- Have their SUPER_ADMIN role revoked

This prevents accidental lockout from platform administration.

### Tenant Isolation

Organization memberships are tenant-scoped:
- Organization A admins cannot view Organization B users
- Organization A admins cannot assign roles in Organization B
- Role assignments are validated against organization membership
- **Membership removal** (`removeRole`): Organization-scoped admins may only remove memberships within organizations they are members of. Platform-scoped admins (holding `admin:roles:write`) may remove memberships in any organization. Merchant users may never remove platform role memberships (SUPER_ADMIN, ADMIN, MODERATOR).

### Concurrency Safety

All security-critical mutations use database transactions with PostgreSQL `FOR UPDATE` row locking to prevent write skew and race conditions:

| Operation | Locking Strategy | Protection |
|-----------|-----------------|------------|
| User status change (`updateUserStatus`) | `FOR UPDATE` on user row + all SUPER_ADMIN membership rows | Prevents concurrent deactivation of the last two SUPER_ADMINs |
| Membership removal (`removeRole`) | `FOR UPDATE` on target membership row + all SUPER_ADMIN membership rows | Prevents concurrent removal of the last SUPER_ADMIN membership |
| Role permission update (`updateRolePermissions`) | `FOR UPDATE` on role row | Serializes concurrent permission edits to the same role |

### Concurrency Strategy: Last SUPER_ADMIN Protection

The platform must always have at least one active SUPER_ADMIN. To prevent race conditions where two administrators simultaneously deactivate the last two SUPER_ADMIN accounts:

1. **Row locking**: Before checking the SUPER_ADMIN count, all active SUPER_ADMIN membership rows are locked with `SELECT ... FOR UPDATE`
2. **Transactional check**: The count check and the status/membership update occur within the same database transaction
3. **Serialization**: Only one transaction can hold the locks at a time, so the second transaction sees the updated count after the first commits
4. **Rollback on violation**: If the protection check fails, the entire transaction is rolled back and a `409 Conflict` or `400 Bad Request` is returned

This prevents the write-skew anomaly where Transaction A reads count=2 and Transaction B reads count=2, then both proceed to deactivate their respective SUPER_ADMINs, leaving zero SUPER_ADMINs.

### Role-Permission Update Concurrency

Role permission updates use `FOR UPDATE` locking on the role row to serialize concurrent edits:

1. The role row is locked with `SELECT ... FOR UPDATE` inside a transaction
2. Current permissions are re-read inside the transaction (after the lock is held)
3. The delete+insert of role-permission assignments occurs inside the same transaction
4. Concurrent updates to the same role are serialized — the second transaction waits for the first to commit, then operates on the updated permission set

This prevents lost updates where two administrators simultaneously edit the same role's permissions and the second write silently overwrites the first.

## Audit Logging

All authorization-relevant actions are audited:

| Action | Audit Event |
|--------|-------------|
| User created | `USER_CREATED` |
| User profile updated | `USER_PROFILE_UPDATED` |
| User status changed | `USER_STATUS_CHANGED` |
| Role assigned | `ROLE_ASSIGNED` |
| Role changed | `ROLE_CHANGED` |
| Role permissions updated | `ROLE_PERMISSIONS_UPDATED` |
| Organization membership added | `ORG_MEMBERSHIP_ADDED` |
| Organization membership removed | `ORG_MEMBERSHIP_REMOVED` |
| Privileged role granted | `PRIVILEGED_ROLE_GRANTED` |
| Privileged role revoked | `PRIVILEGED_ROLE_REVOKED` |

Audit records exclude: passwords, OTPs, access tokens, refresh tokens, invitation secrets, API credentials.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OTP_CHANNELS` | Comma-separated list of permitted OTP channels | Yes |
| `FLAG_AUTH_EMAIL_OTP` | Enables email OTP feature | Yes (for email OTP) |
| `OTP_HMAC_SECRET` | Secret for OTP HMAC signing | Yes (production) |

## Limitations

- Direct user permission assignments (bypassing roles) are not supported
- Role inheritance/hierarchy is not supported
- Time-limited role assignments are not supported
- Conditional permissions (e.g., "can edit own profile") are not supported

## Merchant Organization Onboarding Authorization

Newly registered users without an organization membership receive the `BUYER` role and its permission set in their access-token claims. Merchant registration must therefore be able to create the first organization before the user can receive the `MERCHANT_OWNER` membership role.

The platform separates these capabilities:

| Permission | Purpose | BUYER |
|------------|---------|-------|
| `identity:organizations:create` | Start organization onboarding by creating a new organization | Granted |
| `identity:organizations:write` | Administer an existing organization, including updates and membership operations | Not granted |

`POST /v1/organizations` requires `identity:organizations:create`. Organization updates, membership management, and organization update requests continue to require `identity:organizations:write`. The creation permission does not authorize a buyer to manage another organization's members or settings.

Migration `0069_organization_onboarding_permission.sql` registers the new permission and grants it idempotently to `BUYER` plus every existing role that already held `identity:organizations:write`, preserving prior organization-creation access. The API seed definition mirrors the grants for fresh installations. After organization creation, the creator is assigned the `MERCHANT_OWNER` membership and the web onboarding flow switches to that organization to obtain the corresponding merchant permission claims.
