/**
 * `/archive` — Module 10 landing. The archive is the organisation's memory: an
 * index of every durable decision plus the lessons people write down. It has
 * three rooms, one per concern, so this page lists them rather than guessing
 * which the reader wants:
 *
 *   - Decisions  — the searchable index of what happened and why
 *   - Lessons    — what we would do differently, written by hand
 *   - Activity   — the reverse-chronological firehose
 *
 * The one rule the whole module rests on is stated up front: this is an index,
 * not a copy — every result links back to the module that owns the record, and
 * a coach's private notes are not something it can ever contain.
 */

import Link from 'next/link';

import { IconArchive, IconSearch, IconArrowRight } from '../../../components/ui/icons';

export const dynamic = 'force-dynamic';

interface Entry {
  href: string;
  title: string;
  description: string;
  cta: string;
}

const ENTRIES: Entry[] = [
  {
    href: '/archive/decisions',
    title: 'Decisions',
    description:
      'Search the index of pitches, agreements, budget locks, governance records and lessons. Filter by type, pod or date; every result links to its source.',
    cta: 'Search the archive',
  },
  {
    href: '/archive/lessons',
    title: 'Lessons learned',
    description:
      'What we would do differently, written once and searchable forever. Anyone in the org can add one.',
    cta: 'Read & record lessons',
  },
  {
    href: '/archive/activity',
    title: 'Activity',
    description:
      'Everything the archive has recorded, newest first. Optionally scoped to one pod.',
    cta: 'See the activity feed',
  },
];

export default function ArchivePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-signal-600">
          <IconArchive size={24} />
          <p className="text-2xs font-medium uppercase tracking-wide">Module 10</p>
        </div>
        <h1 className="mt-1 font-display text-2xl text-ink-950">Archive &amp; organizational memory</h1>
        <p className="mt-2 max-w-prose text-sm text-slate-500">
          An index of every durable decision, not a copy of it. Results deep-link to the module of
          origin, and private coaching notes are structurally impossible here — so what you search is
          always what the org agreed to remember.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {ENTRIES.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="group flex flex-col rounded border border-line-200 bg-surface-white p-4 transition-colors hover:border-signal-600"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base text-ink-950">{entry.title}</h2>
              <IconSearch size={16} className="text-slate-500" />
            </div>
            <p className="mt-2 flex-1 text-xs text-slate-500">{entry.description}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-signal-600">
              {entry.cta}
              <IconArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
