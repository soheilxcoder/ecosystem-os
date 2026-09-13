# 04 — Module: Bilateral Agreements (CLOU)

## Purpose
Implements the source model's rule: a CLOU only forms between pods that actually exchange a service/good; unrelated pods stay connected only through the platform and budget market, never through a forced agreement. This module must make that distinction visible in the UI, not just in a help document.

## User stories
- As a Pod Lead, I want to propose a service agreement with another pod I actually work with.
- As the receiving pod, I want to review and either accept, reject, or counter-propose terms.
- As any employee, I want to see which pods are connected by real agreements, distinct from pods that just share infrastructure.
- As Company X, I want to see the full agreement graph for the organization.

## Screen: `/agreements/active`
- **List/table view**, columns: Agreement name, Pod A, Pod B, Service description (one line), Status (Active/Under renegotiation/Expired), Start date, Renewal date.
- **Toggle**: "List view" / "Network graph view."
- **Network graph view**: nodes = pods, solid edges = active CLOUs (labeled with service direction, e.g., an arrowhead showing who serves whom), pods with no direct edges are still shown on the canvas but visually connected only via a faint shared dotted line to a central "Platform & Budget Market" hub node — this is the direct visual teaching tool for the "direct agreement vs. system connection" rule from the source model (Section 10).
- **[+ New Agreement]** button (top right).
- Filter by pod, holding, status.

## Screen: `/agreements/new` (Proposal wizard, 4 steps)

### Step 1 — Select counterparty
- Search/select the other pod.
- **Guardrail**: before continuing, a required field asks "What service or good does this exchange involve?" with a short free-text answer. If left blank, the **[Continue]** button stays disabled with inline text: "A CLOU requires a real, described exchange — this isn't required for pods that don't exchange services." This operationalizes the source rule directly in the flow, rather than as a wiki note nobody reads.

### Step 2 — Define terms
- Service description (rich text)
- Direction (Pod A → Pod B / Pod B → Pod A / Bidirectional)
- Cadence (One-time / Recurring — if recurring, frequency picker)
- Pricing/internal transfer terms (optional structured field: fixed fee, per-unit, revenue share — free text if none of these fit)
- Escalation contact (defaults to each pod's current Pod Lead, auto-updates on rotation — never hardcodes a person's name into the agreement)

### Step 3 — Review & send
- Read-only summary of steps 1–2.
- **[Send Proposal]** button → creates the agreement in `proposed` status and notifies the counterpart pod's current Pod Lead.

### Step 4 — Confirmation screen
- "Proposal sent to [Pod B]. You'll be notified when they respond." **[Back to Agreements]** button.

## Screen: `/agreements/proposals` (Inbox for incoming proposals)
- List of proposals awaiting this pod's response.
- Each row expands to show full terms (from Step 2 above) plus three action buttons: **[Accept]**, **[Counter-propose]** (reopens Step 2 pre-filled, editable), **[Decline]** (requires a one-line reason, stored and visible to the proposing pod — no silent rejections).

## Screen: `/agreements/:cloudId` (Agreement detail)
- Full terms, status history (proposed → countered → accepted/declined → active → renewed/expired), linked pods, escalation contacts (live, resolves to whoever is current Pod Lead).
- **[Request Renegotiation]** button (available to either pod once active) — reopens a lightweight version of the proposal wizard scoped to changed terms only.
- **[Archive]** button (only after mutual agreement to end, both sides must confirm — a two-party confirmation modal, not a single-click delete).
- Activity log for this specific agreement (who proposed, who countered, who accepted, timestamps).

## Data model
```
CloudAgreement
  id, pod_a_id, pod_b_id, service_description, direction (a_to_b|b_to_a|bidirectional),
  cadence (one_time|recurring), frequency (nullable), pricing_terms (json),
  status (proposed|countered|accepted|declined|active|renegotiating|archived),
  created_by_user_id, created_at, last_updated_at

CloudAgreementEvent
  id, agreement_id, event_type (proposed|countered|accepted|declined|renewed|archived),
  actor_user_id, note, created_at
```

## Business logic
- An agreement can only be proposed if the "service description" field is non-empty (server-side validation, not just client-side).
- The network graph's "shared infrastructure" dotted connections are computed, not stored — any two pods with no active `CloudAgreement` between them are rendered connected only to the central hub node, automatically.
- Escalation contact is always resolved live from the current `PodLeadTerm` (Module 3) — never a static snapshot, so a signed agreement doesn't silently point to someone who has rotated out.

## API endpoints
- `GET /api/agreements?scope=org|pod&podId=`
- `POST /api/agreements` (create proposal)
- `POST /api/agreements/:id/respond` (accept|decline|counter, body includes updated terms if counter)
- `POST /api/agreements/:id/renegotiate`
- `POST /api/agreements/:id/archive`
- `GET /api/agreements/graph` → returns nodes (pods) + edges (active agreements) for the network view
