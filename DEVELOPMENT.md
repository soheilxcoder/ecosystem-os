# Development guide

How to run, test and extend **Ecosystem OS**. The product specification lives in
the numbered markdown files (`00`–`15`); this file is the engineering entry point.

---

## 1. Quick start

```bash
npm install          # install dependencies
npm run db:reset     # create the local database, migrate, seed demo data
npm run dev          # start the API (4000) and the web app (3000)
```

Then open http://localhost:3000 and sign in as any seeded persona
(e.g. `lena@example.org` — Pod Lead of Pod Atlas).

Useful scripts:

| Script | What it does |
|---|---|
| `npm run dev` | API + web app together |
| `npm run dev:api` / `npm run dev:web` | Start one of them |
| `npm test` | Full test suite (unit + integration, real PostgreSQL) |
| `npm run test:unit` / `npm run test:integration` | One half of the suite |
| `npm run typecheck` | `tsc --noEmit` across app, server, core and db |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Re-seed the demo organisation (deterministic) |
| `npm run db:reset` | Drop the local database, migrate, re-seed |
| `npm run db:studio` | Print table counts, users and pods |

---

## 2. Architecture

```
app/                     Next.js App Router — screens only, no SQL
  (app)/                 authenticated area (wrapped in the shell)
  login/                 sign-in (outside the shell)
  auth/oidc/callback/    OIDC callback (web side)
  actions/               server actions (mutations)
components/
  ui/                    design-system primitives + icon set
  layout/                sidebar, top bar, mobile tab bar, shell
core/                    pure domain logic, shared by web + API (no I/O)
  permissions.ts         role/permission matrix + authorize()
  rotation.ts            rotation countdown math
  events.ts              internal event bus
  time.ts                UTC day math (the only place days are counted)
db/                      all SQL lives here
  client.ts              driver adapter (PGlite | node-postgres)
  migrations/            numbered, checksummed SQL files
  repositories/          one module per table group
  seed.ts / migrate.ts / reset.ts / inspect.ts
server/                  Fastify API — the only process that touches the database
  auth/                  session tokens, OIDC client, auth service
  middleware/auth.ts     authorize() wired to every request
  routes/                one file per module
  config.ts              validated environment configuration
tests/                   unit (fast) + integration (real DB, real HTTP)
```

**Module boundaries mirror the ten product modules** (13-TECHNICAL-ARCHITECTURE.md §2).
One module's code never queries another module's tables directly.

### Two processes, one database

The API owns the database: a PGlite instance is a real PostgreSQL server running
in-process, so it cannot be shared between processes. The web app is a pure
client of the API and calls it *server-side* (React Server Components and server
actions). Browser code never sees an API URL, and the session token never
reaches JavaScript — it lives in an httpOnly cookie on the web origin.

```
browser ──► Next.js (RSC / server actions) ──► Fastify API ──► PostgreSQL
```

---

## 3. Database

Real PostgreSQL, two interchangeable drivers behind one interface
(`db/client.ts`):

| Driver | When |
|---|---|
| **PGlite** (default) | real PostgreSQL 18 compiled to WASM, file-backed at `.data/pgdata`. Zero install — foreign keys, CHECK constraints, partial unique indexes, triggers and JSONB all behave exactly as on a server. |
| **node-postgres** (`pg`) | used automatically when `DATABASE_URL` is set. Identical SQL. |

Migrations are plain numbered SQL files in `db/migrations/`. Each applied
migration is recorded with a checksum; editing an applied migration is a hard
error (add a new one instead).

Invariants enforced at the database level, not just in application code:

- `audit_log` is append-only (UPDATE and DELETE are rejected by a trigger).
- One live role assignment per `(user, role, scope)`; revocation stamps
  `revoked_at` rather than rewriting history.
- One active pod membership per user per pod; leaving keeps the historical row.
- Org-scoped roles carry `scope_id = NULL`; every other scope must carry one.

---

## 4. Authentication and authorization

- Identity comes from OIDC (`Auth0`/`Keycloak`/…) or, in development, from a
  seeded email. The dev path refuses to run in production unless
  `ALLOW_DEV_LOGIN_IN_PRODUCTION=true`.
- **Roles are time-boxed assignment records** (`role_assignment`), never columns
  on the user. Every permission check reads active assignments *today*, so an
  expired or revoked seat stops working immediately — including mid-session,
  because roles are not cached in the session token.
- `authorize(principal, roles, action, resource)` in `core/permissions.ts` is a
  pure function; the API middleware (`server/middleware/auth.ts`) loads the
  assignments and calls it. The permission matrix is the machine-readable form of
  01-INFORMATION-ARCHITECTURE.md §3, and every row has a test.

---

## 5. Testing

`npm test` runs Vitest against **real PostgreSQL** (PGlite in-memory), so
constraints, triggers and SQL semantics are exercised for real rather than
approximated by mocks.

