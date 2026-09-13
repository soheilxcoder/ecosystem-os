# 05 — Module: Internal Budget Market

## Purpose
This is the highest-stakes module in the entire platform: it computes and displays exactly how much budget each pod receives, using the formula from the source model, with zero manual override. Every design decision here should optimize for **trust through radical transparency**, since this module directly replaces a manager's former discretionary budget authority.

## The formula (must be implemented exactly — see `15-BUSINESS-RULES-APPENDIX.md`)
```
Unit Score = (0.40 × Financial Performance Score)
           + (0.35 × Peer Review Score)
           + (0.25 × Strategic Alignment Score)

Unit Budget = (Unit Score ÷ Σ All Units' Scores) × Total Allocatable Budget for the Period

Constraints:
  - No unit may receive more than 30% of a single period's total allocatable budget (cap).
  - Every unit receives a guaranteed "Survival Budget" = 1 month of that unit's fixed costs,
    regardless of score (floor) — this is allocated before the formula above is applied to
    the remaining pool.
```

## User stories
- As a Pod Member, I want to see exactly how our budget number was calculated, component by component.
- As a Pod Lead, I want to see how our score compares to last period and understand what moved it.
- As Company X, I want to see the full distribution across all pods before it's finalized, and confirm no rule was bypassed.
- As anyone, I want to simulate "what if" scenarios without those simulations affecting real numbers.

## Screen: `/budget/current-cycle`

### Layout
1. **Cycle status banner**: "Cycle 7 budget: [Provisional / Locked on Day 90]" with the exact lock timestamp.
2. **Org-wide allocation chart**: horizontal stacked bar or treemap showing every pod's share of the total allocatable budget, color-coded by holding/category. Clicking any segment jumps to that pod's breakdown.
3. **Total pool summary card**: Total allocatable budget this cycle, amount reserved for Survival Budgets (floor), amount remaining and distributed by formula, any amount capped/redistributed due to the 30% ceiling rule (shown explicitly — never silently absorbed).
4. **My Pod's breakdown card** (if user belongs to a pod):
   - Big number: **Unit Budget for next cycle**
   - Three sub-bars for the weighted components (40/35/25), each showing: raw component score (0–100 scale), weighted contribution, and a one-line "why" (e.g., Peer Review Score: "82/100 — based on 3 reviewer scores, see detail")
   - **[View Full Calculation →]** button → `/budget/:podId/breakdown`
   - Comparison arrow vs. last cycle's budget (▲/▼ %, with a tooltip explaining what changed most)

### States
- **Before Day 89 (results not yet announced)**: entire screen shows a "Provisional — Live Estimate" watermark/banner; numbers update as new peer reviews come in but are explicitly not final.
- **After Day 90 lock**: banner changes to "Final — Locked [timestamp]"; numbers become immutable, an audit hash/reference ID is displayed for traceability.

## Screen: `/budget/:podId/breakdown` (Full Calculation)

Shows, in order, exactly how the number was built — this is the "show the formula" principle from `01-INFORMATION-ARCHITECTURE.md` taken to its fullest:

1. **Financial Performance (40%)**: raw financial inputs pulled from the connected accounting/CRM system (with source system name + sync timestamp), the normalization method used to turn raw revenue/profit into a 0–100 score (documented inline, e.g., "percentile rank among all pods this cycle"), resulting component score.
2. **Peer Review Score (35%)**: list of the individual reviewer scores (reviewer identity shown per the model's transparency principle — configurable to anonymous if the org chooses), each with a link to their written comments, the averaging method, resulting component score.
3. **Strategic Alignment (25%)**: which org-level goal(s) this pod was tagged against this cycle, the alignment score given (by whom/what process — this should be defined by Architecture Hub config, e.g., a rubric scored by the Strategic Interactions Hub), resulting component score.
4. **Final calculation strip**: the weighted sum shown as an actual visible arithmetic line: `(0.40 × 78) + (0.35 × 82) + (0.25 × 65) = 76.65` → this pod's Unit Score.
5. **Pool math**: this pod's score ÷ sum of all scores × total pool = raw budget; then floor/cap rules applied if relevant, shown as explicit adjustment lines (not folded silently into the final number).
6. **[Download as PDF]** button — for pods that want to archive/share their calculation externally (e.g., with their own internal stakeholders).

## Screen: `/budget/history`
- Table: cycle number, dates, this pod's score, this pod's budget, org-wide total pool that cycle.
- Line chart: this pod's score trend over time, with the three component sub-scores as an optional stacked/overlaid view.
- Filter: compare against another pod (side-by-side chart) — available to any user, reinforcing organization-wide transparency.

## Screen: `/budget/simulator` (read-only, sandboxed)
- Sliders for the three component scores (Financial / Peer Review / Strategic) — NOT connected to real data.
- Live-updating "Estimated Unit Score" and "Estimated Budget Share" (using current cycle's total pool and other pods' real scores as the denominator, clearly labeled "assuming all other pods' scores stay the same").
- Prominent disclaimer banner: "This is a planning tool only. It does not submit anything and has no effect on real scores or budgets."
- Purpose: lets a Pod Lead answer "if we improve our peer review score by 10 points, roughly how much more budget would that mean?" without needing a spreadsheet or a finance person.

## Data model
```
BudgetCycle
  id, cycle_number, start_date, end_date, total_allocatable_pool, status (provisional|locked),
  locked_at (nullable), audit_hash (nullable)

PodScoreComponent
  id, cycle_id, pod_id, component_type (financial|peer_review|strategic),
  raw_inputs (json), normalization_method, score_0_100, calculated_at

PodBudgetResult
  id, cycle_id, pod_id, unit_score, raw_budget_share, survival_budget_applied (bool),
  cap_applied (bool), cap_redistributed_amount (nullable), final_budget, locked (bool)
```

## Business logic (must be enforced server-side, unit-tested explicitly)
1. Compute Financial (40%), Peer Review (35%), Strategic (25%) component scores per pod for the cycle.
2. Compute `Unit Score` per pod.
3. Reserve Survival Budget for every pod from the total pool first.
4. Distribute the remaining pool proportional to `Unit Score ÷ Σ Unit Scores`.
5. Apply the 30% cap: if any pod's computed share exceeds 30% of total allocatable budget, clamp it to 30% and redistribute the excess proportionally among all non-capped pods (re-run step 4's proportional logic on the remainder — document the exact redistribution algorithm in code comments since this can iterate if multiple pods hit the cap simultaneously).
6. Lock all numbers at Day 90 (per Sprint Calendar's Day 89–90 phase) — no writes permitted to `PodBudgetResult` after `locked = true` except by a fully audited, double-confirmed correction process (see `13-TECHNICAL-ARCHITECTURE.md` §7 for the correction/erratum workflow — this must never be a quiet edit).

## API endpoints
- `GET /api/budget/cycle/current`
- `GET /api/budget/pod/:podId/breakdown?cycleId=`
- `GET /api/budget/history?podId=`
- `POST /api/budget/simulate` (body: component scores; stateless, no persistence)
- `POST /api/budget/cycle/:id/lock` (Company X Architecture Hub only, requires the automated calculation to have run cleanly with no unresolved peer reviews — button disabled otherwise with a clear checklist of what's missing)
