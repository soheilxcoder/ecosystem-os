'use client';

/**
 * The Step-2 term fields, shared by the proposal wizard, the counter-proposal
 * form and the renegotiation form.
 *
 * One component for all three because the negotiable terms are identical in
 * each case — a counter-proposal is not a different data shape, just a
 * different direction of travel. The component is fully controlled so a parent
 * (the wizard's review step, or a counter form) always holds the single source
 * of truth for what will be submitted.
 */

import { CADENCE_LABELS, DIRECTION_LABELS, FREQUENCY_LABELS } from '../../core/agreements';
import type {
  CloudCadence,
  CloudDirection,
  CloudFrequency,
  CloudPricingModel,
  CloudPricingTerms,
} from '../../core/types';

export interface TermsValue {
  name: string;
  serviceDescription: string;
  direction: CloudDirection;
  cadence: CloudCadence;
  frequency: CloudFrequency | '';
  pricingModel: CloudPricingModel | '';
  pricingAmount: string;
  pricingUnit: string;
  pricingNotes: string;
}

export function initialTermsValue(defaults?: {
  name?: string;
  serviceDescription?: string;
  direction?: CloudDirection;
  cadence?: CloudCadence;
  frequency?: CloudFrequency | null;
  pricingTerms?: CloudPricingTerms;
}): TermsValue {
  return {
    name: defaults?.name ?? '',
    serviceDescription: defaults?.serviceDescription ?? '',
    direction: defaults?.direction ?? 'a_to_b',
    cadence: defaults?.cadence ?? 'one_time',
    frequency: defaults?.frequency ?? '',
    pricingModel: defaults?.pricingTerms?.model ?? '',
    pricingAmount: defaults?.pricingTerms?.amount ?? '',
    pricingUnit: defaults?.pricingTerms?.unit ?? '',
    pricingNotes: defaults?.pricingTerms?.notes ?? '',
  };
}

export interface TermsFieldsProps {
  value: TermsValue;
  onChange: (next: TermsValue) => void;
  showName?: boolean;
  showDescription?: boolean;
  podAName?: string;
  podBName?: string;
  idPrefix?: string;
}

const PRICING_LABELS: Array<{ value: CloudPricingModel | ''; label: string }> = [
  { value: '', label: 'No internal transfer price' },
  { value: 'fixed_fee', label: 'Fixed fee' },
  { value: 'per_unit', label: 'Per unit' },
  { value: 'revenue_share', label: 'Revenue share' },
  { value: 'other', label: 'Something else (described)' },
];

const inputClass =
  'mt-1 w-full border border-line-200 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600';
const labelClass = 'block text-xs font-medium text-ink-700';

