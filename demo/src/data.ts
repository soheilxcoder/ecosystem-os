/**
 * Sample dataset for the static showcase — mirrors the live platform's seed
 * (Company X, Holdings Pars & Dena, five pods, cycle 3 in progress) so every
 * screen tells the same story the real product tells.
 */

export const TODAY = '2026-09-30';
export const CYCLE_START = '2026-07-01';
export const CYCLE_END = '2026-09-28';
export const CYCLE_NUMBER = 3;
export const CYCLE_DAY = 62;

export const ORG_NAME = 'Company X';

export interface Persona {
  id: string;
  fullName: string;
  email: string;
  /** Translation key for the human role label. */
  roleKey: 'role.podLeadAtlas' | 'role.coach' | 'role.hubArchitecture' | 'role.hubStrategic' | 'role.investor';
  roleType: string;
  isHubUser: boolean;
  podIds: string[];
  notificationCount: number;
  urgentCount: number;
  rotation: { seatKey: 'seat.Pod Lead' | 'seat.Pod Member' | 'seat.Coach' | 'seat.Architecture Hub' | 'seat.Strategic Interactions Hub' | 'seat.Investor'; start: string; end: string }[];
}

export const PERSONAS: Persona[] = [
  {
    id: 'lena',
    fullName: 'Lena Lead',
    email: 'lena@example.org',
    roleKey: 'role.podLeadAtlas',
    roleType: 'pod_lead',
    isHubUser: false,
    podIds: ['pod-atlas'],
    notificationCount: 3,
    urgentCount: 1,
    rotation: [
      { seatKey: 'seat.Pod Lead', start: '2026-07-01', end: '2026-12-28' },
      { seatKey: 'seat.Pod Member', start: '2026-01-01', end: '2026-12-28' },
    ],
  },
  {
    id: 'cora',
    fullName: 'Cora Coach',
    email: 'cora@example.org',
    roleKey: 'role.coach',
    roleType: 'coach',
    isHubUser: false,
    podIds: ['pod-atlas', 'pod-cinder', 'pod-ember'],
    notificationCount: 2,
    urgentCount: 0,
    rotation: [{ seatKey: 'seat.Coach', start: '2026-01-01', end: '2026-09-28' }],
  },
  {
    id: 'ari',
    fullName: 'Ari Architect',
    email: 'ari@example.org',
    roleKey: 'role.hubArchitecture',
    roleType: 'hub_architecture',
    isHubUser: true,
    podIds: [],
    notificationCount: 5,
    urgentCount: 2,
    rotation: [{ seatKey: 'seat.Architecture Hub', start: '2026-01-01', end: '2027-01-01' }],
  },
  {
    id: 'sana',
    fullName: 'Sana Strategic',
    email: 'sana@example.org',
    roleKey: 'role.hubStrategic',
    roleType: 'hub_strategic',
    isHubUser: true,
    podIds: [],
    notificationCount: 1,
    urgentCount: 0,
    rotation: [{ seatKey: 'seat.Strategic Interactions Hub', start: '2026-01-01', end: '2027-01-01' }],
  },
  {
    id: 'ilyas',
    fullName: 'Ilyas Investor',
    email: 'ilyas@example.org',
    roleKey: 'role.investor',
    roleType: 'investor',
    isHubUser: false,
    podIds: [],
    notificationCount: 1,
    urgentCount: 0,
    rotation: [{ seatKey: 'seat.Investor', start: '2026-01-01', end: '2027-01-01' }],
  },
];

export const HOLDINGS = [
  { id: 'holding-pars', orgId: 'org-x', name: 'Holding Pars', code: 'PRS', createdAt: '2025-12-01' },
  { id: 'holding-dena', orgId: 'org-x', name: 'Holding Dena', code: 'DNA', createdAt: '2025-12-01' },
];

