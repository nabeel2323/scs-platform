# Admin User Management Guide

**Version:** 1.0
**Status:** Implemented & Unit Tested
**Branch:** `feature/admin-user-management-rbac-2026`

## Overview

The Admin User Management interface provides platform administrators with tools to view, search, create, and manage platform users and their organization memberships.

## Access

- **URL:** `/users`
- **Required Permission:** `admin:users:read` (to view), `admin:users:write` (to modify)
- **Navigation:** Sidebar → Users

## Features

### User Listing

The user listing page provides:

- **Search:** Search by name, email, or phone
- **Filters:** Filter by account status (ACTIVE/SUSPENDED/INACTIVE), role, organization, and email verification state
- **Sorting:** Sort by any column
- **Pagination:** Server-side pagination with configurable page size
- **Summary:** User count and status distribution

### Create User

Administrators with `admin:users:write` can create new platform users:

1. Click **"Create User"** button
2. Fill in: Full Name, Email, Phone, Locale, Initial Status
3. Optionally assign an Organization and Role
4. Click **Create User**

**Security:**
- Email and phone uniqueness is enforced server-side
- User accounts are created with `emailVerifiedAt: null` (unverified)
- All user creation is audited (actor, timestamp, before/after values)
- No plaintext passwords are stored or exposed

### User Detail

Click **View** on any user row to see their complete profile:

**Overview Tab:**
- User ID, Full Name, Email, Phone
- Account Status, Email Verification status
- Locale, Registration date, Last updated

**Organizations Tab:**
- All organization memberships
- Organization name, type, role, membership status
- Add/remove memberships (requires `admin:users:write`)
- Change role on existing membership

**Permissions Tab:**
- Effective permissions granted through active organization roles
- Permissions grouped by domain (Administration, Users, Organizations, etc.)
- Permission key, description, source role

## API Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/v1/admin/users` | `admin:users:read` | List users with search/filter/pagination |
| GET | `/v1/admin/users/:id` | `admin:users:read` | Get user detail with org memberships |
| PATCH | `/v1/admin/users/:id` | `admin:users:write` | Change user status |
| PATCH | `/v1/admin/users/:id/profile` | `admin:users:write` | Update user profile fields |
| POST | `/v1/admin/users` | `admin:users:write` | Create new user |
| POST | `/v1/admin/users/:id/assign-role` | `admin:users:write` | Assign role to user in org |
| DELETE | `/v1/admin/users/:id/roles/:orgId` | `admin:users:write` | Remove org membership |

## Audit Events

All sensitive actions are audited:

- `USER_CREATED` — User account created
- `USER_PROFILE_UPDATED` — Profile fields changed
- `USER_STATUS_CHANGED` — Account status changed (ACTIVE/SUSPENDED/INACTIVE)
- `ORG_MEMBERSHIP_ADDED` — Organization membership created
- `ORG_MEMBERSHIP_REMOVED` — Organization membership removed
- `ROLE_ASSIGNED` — Role assigned to membership
- `ROLE_CHANGED` — Role changed on membership

Audit records include: actor ID, target user ID, organization context, action, timestamp, before/after values (secrets excluded).

## Limitations

- User creation does not send invitation emails (email channel not yet integrated with notification provider)
- Password reset is not available from the admin UI
- Bulk user operations are not supported
- User impersonation is not supported

## Concurrency Safety

All security-critical mutations use database transactions with PostgreSQL `FOR UPDATE` row locking:

| Operation | Locking Strategy |
|-----------|-----------------|
| User status change | `FOR UPDATE` on user + SUPER_ADMIN membership rows |
| Membership removal | `FOR UPDATE` on target membership + SUPER_ADMIN membership rows |

The last active SUPER_ADMIN cannot be deactivated or removed. Concurrent attempts serialize via row locking, so only one transaction can evaluate the SUPER_ADMIN count at a time. If the protection check fails, the transaction is rolled back and a `400 Bad Request` is returned.
