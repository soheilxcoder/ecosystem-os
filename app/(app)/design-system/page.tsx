/**
 * Design-system reference page.
 *
 * Exists so the base components can be reviewed against the checklist in
 * 12-DESIGN-SYSTEM.md §7 — including the screenshot comparison at 1440 / 768 /
 * 375 — without hunting for them across half-finished screens. Every state of
 * every base component is rendered here on purpose.
 */

import { DataCard } from '../../../components/ui/DataCard';
import { StatusChip } from '../../../components/ui/StatusChip';
import { RotationBadge } from '../../../components/ui/RotationBadge';
import { ProvenancePopover } from '../../../components/ui/ProvenancePopover';
import { computeRotation } from '../../../core/rotation';
import type { StatusTone } from '../../../components/ui/StatusChip';

const TONES: Array<{ tone: StatusTone; meaning: string }> = [
  { tone: 'neutral', meaning: 'Draft / not started' },
  { tone: 'active', meaning: 'In progress / active' },
  { tone: 'good', meaning: 'Completed / passed / healthy' },
  { tone: 'watch', meaning: 'Flagged / at risk' },
  { tone: 'alert', meaning: 'Action required' },
];

const ROTATION_EXAMPLES = [
  { label: 'Pod Lead — 62 days left', start: '2026-01-01', end: '2026-03-02' },
  { label: 'Pod Lead — 9 days left', start: '2026-01-01', end: '2026-01-20' },
  { label: 'Coach — ends today', start: '2026-01-01', end: '2026-01-11' },
  { label: 'Coach — expired', start: '2025-06-01', end: '2025-12-31' },
  { label: 'Pod Member — open-ended', start: '2026-01-01', end: null },
  { label: 'Seat vacant', start: null, end: null },
];

const TODAY = '2026-01-11';

export default function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">Design system</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Token set, typography and the base components every module is built from. Source:
          12-DESIGN-SYSTEM.md.
        </p>
      </header>

      <Section title="Colour tokens">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { name: 'ink-950', value: '#12161C', role: 'Primary text' },
            { name: 'paper-100', value: '#F7F8F6', role: 'Page background' },
            { name: 'slate-500', value: '#5B6672', role: 'Secondary text, borders' },
            { name: 'signal-600', value: '#1E6F5C', role: 'Primary action' },
            { name: 'surface-white', value: '#FFFFFF', role: 'Card surfaces' },
            { name: 'line-200', value: '#E3E6E2', role: 'Hairline borders' },
          ].map((token) => (
            <div key={token.name} className="border border-line-200 bg-white p-3">
              <div
                className="mb-2 h-8 w-full border border-line-200"
                style={{ backgroundColor: token.value }}
              />
              <p className="text-xs font-medium text-ink-950">{token.name}</p>
              <p className="tabular text-xs text-slate-500">{token.value}</p>
              <p className="mt-1 text-xs text-slate-500">{token.role}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type scale">
        <dl className="space-y-2 border border-line-200 bg-white p-4">
          {[
            { size: 'text-4xl', label: '48 — reserved for hero numbers' },
            { size: 'text-3xl', label: '36 — reserved for hero numbers' },
            { size: 'text-2xl', label: '28 — section heading' },
            { size: 'text-xl', label: '22 — sub-heading' },
            { size: 'text-lg', label: '18 — lead paragraph' },
            { size: 'text-base', label: '16 — body' },
            { size: 'text-sm', label: '14 — labels, tables' },
            { size: 'text-xs', label: '12 — meta' },
          ].map((row) => (
            <div key={row.size} className="flex items-baseline justify-between gap-4">
              <dt className={`${row.size} text-ink-950`}>Ecosystem OS</dt>
              <dd className="shrink-0 text-xs text-slate-500">{row.label}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-sm text-slate-500">
          Display face (serif) is used for headings and hero numbers only; the UI face (sans) carries
          everything else. Tabular numerals are on by default everywhere a number appears.
        </p>
      </Section>

      <Section title="Status Chip — five tones">
        <div className="flex flex-wrap gap-2 border border-line-200 bg-white p-4">
          {TONES.map(({ tone, meaning }) => (
            <StatusChip key={tone} tone={tone} label={tone} meta={`(${meaning})`} />
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Color is never the only signal — each chip pairs its dot with a text label.
        </p>
      </Section>

      <Section title="Rotation Badge — drawn, not written">
        <div className="flex flex-wrap gap-2 border border-line-200 bg-white p-4">
          {ROTATION_EXAMPLES.map((example) => (
            <RotationBadge
              key={example.label}
              role={example.label.split(' — ')[0] ?? 'Seat'}
              info={computeRotation(example.start, example.end, TODAY)}
            />
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-500">
          The ring shows progress through the term; amber means the seat turns over within 14 days.
          Examples are pinned to {TODAY}.
        </p>
      </Section>

      <Section title="Data Card — states">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <DataCard
            label="Cycle score"
            value={76.15}
            unit="of 100"
            tone="good"
            hint="Live estimate — final score locks at Day 90"
            provenance={{
              source: 'Pod score components, cycle 7',
              updatedAt: '2026-01-11 09:14 UTC',
              formula: '0.40 × financial + 0.35 × peer review + 0.25 × strategic alignment',
              reference: '15-BUSINESS-RULES-APPENDIX.md',
            }}
          />
          <DataCard label="Budget allocated" value="322,690,000" tone="active" hint="Cycle 7" />
          <DataCard
            label="Financial sync"
            value="—"
            tone="watch"
            stale
            staleMessage="Financial data last synced 2026-01-04 — sync failed, contact Architecture Hub"
            hint="Never shows stale numbers as if they were live."
          />
          <DataCard label="Pod health" loading />
        </div>

        <div className="mt-4 lg:max-w-md">
          <DataCard
            label="Next budget"
            value="322.7M"
            unit="currency units"
            size="large"
            tone="good"
            hint="The 36/48px treatment is reserved for a single hero figure per screen."
            footer={<span className="text-xs text-slate-500">Locked at Day 90 of the cycle</span>}
          />
        </div>
      </Section>

      <Section title="Provenance">
        <div className="border border-line-200 bg-white p-4">
          <p className="text-sm text-ink-950">
            Every computed number carries this affordance{' '}
            <ProvenancePopover
              source="Financial connector (CSV upload), cycle 7"
              updatedAt="2026-01-11 09:14 UTC"
              formula="Percentile rank among all pods this cycle"
              reference="13-TECHNICAL-ARCHITECTURE.md §5"
              className="align-middle"
            />
            — one click from any figure to the records, formula and timestamp behind it.
          </p>
        </div>
      </Section>

      <Section title="Cards: data vs navigation">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="data-card p-4">
            <p className="text-xs text-slate-500">Data card</p>
            <p className="mt-1 text-sm text-ink-950">
              1px hairline border, no shadow, 2px left status border. Reads as a ledger line item.
            </p>
          </div>
          <div className="nav-card p-4">
            <p className="text-xs text-slate-500">Navigational card</p>
            <p className="mt-1 text-sm text-ink-950">
              Subtle shadow, no status border — a place you can go, not a number to trust.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 border-b border-line-200 pb-2 text-sm font-medium text-ink-700">
        {title}
      </h2>
      {children}
    </section>
  );
}
