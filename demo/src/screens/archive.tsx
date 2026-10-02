/**
 * Archive — the organisation's memory, adapted from the live module landing
 * plus a sample decisions index so the search surface has something to show.
 */
import { IconArchive, IconSearch } from '../../../components/ui/icons';
import { StatusChip } from '../../../components/ui/StatusChip';
import { ARCHIVE_ENTRIES } from '../data';

const TYPE_LABELS: Record<string, string> = {
  budget_cycle: 'Budget cycle',
  pitch: 'Pitch',
  accountability_case: 'Governance case',
  rule_change: 'Rule change',
  lesson: 'Lesson',
};

const ENTRIES = [
  {
    title: 'Decisions',
    description:
      'Search the index of pitches, agreements, budget locks, governance records and lessons. Every result links to its source.',
    cta: 'Search the archive',
  },
  {
    title: 'Lessons learned',
    description:
      'What we would do differently, written once and searchable forever. Anyone in the org can add one.',
    cta: 'Read & record lessons',
  },
  {
    title: 'Activity',
    description:
      'Everything the archive has recorded, newest first. Optionally scoped to one pod.',
    cta: 'See the activity feed',
  },
];

export function ArchiveScreen() {
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-signal-600">
          <IconArchive size={24} />
          <p className="text-2xs font-medium uppercase tracking-wide">Module 10</p>
        </div>
        <h1 className="mt-1 font-display text-2xl text-ink-950">
          Archive &amp; organizational memory
        </h1>
        <p className="mt-2 max-w-prose text-sm text-slate-500">
          An index of every durable decision, not a copy of it. Results deep-link to the module of
          origin, and private coaching notes are structurally impossible here — so what you search
          is always what the org agreed to remember.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {ENTRIES.map((entry) => (
          <div
            key={entry.title}
            className="group flex flex-col rounded border border-line-200 bg-surface-white p-4 transition-colors hover:border-signal-600"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base text-ink-950">{entry.title}</h2>
              <IconSearch size={16} className="text-slate-500" />
            </div>
            <p className="mt-2 flex-1 text-xs text-slate-500">{entry.description}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-signal-600">
              {entry.cta}
            </span>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-ink-700">Decisions index — sample</h2>
          <div className="flex items-center gap-2 rounded border border-line-200 bg-white px-3 py-1.5 text-xs text-slate-500">
            <IconSearch size={16} />
            <span>Filter by type, pod or date…</span>
          </div>
        </div>
        <ul className="mt-3 divide-y divide-line-200 border border-line-200 bg-white">
          {ARCHIVE_ENTRIES.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block text-sm text-ink-950">{entry.title}</span>
                <span className="block text-xs text-slate-500">{entry.summary}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <StatusChip tone="neutral" label={TYPE_LABELS[entry.entityType] ?? entry.entityType} />
                <span className="tabular text-2xs text-slate-500">
                  {entry.occurredAt} · {entry.actor}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