export interface PodSample {
  id: string;
  name: string;
  holdingName: string;
  status: 'active' | 'trial';
  memberCount: number;
  leadName: string;
  coachName: string;
  unitScore: number;
  survivalBudget: number;
  formulaShare: number;
  finalBudget: number;
  shareOfPoolPercent: number;
  capApplied: boolean;
  monthlyFixedCosts: number;
  components: { financial: number; peer_review: number; strategic: number };
  signal: { level: 'green' | 'amber' | 'red'; score: number };
}

export const BUDGET_WEIGHTS = { financial: 0.4, peer_review: 0.35, strategic: 0.25 };
export const TOTAL_POOL = 1_840_000_000;
export const CAP_FRACTION = 0.25;
/** Σ of every pod's Survival Budget — reserved before the formula runs. */
export const RESERVED_FOR_SURVIVAL = 420_000_000;
/** Total pool minus the survival reserve; this is what the formula divides. */
export const DISTRIBUTABLE_POOL = TOTAL_POOL - RESERVED_FOR_SURVIVAL;
/** Σ of all Unit Scores in cycle 3. */
export const TOTAL_UNIT_SCORE = 355.1;
export const CAP_AMOUNT = Math.round(TOTAL_POOL * CAP_FRACTION);

export const PODS: PodSample[] = [
  {
    id: 'pod-atlas',
    name: 'Pod Atlas',
    holdingName: 'Holding Pars',
    status: 'active',
    memberCount: 8,
    leadName: 'Lena Lead',
    coachName: 'Cora Coach',
    unitScore: 76.45,
    survivalBudget: 96_000_000,
    formulaShare: 305_713_000,
    finalBudget: 401_713_000,
    shareOfPoolPercent: 21.8,
    capApplied: false,
    monthlyFixedCosts: 8_000_000,
    components: { financial: 82, peer_review: 74, strategic: 71 },
    signal: { level: 'green', score: 84 },
  },
  {
    id: 'pod-basalt',
    name: 'Pod Basalt',
    holdingName: 'Holding Pars',
    status: 'active',
    memberCount: 6,
    leadName: 'Ramin Roshan',
    coachName: 'Cora Coach',
    unitScore: 71.15,
    survivalBudget: 72_000_000,
    formulaShare: 284_520_000,
    finalBudget: 356_520_000,
    shareOfPoolPercent: 19.4,
    capApplied: false,
    monthlyFixedCosts: 6_000_000,
    components: { financial: 75, peer_review: 69, strategic: 68 },
    signal: { level: 'green', score: 78 },
  },
  {
    id: 'pod-cinder',
    name: 'Pod Cinder',
    holdingName: 'Holding Pars',
    status: 'trial',
    memberCount: 5,
    leadName: 'Vana Nouri',
    coachName: 'Cora Coach',
    unitScore: 65,
    survivalBudget: 60_000_000,
    formulaShare: 259_927_000,
    finalBudget: 319_927_000,
    shareOfPoolPercent: 17.4,
    capApplied: false,
    monthlyFixedCosts: 5_000_000,
    components: { financial: 61, peer_review: 66, strategic: 70 },
    signal: { level: 'amber', score: 62 },
  },
  {
    id: 'pod-dune',
    name: 'Pod Dune',
    holdingName: 'Holding Dena',
    status: 'active',
    memberCount: 9,
    leadName: 'Omid Farahani',
    coachName: 'Darvish Coach',
    unitScore: 69.15,
    survivalBudget: 108_000_000,
    formulaShare: 276_522_000,
    finalBudget: 384_522_000,
    shareOfPoolPercent: 20.9,
    capApplied: false,
    monthlyFixedCosts: 9_000_000,
    components: { financial: 58, peer_review: 77, strategic: 76 },
    signal: { level: 'red', score: 41 },
  },
  {
    id: 'pod-ember',
    name: 'Pod Ember',
    holdingName: 'Holding Dena',
    status: 'active',
    memberCount: 7,
    leadName: 'Nima Bashiri',
    coachName: 'Darvish Coach',
    unitScore: 73.35,
    survivalBudget: 84_000_000,
    formulaShare: 293_318_000,
    finalBudget: 377_318_000,
    shareOfPoolPercent: 20.5,
    capApplied: false,
    monthlyFixedCosts: 7_000_000,
    components: { financial: 79, peer_review: 70, strategic: 69 },
    signal: { level: 'amber', score: 66 },
  },
];

