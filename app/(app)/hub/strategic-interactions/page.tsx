/**
 * `/hub/strategic-interactions` — the Strategic Interactions Hub (Module 09).
 *
 * Two screens in one route:
 *   - Investor/partner reporting — build an aggregated, read-only snapshot
 *     and publish it to the investor portal. The builder structurally cannot
 *     expose single-pod detail: the API refuses scopes under the org's
 *     minimum-aggregation rule.
 *   - Media/partner contact log — a lightweight relationship ledger.
 */

import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';
import type { Holding, Pod } from '../../../../core/types';
import type { ExternalContact, InvestorReport } from '../../../../lib/types-hub';
import { StatusChip } from '../../../../components/ui/StatusChip';
import { ReportBuilder, type ScopeOption } from '../../../../components/hub/ReportBuilder';
import { AddContactForm, InteractionForm } from '../../../../components/hub/ContactLog';
import { publishReportAction } from '../../../actions/hub';

export const dynamic = 'force-dynamic';

interface MePayload {
  holdings: Holding[];
  today: string;
}

function formatMoney(value: number | undefined): string {
  if (value === undefined || value === null) return '—';
  return value.toLocaleString('en-US');
}

const RELATIONSHIP_LABEL: Record<ExternalContact['relationshipType'], string> = {
  investor: 'Investor',
  partner: 'Partner',
  media: 'Media',
  institution: 'Institution',
};

export default async function StrategicInteractionsPage() {
  const token = await getSessionToken();

  const [me, reports, contacts, pods] = await Promise.all([
    apiRequestOrNull<MePayload>('/api/me', { token }),
    apiRequestOrNull<InvestorReport[]>('/api/hub/strategic/reports', { token }),
    apiRequestOrNull<ExternalContact[]>('/api/hub/strategic/contacts', { token }),
    apiRequestOrNull<Pod[]>('/api/pods', { token }),
  ]);

  if (!reports || !contacts) {
    return (
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="font-display text-2xl text-ink-950">Strategic Interactions Hub</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            Aggregated investor reporting and the external contact log.
          </p>
        </header>
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">Strategic Interactions Hub only</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            Reports and external relationships need the Strategic Interactions seat. Investors read
            the published result at <code className="text-xs">/investor-portal</code>.
          </p>
        </div>
      </div>
    );
  }

  const today = me?.today ?? new Date().toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(new Date(`${today}T00:00:00Z`).getTime() - 90 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const scopeOptions: ScopeOption[] = [
    ...(me?.holdings ?? []).map((holding) => ({
      id: holding.id,
      label: holding.name,
      kind: 'holding' as const,
    })),
    ...(pods ?? []).map((pod) => ({
      id: pod.id,
      label: pod.name,
      kind: 'pod' as const,
    })),
  ];

  const drafts = reports.filter((report) => !report.published);
  const published = reports.filter((report) => report.published);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">Strategic Interactions Hub</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Reports leave the platform only aggregated, and only through this room.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Report builder + list */}
        <div className="space-y-6">
          <section aria-labelledby="builder-heading" className="rounded border border-line-200 bg-surface-white p-4">
            <h2 id="builder-heading" className="font-display text-lg text-ink-950">
              Report builder
            </h2>
            <div className="mt-3">
              <ReportBuilder options={scopeOptions} defaultFrom={ninetyDaysAgo} defaultTo={today} />
            </div>
          </section>

          <section aria-labelledby="reports-heading">
            <h2 id="reports-heading" className="font-display text-lg text-ink-950">
              Reports
            </h2>
            <div className="mt-3 space-y-2">
              {reports.length === 0 && (
                <p className="rounded border border-dashed border-line-300 bg-surface-white px-4 py-6 text-center text-sm text-slate-500">
                  No reports yet — generate the first aggregated snapshot above.
                </p>
              )}
              {[...drafts, ...published].map((report) => (
                <article key={report.id} className="rounded border border-line-200 bg-surface-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-ink-950">
                      {report.dateFrom} → {report.dateTo}
                    </h3>
                    <StatusChip
                      tone={report.published ? 'good' : 'watch'}
                      label={report.published ? 'published' : 'draft'}
                    />
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-2xs text-slate-600 sm:grid-cols-3">
                    <div>
                      <dt className="uppercase tracking-wide text-slate-500">Pods in scope</dt>
                      <dd className="text-ink-950">{report.metrics.podCountInScope ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="uppercase tracking-wide text-slate-500">Active pods</dt>
                      <dd className="text-ink-950">{report.metrics.activePodCount ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="uppercase tracking-wide text-slate-500">Discontinued</dt>
                      <dd className="text-ink-950">{report.metrics.podsDiscontinued ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="uppercase tracking-wide text-slate-500">Budget distributed</dt>
                      <dd className="text-ink-950">{formatMoney(report.metrics.totalBudgetDistributed)}</dd>
                    </div>
                    <div>
                      <dt className="uppercase tracking-wide text-slate-500">Financial trend</dt>
                      <dd className="text-ink-950">
                        {report.metrics.aggregateFinancialTrend === null ||
                        report.metrics.aggregateFinancialTrend === undefined
                          ? '—'
                          : formatMoney(report.metrics.aggregateFinancialTrend)}
                      </dd>
                    </div>
                  </dl>
                  {!report.published && (
                    <form action={publishReportAction.bind(null, report.id)} className="mt-2">
                      <button
                        type="submit"
                        className="rounded bg-ink-950 px-3 py-1 text-2xs font-medium text-white hover:bg-ink-800"
                      >
                        Publish to Investor Portal
                      </button>
                    </form>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>

        {/* Contact log */}
        <div className="space-y-6">
          <section aria-labelledby="add-contact-heading" className="rounded border border-line-200 bg-surface-white p-4">
            <h2 id="add-contact-heading" className="font-display text-lg text-ink-950">
              Add a contact
            </h2>
            <div className="mt-3">
              <AddContactForm />
            </div>
          </section>

          <section aria-labelledby="contacts-heading">
            <h2 id="contacts-heading" className="font-display text-lg text-ink-950">
              Contact log
            </h2>
            <div className="mt-3 space-y-2">
              {contacts.length === 0 && (
                <p className="rounded border border-dashed border-line-300 bg-surface-white px-4 py-6 text-center text-sm text-slate-500">
                  No external contacts recorded yet.
                </p>
              )}
              {contacts.map((contact) => (
                <article key={contact.id} className="rounded border border-line-200 bg-surface-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-ink-950">{contact.name}</h3>
                    <StatusChip tone="neutral" label={RELATIONSHIP_LABEL[contact.relationshipType]} />
                  </div>
                  <p className="mt-1 text-2xs text-slate-500">
                    Last interaction:{' '}
                    <span className="text-ink-950">{contact.lastInteractionAt ?? 'never logged'}</span>
                  </p>
                  {contact.notes && <p className="mt-1 text-xs text-slate-600">{contact.notes}</p>}
                  <div className="mt-2">
                    <InteractionForm contactId={contact.id} contactName={contact.name} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