export function TermsFields({
  value,
  onChange,
  showName = true,
  showDescription = true,
  podAName = 'Pod A',
  podBName = 'Pod B',
  idPrefix = 'terms',
}: TermsFieldsProps) {
  const set = <K extends keyof TermsValue>(key: K, next: TermsValue[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="space-y-4">
      {showName ? (
        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-name`}>
            Agreement name <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id={`${idPrefix}-name`}
            name="name"
            className={inputClass}
            maxLength={140}
            value={value.name}
            placeholder={`${podAName} ↔ ${podBName}`}
            onChange={(event) => set('name', event.target.value)}
          />
        </div>
      ) : null}

      {showDescription ? (
        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-service`}>
            Service description
          </label>
          <textarea
            id={`${idPrefix}-service`}
            name="serviceDescription"
            rows={4}
            className={inputClass}
            value={value.serviceDescription}
            onChange={(event) => set('serviceDescription', event.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            What is actually exchanged, and how often. This is the one field a CLOU cannot exist
            without.
          </p>
        </div>
      ) : (
        <input type="hidden" name="serviceDescription" value={value.serviceDescription} />
      )}

      <div>
        <span className={labelClass}>Direction</span>
        <div className="mt-1 space-y-1">
          {(['a_to_b', 'b_to_a', 'bidirectional'] as CloudDirection[]).map((option) => (
            <label key={option} className="flex items-start gap-2 text-sm text-ink-950">
              <input
                type="radio"
                name="direction"
                value={option}
                checked={value.direction === option}
                className="mt-1"
                onChange={() => set('direction', option)}
              />
              <span>{directionLabel(option, podAName, podBName)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-cadence`}>
            Cadence
          </label>
          <select
            id={`${idPrefix}-cadence`}
            name="cadence"
            className={inputClass}
            value={value.cadence}
            onChange={(event) => {
              const cadence = event.target.value as CloudCadence;
              onChange({ ...value, cadence, frequency: cadence === 'one_time' ? '' : value.frequency });
            }}
          >
            {(['one_time', 'recurring'] as CloudCadence[]).map((option) => (
              <option key={option} value={option}>
                {CADENCE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        {value.cadence === 'recurring' ? (
          <div>
            <label className={labelClass} htmlFor={`${idPrefix}-frequency`}>
              Frequency
            </label>
            <select
              id={`${idPrefix}-frequency`}
              name="frequency"
              className={inputClass}
              value={value.frequency}
              onChange={(event) => set('frequency', event.target.value as CloudFrequency | '')}
            >
              <option value="">Choose how often…</option>
              {(Object.keys(FREQUENCY_LABELS) as CloudFrequency[]).map((option) => (
                <option key={option} value={option}>
                  {FREQUENCY_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <fieldset className="border border-line-200 p-3">
        <legend className="px-1 text-xs font-medium text-ink-700">
          Pricing / internal transfer terms
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor={`${idPrefix}-pricing-model`}>
              Model
            </label>
            <select
              id={`${idPrefix}-pricing-model`}
              name="pricingModel"
              className={inputClass}
              value={value.pricingModel}
              onChange={(event) =>
                set('pricingModel', event.target.value as CloudPricingModel | '')
              }
            >
              {PRICING_LABELS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {value.pricingModel === 'fixed_fee' || value.pricingModel === 'revenue_share' ? (
            <div>
              <label className={labelClass} htmlFor={`${idPrefix}-pricing-amount`}>
                {value.pricingModel === 'fixed_fee' ? 'Fee' : 'Share'}
              </label>
              <input
                id={`${idPrefix}-pricing-amount`}
                name="pricingAmount"
                className={inputClass}
                value={value.pricingAmount}
                placeholder={value.pricingModel === 'fixed_fee' ? 'e.g. 250 units' : 'e.g. 4%'}
                onChange={(event) => set('pricingAmount', event.target.value)}
              />
            </div>
          ) : null}

          {value.pricingModel === 'per_unit' ? (
            <>
              <div>
                <label className={labelClass} htmlFor={`${idPrefix}-pricing-amount`}>
                  Rate
                </label>
                <input
                  id={`${idPrefix}-pricing-amount`}
                  name="pricingAmount"
                  className={inputClass}
                  value={value.pricingAmount}
                  placeholder="e.g. 3"
                  onChange={(event) => set('pricingAmount', event.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`${idPrefix}-pricing-unit`}>
                  Per
                </label>
                <input
                  id={`${idPrefix}-pricing-unit`}
                  name="pricingUnit"
                  className={inputClass}
                  value={value.pricingUnit}
                  placeholder="e.g. report"
                  onChange={(event) => set('pricingUnit', event.target.value)}
                />
              </div>
            </>
          ) : null}

          {value.pricingModel === 'other' ? (
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor={`${idPrefix}-pricing-notes`}>
                Describe the arrangement
              </label>
              <input
                id={`${idPrefix}-pricing-notes`}
                name="pricingNotes"
                className={inputClass}
                value={value.pricingNotes}
                onChange={(event) => set('pricingNotes', event.target.value)}
              />
            </div>
          ) : null}
        </div>
      </fieldset>

      <p className="text-xs text-slate-500">
        Escalation contacts are not entered here: each pod&apos;s current Pod Lead is resolved live,
        so the agreement never points at somebody who has rotated out.
      </p>
    </div>
  );
}

function directionLabel(direction: CloudDirection, podAName: string, podBName: string): string {
  switch (direction) {
    case 'a_to_b':
      return `${podAName} serves ${podBName} (Pod A → Pod B)`;
    case 'b_to_a':
      return `${podBName} serves ${podAName} (Pod B → Pod A)`;
    default:
      return `${DIRECTION_LABELS[direction]} — both pods serve each other`;
  }
}