| Suite | Covers |
|---|---|
| `tests/unit/time` | day math, UTC boundaries, DST safety |
| `tests/unit/permissions` | the whole matrix, rotation expiry, multi-role users, property tests |
| `tests/unit/rotation` | countdown math |
| `tests/unit/events` | bus ordering, failure isolation, durability-before-dispatch |
| `tests/unit/schema` | constraints, append-only audit log, cascades, migrations |
| `tests/unit/responsive-contract` | breakpoints, tokens, accessibility floor |
| `tests/integration/api-auth` | sessions, forged/expired tokens, OIDC against a real HTTP IdP, authorization through the API |

---

## 6. Environment

Copy `.env.example` to `.env`. Sensible development defaults are built in, so the
project runs with no `.env` at all.

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | signs session tokens (required in production) |
| `DATABASE_URL` | set to use a real PostgreSQL server instead of PGlite |
| `PGLITE_DATA_DIR` | where the embedded database is stored (default `.data/pgdata`) |
| `AUTH_MODE` | `dev` (seeded email sign-in) or `oidc` |
| `OIDC_*` | issuer, client id/secret, redirect URI |
| `TODAY` | pin "today" (`YYYY-MM-DD`) to run the whole platform on a fixed cycle day |

---

## 7. Phase progress

Built in the order dictated by `14-ROADMAP-FOR-AGENT.md`.

| Phase | Scope | Status |
|---|---|---|
| **0** | Foundations: schema, auth + `authorize()`, event bus, design tokens, base components, shell | ✅ done |
| **1** | Pods & Teams (03) + Sprint Calendar (06) | ✅ done |
| 2 | CLOU Agreements (04) | ⏳ next |
| 3 | Peer Review & Governance (08) | ⬜ |
| 4 | Internal Budget Market (05) | ⬜ |
| 5 | Coaching (07) | ⬜ |
| 6 | Notifications (11) + Archive (10) | ⬜ |
| 7 | Strategic Hub / Admin Console (09) | ⬜ |
| 8 | Hardening: accessibility pass, security review, load test, correction records | ⬜ |

### Phase 1 — definition of done

- [x] Pod overview (members, Pod Lead panel with rotation countdown and history, priorities, check-in log, pitch panel)
- [x] Pod Lead rotation + voting, with the tie-break rule shown in the modal
- [x] Weekly check-ins during Days 4–80, with the at-risk flag
- [x] Pitch editor with the exact Day 81–85 window, auto-submit warning from Day 84, and read-only view after submission
- [x] **Server rejects a submission attempt outside Days 81–85** — verified through the API, not just a disabled button (`window_closed`, HTTP 409)
- [x] Org-wide and per-pod calendar: Cycle Wheel (SVG) with a linear fallback under 480px, milestones with `.ics`, pause days shown to everyone
- [x] Shared `getCurrentPhase()` service, with pause-day handling and the "changes apply next cycle only" rule
- [x] Pod history timeline with CSV export

### Phase 0 — definition of done

- [x] Postgres schema for `org`, `holding`, `app_user`, `role_assignment`, `pod`, `pod_membership` (plus the audit log and event outbox Phase 0 itself needs)
- [x] OIDC login + the `authorize()` middleware pattern from §4
- [x] Internal event bus, persisting every event before dispatch
- [x] Design tokens as CSS variables + Tailwind config, and the base component shells (Data Card, Status Chip, Rotation Badge) built and reviewed
- [x] A user can log in and see the sidebar shell from 01-INFORMATION-ARCHITECTURE.md §1
- [x] Base components render correctly at 1440 / 768 / 375 — via `/design-system`; see the note below

### Troubleshooting

**`Could not open the embedded PostgreSQL database` on startup.** Only one
process can hold the PGlite data directory at a time, and a process killed with
`SIGKILL` can leave a stale lock behind. Stop any other API process, then either
remove `.data/pgdata/postmaster.pid` or run `npm run db:reset` (which recreates
the local demo database). Always stop the API with `Ctrl-C` / `SIGTERM` so it
closes the database cleanly.

### Known deviations

1. **No PostgreSQL server or Redis in this environment.** PGlite runs real
   PostgreSQL 18 in-process, and background jobs are not needed yet. Setting
   `DATABASE_URL` switches to a real server with identical SQL.
2. **The 3-width screenshot comparison (12-DESIGN-SYSTEM.md §7.5) needs a real
   browser**, which cannot be downloaded in this sandbox. The responsive
   contract (breakpoints, tokens, accessibility floor) is asserted in
   `tests/unit/responsive-contract.test.ts` instead; run
   `npm run dev` locally and open `/design-system` at 1440 / 768 / 375 to do the
   visual pass.
3. **Fonts are self-hosted from npm** (`@fontsource`) instead of fetched from
   Google Fonts at build time, so builds are reproducible and offline-capable.
