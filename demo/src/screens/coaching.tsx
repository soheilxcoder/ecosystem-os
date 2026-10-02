/**
 * Coaching — three audiences, one module. Adapted from the live landing page
 * which routes the signed-in seat to the right screen.
 */
import { IconArrowRight } from '../../../components/ui/icons';
import { PODS } from '../data';

const ENTRIES = [
  {
    title: 'My Coach',
    description:
      'Who coaches your pod, how to reach them, when they rotate, and the sessions they have shared with you.',
    cta: 'Open my coach',
  },
  {
    title: 'Coaching Console',
    description:
      'Your assigned pods, their health signals, the rotation countdown, and the sessions you log.',
    cta: 'Open the console',
  },
  {
    title: 'Coaching Roster',
    description:
      'The hub view: every coach, their pod load, rotation windows, and coverage gaps.',
    cta: 'Open the roster',
  },
];

export function CoachingScreen() {
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">Coaching</h1>
        <p className="mt-2 max-w-prose text-sm text-slate-500">
          Coaching is guidance with a memory. Each coach keeps structured sessions, and every pod can
          see who their coach is and when the seat rotates. Private notes stay private — the archive
          can never hold them.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {ENTRIES.map((entry) => (
          <div
            key={entry.title}
            className="group flex flex-col rounded border border-line-200 bg-surface-white p-4 transition-colors hover:border-signal-600"
          >
            <h2 className="font-display text-base text-ink-950">{entry.title}</h2>
            <p className="mt-2 flex-1 text-xs text-slate-500">{entry.description}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-signal-600">
              {entry.cta}
              <IconArrowRight size={16} />
            </span>
          </div>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-ink-700">Coached pods in this showcase</h2>
        <ul className="divide-y divide-line-200 border border-line-200 bg-white">
          {PODS.map((pod) => (
            <li key={pod.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink-950">{pod.name}</span>
                <span className="block text-xs text-slate-500">{pod.holdingName}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-2xs font-medium ${
                    pod.signal.level === 'green'
                      ? 'bg-status-good/10 text-status-good'
                      : pod.signal.level === 'amber'
                        ? 'bg-status-watch/10 text-status-watch'
                        : 'bg-status-alert/10 text-status-alert'
                  }`}
                >
                  {pod.signal.level}
                </span>
                <span className="text-xs text-slate-500">Coach {pod.coachName}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
