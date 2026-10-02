/**
 * `/hub/architecture` — the Architecture Hub console (Module 09).
 *
 * Two surfaces from the spec:
 *   - Model Health Overview — how many rule versions are live, how many
 *     changes are pending, and a changelog of the last 20 rule changes.
 *   - Rule Versioning (Module 08) — the current value of every registered
 *     rule and the proposal form. Every change is versioned, justified and
 *     public, and never takes effect before the next cycle.
 */

import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';
import type { CorrectionRecord, ModelHealth } from '../../../../lib/types-hub';
import { StatusChip } from '../../../../components/ui/StatusChip';
import { RuleProposalForm, type RuleOption } from '../../../../components/hub/RuleProposalForm';
import { CorrectionsPanel } from '../../../../components/hub/CorrectionsPanel';

export const dynamic = 'force-dynamic';

interface RuleRegistryEntry {
  key: string;
  label: string;
  source: string;
  defaultValue: unknown;
  currentValue: unknown;
  history: Array<{
    id: string;
    newValue: unknown;
    justification: string;
    effectiveCycleNumber: number;
    approvedAt: string | null;
    createdAt: string;
  }>;
}

interface PhasePayload {
  cycleNumber: number;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default async function ArchitectureHubPage() {
  const token = await getSessionToken();
  const today = new Date().toISOString().slice(0, 10);

  const [health, rules, phase, corrections] = await Promise.all([
    apiRequestOrNull<ModelHealth>('/api/hub/architecture/model-health', { token }),
    apiRequestOrNull<RuleRegistryEntry[]>('/api/hub/rules', { token }),
    apiRequestOrNull<PhasePayload>(`/api/calendar/phase?date=${today}`, { token }),
    apiRequestOrNull<CorrectionRecord[]>('/api/hub/corrections', { token }),
  ]);

  if (!health || !rules) {
    return (
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="font-display text-2xl text-ink-950">Architecture Hub</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            The design and rules layer of the model.
          </p>
        </header>
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">Architecture Hub only</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            Rule versioning and model health need the Architecture Hub seat.
          </p>
        </div>
      </div>
    );
  }

  const nextCycleNumber = (phase?.cycleNumber ?? 0) + 1;
  const ruleOptions: RuleOption[] = rules.map((rule) => ({
    key: rule.key,
    label: rule.label,
    currentValue: rule.currentValue,
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">Architecture Hub</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Model health and rule versioning. Changes are proposed, versioned and justified — and
          never apply to the cycle already running.
        </p>
      </header>

      {/* Model Health Overview */}
      <section className="mb-8" aria-labelledby="health-heading">
        <h2 id="health-heading" className="font-display text-lg text-ink-950">
          Model health overview
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded border border-line-200 bg-surface-white p-4">
            <p className="text-2xs uppercase tracking-wide text-slate-500">Active rule versions</p>
            <p className="mt-1 font-display text-2xl text-ink-950">{health.activeRuleCount}</p>
            <p className="mt-1 text-2xs text-slate-500">Distinct rules with a recorded version</p>
          </div>
          <div className="rounded border border-line-200 bg-surface-white p-4">
            <p className="text-2xs uppercase tracking-wide text-slate-500">Pending changes</p>
            <p className="mt-1 font-display text-2xl text-ink-950">{health.pendingChangeCount}</p>
            <p className="mt-1 text-2xs text-slate-500">Proposed, awaiting their effective cycle</p>
          </div>
          <div className="rounded border border-line-200 bg-surface-white p-4">
            <p className="text-2xs uppercase tracking-wide text-slate-500">Non-compliant pods</p>
            <p className="mt-1 font-display text-2xl text-ink-950">0</p>
            <p className="mt-1 text-2xs text-slate-500">
              Pods inside a rule&apos;s transition period
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Current rule values */}
        <section aria-labelledby="rules-heading">
          <h2 id="rules-heading" className="font-display text-lg text-ink-950">
            Registered rules
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            The current effective value of every rule the platform knows about.
          </p>
          <div className="mt-3 space-y-2">
            {rules.map((rule) => (
              <div key={rule.key} className="rounded border border-line-200 bg-surface-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-ink-950">{rule.label}</h3>
                  <StatusChip
                    tone={rule.history.length > 0 ? 'active' : 'neutral'}
                    label={`${rule.history.length} change(s)`}
                  />
                </div>
                <p className="mt-1 break-all font-mono text-2xs text-ink-700">
                  {rule.key} = {formatValue(rule.currentValue)}
                </p>
                {rule.history[0] && (
                  <p className="mt-1 text-2xs text-slate-500">
                    Last changed for cycle {rule.history[0].effectiveCycleNumber}:{' '}
                    {rule.history[0].justification.length > 90
                      ? `${rule.history[0].justification.slice(0, 90)}…`
                      : rule.history[0].justification}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Proposal form + changelog */}
        <div className="space-y-8">
          <section aria-labelledby="propose-heading">
            <h2 id="propose-heading" className="font-display text-lg text-ink-950">
              Propose a rule change
            </h2>
            <div className="mt-3 rounded border border-line-200 bg-surface-white p-4">
              <RuleProposalForm rules={ruleOptions} nextCycleNumber={nextCycleNumber} />
            </div>
          </section>

          <section aria-labelledby="changelog-heading">
            <h2 id="changelog-heading" className="font-display text-lg text-ink-950">
              Change log
            </h2>
            <p className="mt-1 text-xs text-slate-500">The last 20 rule changes, newest first.</p>
            <div className="mt-3 space-y-2">
              {health.changelog.length === 0 ? (
                <p className="rounded border border-dashed border-line-300 bg-surface-white px-4 py-6 text-center text-sm text-slate-500">
                  No rule changes yet — the model is running on its defaults.
                </p>
              ) : (
                health.changelog.map((change) => (
                  <div key={change.id} className="rounded border border-line-200 bg-surface-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-mono text-2xs text-ink-950">{change.ruleName}</h3>
                      <StatusChip
                        tone={change.approvedAt ? 'good' : 'watch'}
                        label={change.approvedAt ? 'approved' : 'pending'}
                      />
                    </div>
                    <p className="mt-1 text-2xs text-ink-700">
                      {formatValue(change.oldValue)} → {formatValue(change.newValue)}
                    </p>
                    <p className="mt-1 text-2xs text-slate-500">
                      Effective cycle {change.effectiveCycleNumber} ·{' '}
                      {change.justification.length > 100
                        ? `${change.justification.slice(0, 100)}…`
                        : change.justification}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Correction records — the one sanctioned path to fix a locked number */}
      <section className="mt-8" aria-labelledby="corrections-heading">
        <h2 id="corrections-heading" className="font-display text-lg text-ink-950">
          Corrections
        </h2>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Locked numbers never change in place. When one is genuinely wrong, a correction record is
          proposed and needs a second architect to approve it — the original stays visible, marked
          superseded, forever.
        </p>
        <div className="mt-3">
          <CorrectionsPanel corrections={corrections ?? []} />
        </div>
      </section>
    </div>
  );
}
