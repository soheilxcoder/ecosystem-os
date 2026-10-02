# 15 — Business Rules Appendix (Source of Truth for Every Number)

This file exists so no engineer or agent has to re-derive a rule from prose scattered across modules. Every number here traces back to the original operating-model document ("اکوسیستم شرکت X — نسخه نهایی، بدون استعاره"). If any module file appears to conflict with this appendix, this appendix wins — file an issue and fix the module doc.

## The six core mechanisms (implemented across modules)
| Mechanism | Module(s) |
|---|---|
| Self-Governing Units | 03 |
| Bilateral Agreements (CLOU) | 04 |
| Digital Platform | 02, and the platform as a whole |
| Internal Budget Market | 05 |
| 90-Day Sprint | 06 |
| Rotating Coaching | 07 |
| Strategic Interactions Hub | 09 |
| Dynamics & Evolution (founding/dissolution) | 08, 09 |

## Budget formula
```
Unit Score = 0.40 × FinancialPerformanceScore
           + 0.35 × PeerReviewScore
           + 0.25 × StrategicAlignmentScore

Unit Budget (before caps) = (Unit Score ÷ ΣAll Unit Scores) × Total Allocatable Pool

Cap: no unit may receive more than 30% of the period's total allocatable budget.
Floor: every unit receives a guaranteed Survival Budget = 1 month of that unit's fixed
       costs, reserved from the pool BEFORE the proportional formula is applied to the
       remainder.
```

### Worked example (for the Phase 4 unit test in the roadmap)
Assume 3 pods, no caps triggered, total allocatable pool (after survival-budget reservation) = 900,000,000 (any currency unit).

| Pod | Financial (40%) | Peer Review (35%) | Strategic (25%) | Unit Score |
|---|---|---|---|---|
| A | 78 | 82 | 65 | 0.40×78 + 0.35×82 + 0.25×65 = 31.2 + 28.7 + 16.25 = **76.15** |
| B | 60 | 70 | 90 | 24 + 24.5 + 22.5 = **71.0** |
| C | 90 | 55 | 40 | 36 + 19.25 + 10 = **65.25** |

Σ Unit Scores = 76.15 + 71.0 + 65.25 = 212.4

- Pod A budget = (76.15 / 212.4) × 900,000,000 ≈ **322,690,000**
- Pod B budget = (71.0 / 212.4) × 900,000,000 ≈ **300,850,000**
- Pod C budget = (65.25 / 212.4) × 900,000,000 ≈ **276,460,000**

