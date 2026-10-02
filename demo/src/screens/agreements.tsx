/**
 * CLOU Agreements — the contract graph between pods, adapted from the live
 * module: filter bar, list view and the real network graph view.
 */
import { useState } from 'react';
import { AgreementGraphView } from '../../../components/agreements/AgreementGraph';
import { StatusChip } from '../../../components/ui/StatusChip';
import { agreementStatusTone } from '../../../lib/agreements';
import { DISPLAY_STATUS_LABELS, computeAgreementGraph, displayStatus } from '../../../core/agreements';
import { PODS, TODAY } from '../data';

type Status = 'active' | 'proposed' | 'renegotiating';

interface AgreementRow {
  id: string;
  name: string;
  podAId: string;
  podBId: string;
  serviceDescription: string;
  status: Status;
  startDate: string;
  renewalDate: string;
}

const ROWS: AgreementRow[] = [
  {
    id: 'ag-1',
    name: 'Reconciliation data feed',
    podAId: 'pod-atlas',
    podBId: 'pod-basalt',
    serviceDescription: 'Basalt streams normalised transaction data to Atlas nightly.',
    status: 'active',
    startDate: '2026-06-15',
    renewalDate: '2026-12-15',
  },
  {
    id: 'ag-2',
    name: 'Shared QA environment',
    podAId: 'pod-basalt',
    podBId: 'pod-cinder',
    serviceDescription: 'Cinder maintains the staging cluster both pods deploy into.',
    status: 'active',
    startDate: '2026-08-01',
    renewalDate: '2026-11-01',
  },
  {
    id: 'ag-3',
    name: 'Incident escalation channel',
    podAId: 'pod-atlas',
    podBId: 'pod-ember',
    serviceDescription: 'Joint on-call rota for payment-rail incidents.',
    status: 'proposed',
    startDate: '2026-09-25',
    renewalDate: '2027-03-25',
  },
];

const podName = (podId: string) => PODS.find((pod) => pod.id === podId)?.name ?? podId;

export function AgreementsScreen() {
  const [view, setView] = useState<'list' | 'graph'>('list');

  const graph = computeAgreementGraph({
    pods: PODS.map((pod) => ({
      id: pod.id,
      name: pod.name,
      holdingId: pod.holdingName === 'Holding Pars' ? 'holding-pars' : 'holding-dena',
      holdingName: pod.holdingName,
      status: pod.status,
    })),
    agreements: ROWS.map((row) => ({
      id: row.id,
      podAId: row.podAId,
      podBId: row.podBId,
      name: row.name,
      serviceDescription: row.serviceDescription,
      direction: 'bidirectional' as const,
      status: row.status,
      renewalDate: row.renewalDate,
    })),
    today: TODAY,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="font-display text-2xl text-ink-950">CLOU agreements</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Cloud Operating-Level Undertakings — the contracts between pods. Two pods are connected
          if and only if a live CLOU exists between them.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="filter-pod" className="block text-xs text-slate-500">Pod</label>
            <select id="filter-pod" className="mt-1 border border-line-200 bg-white px-2 py-1.5 text-sm">
              <option>All pods</option>
              {PODS.map((pod) => (
                <option key={pod.id}>{pod.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-status" className="block text-xs text-slate-500">Status</label>
            <select id="filter-status" className="mt-1 border border-line-200 bg-white px-2 py-1.5 text-sm">
              <option>Any status</option>
              <option>Active</option>
              <option>Under renegotiation</option>
              <option>Awaiting response</option>
            </select>
          </div>
          <button
            type="button"
            className="rounded border border-line-200 px-3 py-1.5 text-sm text-ink-700 hover:border-signal-600"
          >
            Apply
          </button>
        </div>

        <div className="flex border border-line-200 bg-white" role="group" aria-label="View">
          <button
            type="button"
            onClick={() => setView('list')}
            aria-current={view === 'list' ? 'true' : undefined}
            className={`px-3 py-1.5 text-sm ${view === 'list' ? 'bg-signal-50 text-ink-950' : 'text-slate-500'}`}
          >
            List view
          </button>
          <button
            type="button"
            onClick={() => setView('graph')}
            aria-current={view === 'graph' ? 'true' : undefined}
            className={`border-l border-line-200 px-3 py-1.5 text-sm ${
              view === 'graph' ? 'bg-signal-50 text-ink-950' : 'text-slate-500'
            }`}
          >
            Network graph view
          </button>
        </div>
      </div>

      {view === 'graph' ? (
        <div className="border border-line-200 bg-white">
          <AgreementGraphView graph={graph} viewerPodIds={['pod-atlas']} podHref={(podId) => `#/pod/${podId}`} />
        </div>
      ) : (
        <div className="overflow-x-auto border border-line-200 bg-white">
          <table className="w-full min-w-150 text-left text-sm">
            <caption className="sr-only">CLOU agreements</caption>
            <thead className="border-b border-line-200 text-xs text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Agreement name</th>
                <th scope="col" className="px-3 py-2 font-medium">Pod A</th>
                <th scope="col" className="px-3 py-2 font-medium">Pod B</th>
                <th scope="col" className="px-3 py-2 font-medium">Service description</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 font-medium">Renewal date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-200">
              {ROWS.map((row) => {
                const shown = displayStatus(
                  { status: row.status, renewalDate: row.renewalDate },
                  TODAY,
                );
                return (
                  <tr key={row.id} className="hover:bg-paper-100">
                    <th scope="row" className="px-3 py-2.5 text-left font-normal text-ink-950">
                      {row.name}
                    </th>
                    <td className="px-3 py-2.5 text-slate-500">{podName(row.podAId)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{podName(row.podBId)}</td>
                    <td className="max-w-60 px-3 py-2.5 text-slate-500">{row.serviceDescription}</td>
                    <td className="px-3 py-2.5">
                      <StatusChip tone={agreementStatusTone(shown)} label={DISPLAY_STATUS_LABELS[shown]} />
                    </td>
                    <td className="tabular px-3 py-2.5 text-slate-500">{row.renewalDate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 max-w-prose text-xs text-slate-500">
        Dashed lines to the centre are not agreements — they are the platform and budget market,
        which every pod shares. A direct line between two pods always means a live CLOU.
      </p>
    </div>
  );
}
