# Role and Permission Management Guide

**Version:** 1.1
**Last updated:** 19 November 2026
**Status:** Implemented & Unit Tested
**Current implementation:** `remediation/phase-0-1-tenant-security`

## Overview

The Role and Permission Management interface allows administrators to manage platform roles and their permission assignments. The system uses a Role-Based Access Control (RBAC) model where users receive permissions through their organization membership roles.

## Access

- **URL:** `/roles` (list), `/roles/:id` (detail)
- **Required Permission:** `admin:users:read` (to view), `admin:roles:write` (to edit role permissions)
- **Navigation:** Sidebar → Roles

## Role Model

```
User → Organization Membership → Role → Role Permissions
```

Users receive permissions through their active organization membership roles. Changing a user's permissions means changing the role assigned to their organization membership or editing the permissions associated with that role.

## Platform Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| SUPER_ADMIN | Platform super administrator | All permissions (protected) |
| ADMIN | Platform administrator | Most permissions including user management |
| MODERATOR | Content moderator | Moderation-related permissions |
| BUYER | Platform buyer | Buyer-specific permissions |
| MERCHANT_OWNER | Merchant organization owner | Merchant organization management |
| MERCHANT_STAFF | Merchant staff | Merchant operational permissions |
| FINANCE | Finance role | Financial permissions |
| DRIVER | Delivery driver | Delivery-related permissions |

## Permission Management

### Viewing Role Permissions

Navigate to `/roles/:id` to view a role's complete permission list. Permissions are displayed with:
- Permission key (e.g., `admin:users:read`)
- Human-readable description
- Domain/category

### Editing Role Permissions

Administrators with `admin:roles:write` can edit role permissions:

1. Navigate to `/roles/:id`
2. Select/deselect permissions
3. Click **Save Permissions**

**Security:**
- `SUPER_ADMIN` role permissions are protected and cannot be modified
- `admin:roles:write` is only assigned to `SUPER_ADMIN` and `ADMIN` roles
- All permission changes are audited with before/after values

### Permission Catalog

The permission catalog (`GET /v1/admin/permissions`) lists all available permissions grouped by domain:

- **Administration:** User management, role management, system configuration
- **Users:** User creation, status changes, profile updates
- **Organizations:** Organization creation, membership management
- **Catalog:** Product, category, brand management
- **Orders:** Order management, fulfillment
- **And more...**

## Security Boundaries

### Merchant Restrictions

Merchant users (`MERCHANT_OWNER`, `MERCHANT_STAFF`) cannot:
- Assign `SUPER_ADMIN`, `ADMIN`, or `MODERATOR` roles
- Manage platform-level permissions
- Access admin user management

### Privilege Escalation Protection

- Administrators cannot grant privileges above their own authority
- `SUPER_ADMIN` role assignment requires explicit authorization
- Users cannot escalate their own privileges
- The last active `SUPER_ADMIN` cannot be removed or demoted

### Tenant Isolation

- Organization A administrators cannot manipulate Organization B memberships
- Role assignments are scoped to specific organizations
- Cross-organization membership manipulation is prevented
- **Membership removal** (`removeRole`): Organization-scoped admins may only remove memberships within organizations they are members of. Platform-scoped admins (holding `admin:roles:write`) may remove memberships in any organization. Merchant users may never remove platform role memberships (SUPER_ADMIN, ADMIN, MODERATOR).

### Concurrency Safety

All security-critical mutations use database transactions with PostgreSQL `FOR UPDATE` row locking:

| Operation | Locking Strategy |
|-----------|-----------------|
| User status change | `FOR UPDATE` on user + SUPER_ADMIN membership rows |
| Membership removal | `FOR UPDATE` on target membership + SUPER_ADMIN membership rows |
| Role permission update | `FOR UPDATE` on role row |

Concurrent updates to the same role or user are serialized. The second transaction waits for the first to commit, then operates on the updated state. This prevents lost updates and write-skew anomalies.

## Audit Events

- `ROLE_PERMISSIONS_UPDATED` — Role permissions changed
- Includes: actor ID, role ID, before/after permission keys, timestamp

## Limitations

- Role creation/deletion is not supported (roles are seeded)
- Permission creation/deletion is not supported (permissions are seeded)
- Direct user permission assignments (bypassing roles) are not supported
- Role inheritance/hierarchy is not supported

## Product Moderation Access

Viewing the Admin Products list and changing a product are separate permissions. `admin:merchants:read` allows a user to inspect the product moderation list and detail; `admin:products:moderate` is required to approve, reject or archive a product. The seeded SUPER_ADMIN, ADMIN and MODERATOR roles receive the moderation permission. A custom read-only role must not receive it.

The Admin UI hides moderation actions when the permission is absent, but the API guard is authoritative. The RBAC seed adds the permission and role mappings idempotently; the release workflow runs the seed after migrations. Existing JWT permission claims are snapshots, so users may need to refresh their session after the seed is applied.