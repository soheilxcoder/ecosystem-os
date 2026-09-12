# 13 — Technical Architecture

## 1. Recommended stack (opinionated, but swappable — the modules above are stack-agnostic)

| Layer | Recommendation | Why |
|---|---|---|
| Frontend | React + TypeScript, Next.js (App Router) | Server-rendered dashboards load fast on mobile; TS enforces the data contracts below at the type level |
| UI components | Tailwind CSS + a small custom component library implementing `12-DESIGN-SYSTEM.md` tokens | Avoid a generic pre-built component kit's default look, per the design brief's explicit anti-genericism requirement |
| Charts | Recharts (bar/line/pie) + a hand-built SVG component for the Cycle Wheel and CLOU Network Graph (no off-the-shelf library renders these two exactly as specified) | |
| Backend | Node.js (NestJS) or equivalent typed backend framework | Strong module boundaries map 1:1 to the 10 product modules above |
| Database | PostgreSQL | Relational integrity matters a lot here (immutable financial-style records, foreign keys between pods/cycles/scores) |
| Real-time updates | WebSocket channel (or Postgres LISTEN/NOTIFY → server-sent events) for live dashboard updates (e.g., a new peer review score arriving) | |
| Background jobs | A queue (e.g., BullMQ on Redis) for: nightly health-signal recomputation, cycle phase transitions, notification digest emails, budget-lock calculation | |
| Auth | OAuth2/OIDC via an identity provider (e.g., Auth0/Keycloak), with the app maintaining its own **role-assignment** tables (see §4) separate from the IdP's user directory | Roles here are time-boxed org concepts, not IdP groups |
| File storage | S3-compatible object storage for pitch attachments, session-related files | |
| Search | Postgres full-text search initially (sufficient for v1 Archive search volume); revisit Elasticsearch/OpenSearch only if search volume/complexity grows | |

## 2. System architecture (high level)

```
                        ┌─────────────────────┐
                        │   Next.js Frontend    │
                        └──────────┬───────────┘
                                   │ REST/GraphQL + WebSocket
                        ┌──────────▼───────────┐
                        │   API Gateway / BFF    │
                        └──────────┬───────────┘
        ┌──────────┬───────────┬──┴──────┬───────────┬──────────┐
   ┌────▼───┐ ┌────▼────┐ ┌────▼───┐ ┌───▼────┐ ┌────▼───┐ ┌────▼────┐
   │  Pods  │ │  CLOU   │ │ Budget │ │Calendar│ │Coaching│ │ Review/ │
   │Service │ │ Service │ │ Service│ │Service │ │Service │ │Governance│
   └────┬───┘ └────┬────┘ └────┬───┘ └───┬────┘ └────┬───┘ └────┬────┘
        │          │           │         │           │          │
        └──────────┴─────┬─────┴─────────┴─────┬─────┴──────────┘
                          │                     │
                 ┌────────▼────────┐   ┌────────▼────────┐
                 │  Event Bus        │   │  PostgreSQL      │
                 │ (pub/sub, feeds   │   │ (single DB,      │
                 │  Notifications &  │   │  module-scoped   │
                 │  Archive indexer) │   │  schemas)         │
                 └────────┬──────────┘   └──────────────────┘
                          │
              ┌───────────┴────────────┐
        ┌─────▼──────┐          ┌──────▼───────┐
        │Notifications│          │   Archive     │
        │  Service    │          │   Indexer     │
        └─────────────┘          └──────────────┘

External integrations (inbound, read-only sync):
   Accounting/ERP system  ──►  Financial Data Connector  ──► Budget Service
   CRM system             ──►  CRM Data Connector          ──► Budget Service (revenue inputs)
```

