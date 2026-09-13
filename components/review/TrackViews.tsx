/**
 * Shared Module 08 display components (server-rendered, no client JS).
 *
 * The cross-reference banner is the one piece the spec asks for by name: each
 * track's screen carries a visible link to the other, because confusing the
 * 90-Day Entry Rule with the Accountability Path would change what a pod is
 * entitled to.
 */

import Link from 'next/link';
import { StatusChip, type StatusTone } from '../ui/StatusChip';
import { STAGE_TONES, type AccountabilityView, type EntryTrialView } from '../../lib/governance';
import { formatShortDate } from '../../core/time';

export function TrackCrossReference({
  track,
  label,
  href,
}: {
  track: 'entry_trial' | 'accountability' | 'none';
  label: string;
  href: string | null;
}) {
  if (track === 'none' || !href) return null;
  return (
    <aside
      className="mb-4 border-l-2 border-signal-600 bg-signal-50 px-4 py-3"
      aria-label="Other governance track"
    >
      <p className="text-sm text-ink-950">
        This screen is the{' '}
        <strong>{track === 'entry_trial' ? '90-Day Entry Rule' : 'Accountability & Dissolution Path'}</strong>
        , a different process from the other track. {label}
      </p>
      <Link href={href} className="mt-1 inline-block text-sm text-signal-700 underline">
        Open the {track === 'entry_trial' ? 'Accountability Path' : '90-Day Entry Rule'} for this pod
      </Link>
    </aside>
  );
}

/**
 * The Entry Rule's whole shape is this bar: a straight line from Day 0 to Day
 * 90 with no stages in between.
 */
export function EntryTrialBar({ view }: { view: EntryTrialView }) {
  if (view.day === null || view.trial === null) return null;
  const total = view.totalDays;
  const day = Math.min(Math.max(view.day, 0), total);
  const percent = Math.round((day / total) * 100);
  const overdue = (view.daysRemaining ?? 0) < 0;

  return (
    <div className="border border-line-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-ink-950">
          Day {view.day} of {total}
        </h3>
        <p className="tabular text-sm text-slate-500">
          {overdue
            ? `Decision overdue by ${Math.abs(view.daysRemaining ?? 0)} day(s)`
            : `${view.daysRemaining} day(s) until the Day-90 decision`}
        </p>
      </div>
      <div
        className="mt-2 h-2 w-full bg-line-200"
        role="progressbar"
        aria-valuenow={day}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Days elapsed in the 90-day entry trial"
      >
        <div className={`h-2 ${overdue ? 'bg-status-watch' : 'bg-signal-600'}`} style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between text-xs text-slate-500">
        <span>Day 0 · {formatShortDate(view.trial.startDate)}</span>
        <span>
          Day {total} · decision due {formatShortDate(view.trial.decisionDueDate)}
        </span>
      </div>
    </div>
  );
}

/** The four accountability stages, shown as a rail with only one step active. */
export function StageRail({ view }: { view: AccountabilityView }) {
  return (
    <ol className="border border-line-200 bg-white">
      {view.stages.map((stage, index) => (
        <li
          key={stage.key}
          className={`border-line-200 px-4 py-3 ${index > 0 ? 'border-t' : ''} ${
            stage.state === 'current' ? 'bg-signal-50' : ''
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={`text-sm ${stage.state === 'upcoming' ? 'text-slate-500' : 'font-medium text-ink-950'}`}>
              {stage.label}
            </h3>
            <StatusChip
              tone={STAGE_TONES[stage.state]}
              label={stage.state === 'current' ? 'Current stage' : stage.state === 'done' ? 'Passed' : 'Not yet'}
            />
          </div>
          <p className="mt-1 max-w-prose text-sm text-slate-500">{stage.summary}</p>
        </li>
      ))}
    </ol>
  );
}

/** The panel, and the tally that keeps a single person from deciding anything. */
export function PanelVoteTable({ view }: { view: AccountabilityView }) {
  const { panel, tally, panelWarning } = view;
  return (
    <section className="border border-line-200 bg-white">
      <header className="border-b border-line-200 px-4 py-3">
        <h2 className="text-sm font-medium text-ink-950">Panel vote</h2>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          The panel is made up of peer Pod Leads and a Deployment Hub representative. Dissolution
          needs a majority against continuing, so a hung panel keeps the pod.
        </p>
      </header>

      {panelWarning ? (
        <p role="status" className="border-b border-line-200 bg-amber-50 px-4 py-2 text-sm text-status-watch">
          {panelWarning}
        </p>
      ) : null}

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Panel members and their votes</caption>
          <thead className="border-b border-line-200 text-xs text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Panel member</th>
              <th scope="col" className="px-4 py-2 font-medium">Seat</th>
              <th scope="col" className="px-4 py-2 font-medium">Vote</th>
              <th scope="col" className="px-4 py-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {panel.map((member) => (
              <tr key={member.memberId} className="border-b border-line-100">
                <td className="px-4 py-2">{member.name}</td>
                <td className="px-4 py-2 text-slate-500">{member.roleLabel}</td>
                <td className="px-4 py-2">
                  {member.vote === null ? (
                    <span className="text-slate-500">Not voted yet</span>
                  ) : (
                    <StatusChip
                      tone={(member.vote === 'continue' ? 'good' : 'alert') as StatusTone}
                      label={member.vote === 'continue' ? 'Continue' : 'Dissolve'}
                    />
                  )}
                </td>
                <td className="px-4 py-2 text-slate-500">{member.comment ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden">
        {panel.map((member) => (
          <li key={member.memberId} className="border-b border-line-100 px-4 py-3">
            <p className="text-sm font-medium text-ink-950">{member.name}</p>
            <p className="text-xs text-slate-500">{member.roleLabel}</p>
            <p className="mt-1 text-sm">
              {member.vote === null ? 'Not voted yet' : member.vote === 'continue' ? 'Continue' : 'Dissolve'}
            </p>
            {member.comment ? <p className="mt-1 text-sm text-slate-500">{member.comment}</p> : null}
          </li>
        ))}
      </ul>

      {tally ? (
        <footer className="border-t border-line-200 px-4 py-3 text-sm text-slate-600">
          <span className="tabular">{tally.cast}</span> of{' '}
          <span className="tabular">{tally.panelSize}</span> votes cast ·{' '}
          <span className="tabular">{tally.quorum}</span> needed for the vote to count ·{' '}
          <span className="tabular">{tally.continueVotes}</span> continue /{' '}
          <span className="tabular">{tally.dissolveVotes}</span> dissolve
          {!tally.canFinalize && tally.result === null && tally.remaining > 0 ? (
            <span className="text-slate-500">
              {' '}
              — the {tally.remaining} outstanding vote{tally.remaining === 1 ? '' : 's'} could still
              change the outcome, so nothing is decided yet
            </span>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}
