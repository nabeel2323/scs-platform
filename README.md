# Smart Commerce & Supply Platform

B2B-first marketplace — NestJS Modular Monolith, Flutter, Next.js, PostgreSQL 16 + PostGIS, Redis 7.

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment template
cp .env.example .env.local

# 3. Start infrastructure (Postgres+PostGIS, Redis, MinIO, Mailhog)
pnpm infra:up

# 4. Run migrations + seed
pnpm db:migrate
pnpm db:seed

# 5. Start API (NestJS on :3000)
pnpm --filter @scs/api dev

# 6. Open API docs
open http://localhost:3000/docs
```

## Repository Structure

```
scs-platform/
├── apps/
│   ├── api/                    # NestJS modular monolith
│   │   └── src/modules/        # 16 bounded-context modules
│   ├── web/                    # Next.js retailer/merchant app
│   └── admin/                  # Next.js admin console
├── packages/
│   ├── contracts/              # zod → OpenAPI 3.1 → generated clients
│   ├── ui-kit/                 # web design system
│   ├── event-types/            # domain + analytics event schemas
│   └── env/                    # zod-validated environment schemas
├── mobile/                     # Flutter (4 flavors)
├── infra/
│   ├── docker-compose.dev.yml  # local dev environment
│   ├── drizzle/migrations/     # SQL migrations (forward-only)
│   ├── load/                   # k6 load test scripts
│   └── ci/                     # pipeline definitions
└── docs/                       # ADRs, module READMEs, runbooks
```

## Engineering Decisions

| # | Decision | Choice |
|---|---|---|
| E1 | Monorepo | pnpm workspaces + Turborepo |
| E2 | ORM | Drizzle ORM + drizzle-kit (per-module schemas) |
| E3 | Contracts | zod → OpenAPI 3.1 → generated TS/Dart clients |
| E4 | Feature flags | `flags` table + typed client |
| E5 | Partitions | pg_partman for time-series tables |
| E6 | Boundary lint | eslint-plugin-boundaries in CI |
| E7 | Load testing | k6 scripts in infra/load/ |

## Key Commands

```bash
pnpm dev                    # Start all apps in dev mode
pnpm build                  # Build all packages
pnpm test                   # Run all tests
pnpm lint                   # Lint all packages
pnpm typecheck              # Type-check all packages
pnpm format                 # Format with Prettier
pnpm db:migrate             # Run database migrations
pnpm db:seed                # Seed test data
pnpm contracts:generate     # Generate OpenAPI spec from zod schemas
pnpm infra:up               # Start Docker services
pnpm infra:down             # Stop Docker services
```

## Module Boundaries

Each module owns its tables, events, and public service surface. Cross-module calls go through exported application services only. Side effects use the transactional outbox pattern.

```
identity → merchant → catalog → inventory → pricing → orders → reviews
                                                              ↓
                                                        notifications
                                                        analytics
                                                        audit
```

## Documentation

- [Development & Implementation Plan](./Smart_Commerce_Development_Implementation_Plan.md) — developer-ready specification
- [Implementation & UX Plan](./Smart_Commerce_Platform_Implementation_and_UX_Plan.md) — architecture + design strategy
- [Capacity Analysis](./Smart_Commerce_Capacity_Analysis.html) — infrastructure sizing per phase
- [Progress Tracker](./Smart_Commerce_Implementation_Progress.md) — living task tracker

## License

Proprietary. All rights reserved.