- **Module boundaries in code should mirror the 10 product modules exactly** (one service or one well-isolated module per file `02`–`11`) — this is deliberate, so an engineering agent building this can work module-by-module against this spec without cross-module ambiguity.
- **Single Postgres database, schema-per-module** is recommended for v1 (simpler operationally than full microservices with separate databases) while still keeping strict logical boundaries (no module's code queries another module's tables directly — always through that module's internal service interface). Split into physically separate databases later only if a specific module's load demands it.

## 3. Full data model (ERD summary — consolidates entities already defined per-module)

```
Org ─┬─< Holding ─┬─< Pod ─┬─< PodMembership >─ User
     │             │        ├─< PodLeadTerm >─ User
     │             │        ├─< WeeklyCheckin
     │             │        ├─< Pitch ─┬─< PeerReview
     │             │        │          
     │             │        ├─< EntryTrial
     │             │        ├─< AccountabilityCase ─< PanelVote
     │             │        ├─< PodScoreComponent
     │             │        ├─< PodBudgetResult
     │             │        └─< CoachAssignment >─ User
     │             └─< PilotProgram >─ Pod (pilot_pod_id)
     ├─< SprintCycle
     ├─< BudgetCycle
     ├─< RuleChange
     └─< CloudAgreement (pod_a_id, pod_b_id both → Pod)

User ─┬─< RoleAssignment (role_type, scope_type, scope_id, start_date, end_date)
      ├─< CoachingSession (as coach)
      └─< Notification

ArchiveIndexEntry (polymorphic, references any of the above by entity_type + entity_id)
```

Full per-entity field lists are already specified in each module file (`03`–`11`); this ERD exists to show how they connect end-to-end and should be the reference diagram for the initial database migration.

## 4. The role/permission system, precisely

This is the single most important architectural decision in the whole system, because the entire operating model depends on roles being **temporary assignments**, not identity fields.

```sql
CREATE TABLE role_assignment (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_user(id),
  role_type TEXT NOT NULL,   -- 'pod_member' | 'pod_lead' | 'peer_validator' |
                             -- 'conflict_resolver' | 'coach' | 'hub_architecture' |
                             -- 'hub_deployment' | 'hub_coaching' | 'hub_strategic' |
                             -- 'investor' | 'holding_executive'
  scope_type TEXT NOT NULL,  -- 'pod' | 'cycle' | 'case' | 'holding' | 'org'
  scope_id UUID,             -- nullable for org-scoped roles
  start_date DATE NOT NULL,
  end_date DATE,             -- NULL = open-ended (e.g., plain pod_member);
                             -- set for rotating roles (pod_lead, coach, peer_validator)
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

- Every permission check in every service queries this table for `role_type + scope + is active today`, never a static `user.role` column. This directly enforces the design system's "rotation is drawn, not written" principle at the data layer, not just visually.
- Authorization middleware pattern (pseudocode):
```
function authorize(user, action, resource):
  activeRoles = getActiveRoleAssignments(user, today())
  requiredRoles = PERMISSION_MATRIX[action]   // see 01-INFORMATION-ARCHITECTURE.md §3
  return activeRoles.any(r => requiredRoles.includes(r.role_type)
                              AND r.scope matches resource.scope)
```

## 5. Integration layer (accounting/CRM connectors)

- **Pattern**: read-only, scheduled + webhook-triggered sync. The platform never writes back to the accounting/CRM system.
- **Connector interface** (implement one per external system, e.g., QuickBooks/Xero/SAP for financial, HubSpot/Salesforce for CRM):
```
interface FinancialConnector {
  testConnection(credentials): Promise<{ok: boolean, message: string}>
  fetchPeriodFinancials(podId, periodStart, periodEnd): Promise<{
    revenue: number, costs: number, profit: number, currency: string,
    sourceSystem: string, fetchedAt: timestamp
  }>
}
```
- **Normalization**: raw financial figures are converted into the 0–100 "Financial Performance Score" component (Module 5) via a documented, versioned normalization function (e.g., percentile rank among all pods this cycle, or a target-vs-actual ratio capped at 100) — the exact method chosen must be recorded in `PodScoreComponent.normalization_method` for every calculation, per the platform-wide provenance principle.
- **Failure handling**: if a connector fails to sync before the Day-81 pitch window, the affected pod's dashboard shows an explicit "Financial data last synced [date] — sync failed, contact Architecture Hub" banner rather than silently using stale data as if current.

## 6. Security requirements

- All data in transit over TLS 1.2+; all data at rest encrypted (standard cloud-provider disk/DB encryption is sufficient for v1).
- Row-level access control enforced at the database or ORM-query layer for: coach private notes (Module 7), investor-portal aggregation minimums (Module 9), and any pod-scoped data queried by a user without an active role in that scope.
- Full audit log (append-only table) for every state-changing action across all modules — this is distinct from the user-facing Archive (Module 10); the audit log includes lower-level technical detail (IP, request ID) for security/compliance review, while the Archive is the curated, user-facing history.
- Rate limiting on all public-facing write endpoints (proposal creation, voting, review submission) to prevent abuse.
- Secrets (connector API keys/OAuth tokens) stored in a dedicated secrets manager, never in the application database in plaintext.

## 7. The "no silent edits" correction workflow

Because several modules (Budget results, Entry Trial decisions, Accountability decisions) are explicitly specified as immutable once locked, a real-world correction process must still exist (e.g., "the accounting sync had a bug and Pod A's Q3 financial figure was wrong"). Rather than allowing an in-place edit anywhere, implement one shared **Correction Record** pattern:

```
CorrectionRecord
  id, original_entity_type, original_entity_id, field_corrected,
  original_value, corrected_value, reason, approved_by (must be 2 distinct
  Architecture Hub users — a 2-person rule, not 1), created_at
```

- A correction never overwrites the original row; it creates a `CorrectionRecord` and the UI displays both the original (marked "superseded") and the correction (marked "corrected on [date], see reason") side by side wherever that number is shown.
- This is the only path in the entire system, anywhere, that can alter a locked score, budget, or governance decision — and it is itself fully visible in the Archive, satisfying the platform's transparency principle even for its own error-correction process.

## 8. Multi-tenancy (multiple holdings, e.g., "Pars" with 12 VCs)

- Single-database, `holding_id`/`org_id` scoping on every relevant table (already reflected in the ERD, §3) is sufficient for v1 — full database-per-tenant isolation is not needed at this scale and would complicate the org-wide comparison views that several modules explicitly require (e.g., Dashboard's cross-pod pulse, Budget's cross-pod comparison).
- A user with roles across multiple holdings (e.g., a coach on pods in two different VCs, or a Pars-level executive) sees the holding switcher described in `01-INFORMATION-ARCHITECTURE.md` §1; all API queries are scoped by the currently selected holding context except for genuinely cross-holding views (e.g., the Pars pilot tracker, which is explicitly holding-comparative by design).

## 9. Testing priorities (given this spec's emphasis on correctness of rules, not just UI)

Given how much of this system's trust depends on exact formulas and exact day-boundaries, prioritize automated test coverage in this order:
1. Budget formula (Module 5) — the 40/35/25 weighting, the 30% cap and redistribution algorithm, the survival-budget floor. Write these as pure, deterministic functions with extensive unit tests using hand-calculated expected outputs before any UI is built against them.
2. Sprint Calendar phase resolution (Module 6) — the shared `getCurrentPhase()` function, including pause-day handling and the "changes apply next cycle only" rule.
3. Entry Trial vs. Accountability Path state machines (Module 8) — these are the two most consequential and most easily confused workflows in the source model; property-based tests that assert a pod can never simultaneously be "in trial" and "in accountability" are worth the investment.
4. Role/permission matrix (§4 above) — every permission-matrix row from `01-INFORMATION-ARCHITECTURE.md` §3 should have a corresponding automated authorization test.
