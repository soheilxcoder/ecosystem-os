# 00 — Product Overview

## 1. What this product is

Ecosystem OS is the operating platform for organizations running the Self-Governing Ecosystem model. It is **not** a generic project-management tool, and not a generic HR/OKR tool — it is purpose-built around six mechanisms that must interlock exactly:

1. Self-governing units ("pods") with independent P&L.
2. Bilateral service agreements between pods (CLOU).
3. A transparent data platform (this product itself).
4. An internal budget market that allocates money by formula, every 90 days.
5. Rotating coaching (not permanent management).
6. A dynamics/evolution layer that onboards new units (90-day trial) and retires failing ones (30-day correction path).

If any one of these six is implemented as "just a form" instead of a real, enforced workflow, the whole operating model collapses back into a traditional hierarchy with extra steps. This spec exists to prevent that.

## 2. Goals

- Replace manual, person-dependent coordination (status meetings, budget requests, performance reviews) with a system that runs the 90-day cycle automatically and transparently.
- Make every pod's performance, budget, and standing visible to the entire organization in real time — transparency is the accountability mechanism, replacing a manager's judgment call.
- Make the internal budget market's formula and the peer-review process impossible to bypass, override, or obscure.
- Give Company X (the coordinating body) a console to deploy new units, manage the four hubs, and run pilots — without giving it a backdoor into unit-level decisions.
- Support both scenarios described in the source model: (a) retrofitting an existing traditional organization, and (b) a brand-new organization built pod-first from day one.

## 3. Non-goals (v1)

- Not a general-purpose CRM, accounting system, or HRIS. It **integrates** with those (read-only ingestion of financial/CRM data — see `13-TECHNICAL-ARCHITECTURE.md`), it does not replace them.
- Not a payroll or legal-compliance system.
- No AI-driven "auto-matching" of people to pods in v1 (flagged as a v2+ idea in the roadmap, not built now).
- No native video conferencing — integrate with existing tools (Zoom/Meet links) rather than building calls.

## 4. Personas

| Persona | Who they are | What they need from the platform |
|---|---|---|
| **Pod Member** | Any individual in a self-governing unit | See their pod's real-time numbers, log check-ins, vote on Pod Lead, view/sign CLOUs, submit the pitch, see their budget outcome and why |
| **Pod Lead (rotating)** | A pod member currently holding the 90-day coordination role | Everything a Pod Member sees, plus: schedule the pod's own meetings, compile and submit the pitch, manage the pod's CLOU proposals |
| **Peer Validator (rotating)** | A member of a different pod assigned to review this pod's pitch | A focused review queue: read a pitch, score it, leave comments, submit — nothing else |
| **Conflict Resolver (as needed)** | A person mediating a dispute between two pods | A case view: both sides' relevant data, a mediation log, a non-binding recommendation field |
| **Coach (rotating across 3–5 pods)** | Facilitator assigned to several pods | A coach console: view all assigned pods' health signals, log coaching sessions, flag pods that may need the accountability path, no ability to issue directives |
| **Company X — Architecture Hub** | Designs/updates the org model's rules | A rules-configuration console (versioned, auditable) |
| **Company X — Deployment Hub** | Onboards new units/holdings | A deployment wizard for new pods/units/holdings, trial-status tracking |
| **Company X — Coaching Hub** | Trains and assigns coaches | Coach roster, coach-to-pod assignment tool, coach performance signals |
| **Company X — Strategic Interactions Hub** | Manages investors/partners/media | An external-facing reporting view (aggregated, non-sensitive metrics) for investor updates |
| **Investor / External Stakeholder** | Provides capital, receives reporting | A restricted, read-only reporting portal (aggregated financials, not pod-level operational detail) |
| **Holding/Pars-style Executive** | Oversees multiple VCs/units under one holding | Cross-pod, cross-VC comparison views; pilot-tracking dashboard |

## 5. Guiding principles for every screen in this spec

1. **Show the formula, not just the result.** Any score, ranking, or budget number must have a "how this was calculated" affordance.
2. **Rotation is a first-class UI concept.** Role badges always carry an expiry/rotation date, never render as a permanent title.
3. **No dead ends.** Every empty state, error state, and rejection state tells the user what to do next.
4. **Nothing is edited in place without a trail.** Every mutation (pitch submitted, score entered, CLOU signed, budget calculated) is an immutable, timestamped, attributed record.
5. **Cross-pod visibility is default-on, not opt-in.** Any pod member can see any other pod's public dashboard (scores, budget, pitches) — the system's accountability model depends on this. Only specific sensitive fields (e.g., individual salary data, if ever added) are restricted; operational/performance data is open by design.

## 6. Relationship between this platform and the org model's other five mechanisms

This platform IS mechanism #3 (Digital Platform) from the source model, and it is also the **execution surface** for mechanisms #1, #2, #4, and #5:

- Self-governing units (#1) → live inside the platform as Pods (Module 2).
- Bilateral agreements (#2) → created, signed, and tracked in the platform (Module 3).
- Internal budget market (part of #3/#4 in the source numbering) → calculated and displayed by the platform (Module 4).
- Rotating coaching (#5 in some source sections) → scheduled and logged in the platform (Module 6).
- Strategic Interactions Hub and Dynamics/Evolution (#5/#6) → run through the Strategic Hub / Admin Console (Module 8).

See `15-BUSINESS-RULES-APPENDIX.md` for the exact source rules each module must implement.