export const PHASE_BOUNDARIES = { p1_end: 3, p2_end: 21, p3_end: 85, p4_end: 88, p5_end: 90 };

export const MILESTONES = [
  { type: 'pitches_due', label: 'Pitches submitted to the Review Board', day: 45, date: '2026-08-15' },
  { type: 'auto_submit', label: 'Peer reviews auto-submitted (deadline)', day: 85, date: '2026-09-24' },
  { type: 'lock_window_opens', label: 'Budget lock window opens (Day 89)', day: 89, date: '2026-09-28' },
];

export const NOTIFICATIONS = [
  {
    id: 'n1',
    title: 'Peer review window closes in 3 days',
    body: 'Reviews for cycle 3 auto-submit on Day 85. Two of your assigned reviews are still drafts.',
    kind: 'review.reminder',
    urgency: 'urgent',
    createdAt: '2026-09-29T09:00:00Z',
    read: false,
  },
  {
    id: 'n2',
    title: 'Pod Dune accounting sync failed',
    body: 'The connector returned stale figures for the second consecutive day. Dune’s financial component is flagged.',
    kind: 'connector.failure',
    urgency: 'urgent',
    createdAt: '2026-09-28T16:20:00Z',
    read: false,
  },
  {
    id: 'n3',
    title: 'Coaching session scheduled',
    body: 'Cora Coach scheduled a check-in with Pod Atlas for Thursday.',
    kind: 'coaching.scheduled',
    urgency: 'normal',
    createdAt: '2026-09-27T11:05:00Z',
    read: false,
  },
  {
    id: 'n4',
    title: 'Budget calculation ran',
    body: 'Cycle 3 budget was computed: pool 1,840,000,000 across 5 pods. Provisional until the lock window.',
    kind: 'budget.computed',
    urgency: 'normal',
    createdAt: '2026-09-21T08:00:00Z',
    read: true,
  },
  {
    id: 'n5',
    title: 'Pitch submitted — Pod Basalt',
    body: 'Basalt submitted its cycle 3 pitch to the Review Board.',
    kind: 'pitch.submitted',
    urgency: 'normal',
    createdAt: '2026-08-14T15:40:00Z',
    read: true,
  },
];

export const ARCHIVE_ENTRIES = [
  { id: 'a1', entityType: 'budget_cycle', title: 'Cycle 2 budget locked', summary: 'Pool 1,760,000,000 · 5 pods · Atlas 21.9% · locked Day 89', occurredAt: '2026-06-28', actor: 'Architecture Hub' },
  { id: 'a2', entityType: 'pitch', title: 'Pod Atlas — cycle 2 pitch', summary: 'Kept the payments-reconciliation focus; asked for one additional seat.', occurredAt: '2026-05-15', actor: 'Pod Atlas' },
  { id: 'a3', entityType: 'accountability_case', title: 'Case AC-004 — escalated', summary: 'Conflict between two Atlas members moved to stage 4; panel constituted.', occurredAt: '2026-05-02', actor: 'Pod Atlas' },
  { id: 'a4', entityType: 'rule_change', title: 'Cap fraction confirmed at 25%', summary: 'Architecture rule re-affirmed for cycle 3 after a proposed change was rejected.', occurredAt: '2026-04-11', actor: 'Architecture Hub' },
  { id: 'a5', entityType: 'lesson', title: 'Lesson — onboarding new members mid-cycle', summary: 'Basalt recorded what slowed a mid-cycle onboarding and how the checklist changed.', occurredAt: '2026-03-30', actor: 'Pod Basalt' },
];

export const money = (amount: number): string => Math.round(amount).toLocaleString('en-US');
