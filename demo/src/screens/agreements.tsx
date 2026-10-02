/**
 * CLOU Agreements — filter bar, list view and the network graph. Fully
 * bilingual; the graph layout still comes from core's computeAgreementGraph.
 */
import { useState } from 'react';
import { StatusChip } from '../../../components/ui/StatusChip';
import { agreementStatusTone } from '../../../lib/agreements';
import { computeAgreementGraph, displayStatus } from '../../../core/agreements';
import { AgreementGraphI18n } from '../components/AgreementGraphI18n';
import { PODS, TODAY } from '../data';
import { useI18n } from '../i18n';
import { useNames } from '../i18n/names';
import type { StringKey } from '../i18n/translations';

type Status = 'active' | 'proposed' | 'renegotiating';

interface AgreementRow {
  id: string;
  nameKey: StringKey;
  descKey: StringKey;
  podAId: string;
  podBId: string;
  status: Status;
  startDate: string;
  renewalDate: string;
}

const ROWS: AgreementRow[] = [
  {
    id: 'ag-1',
    nameKey: 'agreement.ag1',
    descKey: 'agreement.ag1.desc',
    podAId: 'pod-atlas',
    podBId: 'pod-basalt',
    status: 'active',
    startDate: '2026-06-15',
    renewalDate: '2026-12-15',
  },
  {
    id: 'ag-2',
    nameKey: 'agreement.ag2',
    descKey: 'agreement.ag2.desc',
    podAId: 'pod-basalt',
    podBId: 'pod-cinder',
    status: 'active',
    startDate: '2026-08-01',
    renewalDate: '2026-11-01',
  },
  {
    id: 'ag-3',
    nameKey: 'agreement.ag3',
    descKey: 'agreement.ag3.desc',
    podAId: 'pod-atlas',
    podBId: 'pod-ember',
    status: 'proposed',
    startDate: '2026-09-25',
    renewalDate: '2027-03-25',
  },
];

const STATUS_LABEL_KEY: Record<string, StringKey> = {
  active: 'agreements.statusActive',
  renegotiating: 'agreements.statusRenegotiating',
  proposed: 'agreements.statusProposed',
  countered: 'agreements.statusProposed',
  expired: 'agreements.statusRenegotiating',
};

export function AgreementsScreen({
  initialView = 'list',
}: {
  initialView?: 'list' | 'graph';
} = {}) {
  const [view, setView] = useState<'list' | 'graph'>(initialView);
  const { t, date } = useI18n();
  const names = useNames();

  const graph = computeAgreementGraph({
    pods: PODS.map((pod) => ({
      id: pod.id,
      name: names.podName(pod.id),
      holdingId: pod.holdingName === 'Holding Pars' ? 'holding-pars' : 'holding-dena',
      holdingName: names.holdingByName(pod.holdingName),
      status: pod.status,
    })),
    agreements: ROWS.map((row) => ({
      id: row.id,
      podAId: row.podAId,
      podBId: row.podBId,
      name: t(row.nameKey),
      serviceDescription: t(row.descKey),
      direction: 'bidirectional' as const,
      status: row.status,
      renewalDate: row.renewalDate,
    })),
    today: TODAY,
  });

  const statusLabel = (row: AgreementRow): string => {
    const shown = displayStatus({ status: row.status, renewalDate: row.renewalDate }, TODAY);
    return t(STATUS_LABEL_KEY[shown] ?? 'agreements.statusActive');
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="font-display text-2xl text-ink-950">{t('agreements.h1')}</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">{t('agreements.sub')}</p>
      </header>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="filter-pod" className="block text-xs text-slate-500">
              {t('agreements.filterPod')}
            </label>
            <select
              id="filter-pod"
              className="mt-1 border border-line-200 bg-white px-2 py-1.5 text-sm"
            >
              <option>{t('agreements.allPods')}</option>
              {PODS.map((pod) => (
                <option key={pod.id}>{names.podName(pod.id)}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-status" className="block text-xs text-slate-500">
              {t('agreements.filterStatus')}
            </label>
            <select
              id="filter-status"
              className="mt-1 border border-line-200 bg-white px-2 py-1.5 text-sm"
            >
              <option>{t('agreements.anyStatus')}</option>
              <option>{t('agreements.statusActive')}</option>
              <option>{t('agreements.statusRenegotiating')}</option>
              <option>{t('agreements.statusProposed')}</option>
            </select>
          </div>
          <button
            type="button"
            className="rounded border border-line-200 px-3 py-1.5 text-sm text-ink-700 hover:border-signal-600"
          >
            {t('agreements.apply')}
          </button>
        </div>

        <div className="flex border border-line-200 bg-white" role="group" aria-label="View">
          <button
            type="button"
            onClick={() => setView('list')}
            aria-current={view === 'list' ? 'true' : undefined}
            className={`px-3 py-1.5 text-sm ${view === 'list' ? 'bg-signal-50 text-ink-950' : 'text-slate-500'}`}
          >
            {t('agreements.list')}
          </button>
          <button
            type="button"
            onClick={() => setView('graph')}
            aria-current={view === 'graph' ? 'true' : undefined}
            className={`border-s border-line-200 px-3 py-1.5 text-sm ${
              view === 'graph' ? 'bg-signal-50 text-ink-950' : 'text-slate-500'
            }`}
          >
            {t('agreements.graph')}
          </button>
        </div>
      </div>

      {view === 'graph' ? (
        <div className="border border-line-200 bg-white">
          <AgreementGraphI18n
            graph={graph}
            viewerPodIds={['pod-atlas']}
            podName={names.podName}
            holdingName={names.holdingById}
          />
          <p className="border-t border-line-200 px-3 py-2 text-xs text-slate-500">
            {t('agreements.footer')}
          </p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full min-w-150 text-start text-sm">
            <caption className="sr-only">{t('agreements.h1')}</caption>
            <thead className="border-b border-line-200 text-xs text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t('agreements.colName')}</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t('agreements.colPodA')}</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t('agreements.colPodB')}</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t('agreements.colService')}</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t('agreements.colStatus')}</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t('agreements.colRenewal')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-200">
              {ROWS.map((row) => (
                <tr key={row.id} className="hover:bg-paper-100">
                  <th scope="row" className="px-3 py-2.5 text-start font-normal text-ink-950">
                    {t(row.nameKey)}
                  </th>
                  <td className="px-3 py-2.5 text-slate-500">{names.podName(row.podAId)}</td>
                  <td className="px-3 py-2.5 text-slate-500">{names.podName(row.podBId)}</td>
                  <td className="max-w-60 px-3 py-2.5 text-slate-500">{t(row.descKey)}</td>
                  <td className="px-3 py-2.5">
                    <StatusChip tone={agreementStatusTone(row.status)} label={statusLabel(row)} />
                  </td>
                  <td className="tabular px-3 py-2.5 text-slate-500">{date(row.renewalDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'list' && (
        <p className="mt-4 max-w-prose text-xs text-slate-500">{t('agreements.footer')}</p>
      )}
    </div>
  );
}
