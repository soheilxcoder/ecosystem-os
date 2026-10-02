/**
 * Hub Console — four hubs, one surface. Adapted from the live page; in the
 * showcase every hub card renders its sample counts.
 */
import { StatusChip } from '../../../components/ui/StatusChip';
import { IconArrowRight } from '../../../components/ui/icons';
import type { Persona } from '../data';

export function HubScreen({ persona }: { persona: Persona }) {
  const restricted = !persona.isHubUser;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">Hub Console</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Company X&apos;s four hubs. This console launches, tracks and reports — it never edits a
          pod&apos;s score, budget or governance outcome.
        </p>
      </header>

      {restricted && (
        <div className="mb-6 rounded border border-status-watch/40 bg-status-watch/10 px-4 py-3 text-sm text-ink-700">
          You are viewing the console as {persona.roleLabel}. Hub sections below show sample data;
          in the live product, seats without hub roles see a notice instead.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded border border-line-200 bg-surface-white p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg text-ink-950">Architecture Hub</h2>
            <IconArrowRight size={16} className="mt-1 text-slate-500" />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Rule versioning and the model&apos;s health — what governs, and what is about to change.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusChip tone="neutral" label="42 versioned rules" />
            <StatusChip tone="watch" label="1 pending change" />
          </div>
        </section>

        <section className="rounded border border-line-200 bg-surface-white p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg text-ink-950">Deployment Hub</h2>
            <IconArrowRight size={16} className="mt-1 text-slate-500" />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            The only door new pods come through — and the trial tracker that follows each one to
            Day 90.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusChip tone="active" label="1 pod in trial — Cinder, Day 41" />
            <StatusChip tone="neutral" label="2 pilots running" />
          </div>
        </section>

        <section className="rounded border border-line-200 bg-surface-white p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg text-ink-950">Coaching Hub</h2>
            <IconArrowRight size={16} className="mt-1 text-slate-500" />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Roster, rotation windows and coverage — every pod coached, no pod over-coached.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusChip tone="good" label="2 coaches · 5 pods covered" />
            <StatusChip tone="watch" label="Cora rotates in 27 days" />
          </div>
        </section>

        <section className="rounded border border-line-200 bg-surface-white p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg text-ink-950">Strategic Interactions Hub</h2>
            <IconArrowRight size={16} className="mt-1 text-slate-500" />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Investor-facing reporting and the themes pods align their pitches to.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusChip tone="neutral" label="1 draft investor report" />
            <StatusChip tone="good" label="Q3 report published" />
          </div>
        </section>
      </div>

      <section className="mt-6 rounded border border-line-200 bg-surface-white p-4">
        <h2 className="text-sm font-medium text-ink-950">What this console deliberately is not</h2>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          There is no &quot;admin override&quot; here. A hub can start a trial, publish a report or
          propose a rule — but it cannot edit a pod&apos;s score, budget or governance outcome.
          Those change only through their own modules, with an audit trail.
        </p>
      </section>
    </div>
  );
}