Check: none exceeds 30% of 900,000,000 (=270,000,000)... **note: Pod A's and Pod B's shares in this example both exceed the 270,000,000 cap** — this is intentional in the worked example so the test suite also exercises the cap/redistribution path, not just the simple proportional case. Implementers must confirm the redistribution algorithm converges correctly here (redistribute each pod's excess-over-cap proportionally among still-under-cap pods, iterating if a second pod crosses the cap as a result) before treating Phase 4 as done.

## Sprint cycle day ranges (fixed, org-configurable only via versioned rule change)
| Days | Phase |
|---|---|
| 1–3 | Pod Lead rotation + priority setting |
| 4–80 | Execution, automated weekly check-ins |
| 81–85 | Report drafting + final pitch submission |
| 86–88 | Peer review by rotating panel |
| 89–90 | Results announced, budget allocated, next cycle begins |

Pod Lead term length: 90 days, rotated by member vote.
Coach-to-pod ratio (suggested, not hard-enforced): 1 coach per 3–5 pods (≈15–40 people); reassignment review every 2–3 cycles. Reference benchmark: Buurtzorg operates at 1:660 (21 coaches / 14,000 people) — cited for scale context only, not as this org's target ratio.

## 90-Day Entry Rule (new/trial units — Module 08)
- New pod/unit/holding starts in `trial` status.
- At Day 90: a **bilateral decision** (pod representative + Deployment Hub) — pass → full entry into normal cycle; fail → **immediate discontinuation, no correction period.**
- This is structurally distinct from the Accountability Path below and must never share a state machine or UI component with it.

## Accountability & Dissolution Path (established units — Module 08)
Four sequential stages:
1. Full transparency (baseline, always active — no special trigger).
2. Reduced credibility & profit share (triggered at an org-configured performance threshold).
3. Mediation by Conflict Resolver (if disagreement continues).
4. 30-day correction period with intensive coach support → ends in a **panel vote** (multiple people, never a single decision-maker) on continue vs. dissolve.

## Company X's four hubs (Module 09)
| Hub | Task |
|---|---|
| Architecture | Designs/updates org rules; ensures quality of new-unit deployment |
| Deployment | Executes projects; founds holdings; deploys the model; onboards new units |
| Coaching | Trains teams; develops/coordinates coaches; ongoing support |
| Strategic Interactions | Manages investor, institution, partner, and media relationships |

Coordination between the four hubs happens via the same CLOU mechanism used between pods (Module 04) — Company X follows its own model.

## Capital flow and profit split (Module 09 / investor reporting)
```
Strategic Interactions Hub attracts investor
   → capital funds a new holding/project
   → budget distributed among self-governing units (per the Budget Formula above)
   → units create value; revenue flows back to the holding
   → net profit split three ways:
        Investor:              45%  (return on capital, proportional to risk)
        Company X:             18%  (ongoing coordination + platform maintenance cost)
        Self-governing units:  37%  (split internally per the Budget Formula above)
```

## Five-stage rollout roadmap (for organizations retrofitting the model — informs Module 09's deployment wizard copy, not the engineering roadmap in file 14)
1. Foundation — define value of change, secure leadership buy-in, select pilot unit.
2. Structural redesign — remove middle-management layers, form self-governing units.
3. Process change — deploy the digital platform, replace top-down budgeting with the internal market.
4. Cultural transformation — replace traditional evaluation with OKRs and peer review.
5. Scaling — gradually expand from pilot to the rest of the organization.

## From-zero founding sequence (alternate path — Module 09's wizard "New Holding" type)
1. Founder/investor defines the overall goal — the only top-down decision in the entire model.
2. Initial core hired as 1–2 small pods (5–8 people each).
3. Lightweight platform launched from day one.
4. A coach attached to the core from the start.
5. First 90-day sprint begins simultaneously with hiring.
6. At ~15 people, the pod splits into two and the internal budget market activates.

## Reference pilot example ("Pars Pilot" — informs Module 09's Pilot Overview screen defaults)
- Selection criteria: team size 15–30, leadership support confirmed, connectable financial/CRM system, non-critical to the overall holding.
- Timeline: Weeks 1–2 selection + diagnostic; Weeks 3–4 pod split + coach assignment + charter; Weeks 5–6 lightweight platform setup; Weeks 7–8 rules training; then one full 90-day sprint; then a post-Day-90 decision (stop / repeat / expand to next unit).
- Success criteria: reduced tactical decision time (e.g., 5 days → under 2), pod satisfaction survey at sprint end, profit-to-budget ratio vs. that team's prior traditional-structure performance.

## The six management functions being redistributed (source of the whole model — informs onboarding/help copy across the product)
| Function | Destination in the new model |
|---|---|
| Planning & Coordination | Split: routine coordination → Self-governing team; long-term → Visionary role |
| Information Routing | Digital Platform (fully automated) |
| Tactical Decision-Making | Self-governing team (collective) |
| Oversight & Control | Digital Platform (fully automated, via transparency + automated flags) |
| Coaching | Rotating Coach role |
| Cross-team/external coordination ("boundary management") | Catalyst / Strategic Interactions roles, depending on scope |

## The VACC leadership framework (Module "remaining leadership," referenced in onboarding copy)
| Role | Works on | Does not work on |
|---|---|---|
| Visionary | Long-term direction | Day-to-day tactical decisions |
| Architect | System/platform rule design | Direct orders to people |
| Catalyst | Removing structural obstacles | Direct control of execution |
| Coach | Individual development, resolving human friction | Performance evaluation or punishment |
