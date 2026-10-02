/**
 * `/archive/lessons` — Module 10, screen 2. Lessons learned are the one archive
 * record a person writes by hand. The list is the org's accumulated judgement;
 * the form is how any member adds to it.
 */

import { LessonForm } from '../../../../components/archive/LessonForm';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

interface Lesson {
  id: string;
  whatHappened: string;
  whatWedDoDifferently: string | null;
  tags: string[];
  createdAt: string;
}

interface LessonsPayload {
  count: number;
  items: Lesson[];
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10);
}

export default async function ArchiveLessonsPage() {
  const token = await getSessionToken();
  const lessons = await apiRequestOrNull<LessonsPayload>('/api/archive/lessons', { token });

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <p className="text-2xs font-medium uppercase tracking-wide text-signal-600">Archive</p>
        <h1 className="mt-1 font-display text-2xl text-ink-950">Lessons learned</h1>
        <p className="mt-2 max-w-prose text-sm text-slate-500">
          What we would do differently, written once and searchable forever. Every lesson is indexed
          alongside the event-derived records.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="lessons-heading">
          <h2 id="lessons-heading" className="sr-only">
            Recorded lessons
          </h2>
          {!lessons ? (
            <p className="text-sm text-slate-500">The archive service is unreachable right now.</p>
          ) : lessons.items.length === 0 ? (
            <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-12 text-center">
              <h2 className="font-display text-base text-ink-950">No lessons yet</h2>
              <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
                After a cycle ends — or a decision stings — write down what you&apos;d do differently.
                Future pods will thank you.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {lessons.items.map((lesson) => (
                <li key={lesson.id} className="rounded border border-line-200 bg-surface-white p-4">
                  <p className="text-sm text-ink-950">{lesson.whatHappened}</p>
                  {lesson.whatWedDoDifferently ? (
                    <p className="mt-2 border-l-2 border-signal-600/40 pl-3 text-xs text-slate-500">
                      <span className="font-medium text-ink-700">Next time: </span>
                      {lesson.whatWedDoDifferently}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-2xs text-slate-500">{formatDate(lesson.createdAt)}</span>
                    {lesson.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded border border-line-200 bg-paper-100 px-1.5 py-0.5 text-2xs text-slate-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside>
          <LessonForm />
        </aside>
      </div>
    </div>
  );
}
