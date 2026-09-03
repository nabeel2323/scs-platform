-- ============================================================
-- Migration 0001: Identity & Access
-- ============================================================
-- Phone-first identity with multi-org support.
-- UUIDv7 primary keys (generated in app layer).
-- All timestamps timestamptz UTC.
-- Statuses as varchar + CHECK constraint.
-- ============================================================

-- ── Users ────────────────────────────────────────────────────
create table users (
  id         uuid primary key,
  phone      varchar(20) not null unique,
  email      varchar(254) unique,
  full_name  varchar(160) not null,
  locale     varchar(10) not null default 'en',
  status     varchar(12) not null default 'ACTIVE'
             check (status in ('ACTIVE','SUSPENDED','DELETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Organizations ────────────────────────────────────────────
create table organizations (
  id                  uuid primary key,
  type                varchar(12) not null
                      check (type in ('WHOLESALER','RETAILER','LOGISTICS','PLATFORM')),
  name                varchar(160) not null,
  legal_name          varchar(200),
  tax_id              varchar(64),
  country             char(2) not null,
  verification_status varchar(12) not null default 'PENDING'
                      check (verification_status in ('PENDING','IN_REVIEW','VERIFIED','REJECTED','SUSPENDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizations_type_idx on organizations (type, verification_status);

-- ── Roles ────────────────────────────────────────────────────
create table roles (
  id    uuid primary key,
  key   varchar(40) not null unique,
  name  varchar(80) not null
);

-- ── Permissions ──────────────────────────────────────────────
create table permissions (
  id  uuid primary key,
  key varchar(64) not null unique
);

-- ── Role ↔ Permissions ───────────────────────────────────────
create table role_permissions (
  role_id       uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- ── Organization Members ─────────────────────────────────────
create table organization_members (
  id         uuid primary key,
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  role_id    uuid not null references roles(id),
  status     varchar(12) not null default 'ACTIVE'
             check (status in ('ACTIVE','INVITED','REVOKED')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

-- ── Sessions (refresh-token chain with rotation + reuse detection) ──
create table sessions (
  id          uuid primary key,
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  char(64) not null unique,
  device      varchar(160),
  ip          inet,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  replaced_by uuid references sessions(id),
  created_at  timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id) where revoked_at is null;
