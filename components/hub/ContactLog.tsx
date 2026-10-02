'use client';

/**
 * The external contact log (Module 09, Strategic Interactions).
 *
 * Deliberately lightweight — a relationship ledger, not a CRM. Adding a
 * contact and logging an interaction are the only writes; everything else the
 * hub needs lives in the Strategic Interactions hub's own notes discipline.
 */

import { useState } from 'react';
import { useActionState } from 'react';
import { addContact, logInteractionAction, type HubActionState } from '../../app/actions/hub';

const RELATIONSHIP_TYPES = [
  { value: 'investor', label: 'Investor' },
  { value: 'partner', label: 'Partner' },
  { value: 'media', label: 'Media' },
  { value: 'institution', label: 'Institution' },
] as const;

export function AddContactForm() {
  const [state, formAction, pending] = useActionState<HubActionState, FormData>(addContact, {});

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-ink-950" htmlFor="contactName">
            Name
          </label>
          <input
            id="contactName"
            name="name"
            required
            placeholder="e.g. Nordwind Capital"
            className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-950" htmlFor="relationshipType">
            Relationship
          </label>
          <select
            id="relationshipType"
            name="relationshipType"
            className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
          >
            {RELATIONSHIP_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-950" htmlFor="contactNotes">
          Notes <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <textarea
          id="contactNotes"
          name="notes"
          rows={2}
          className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      {state.error && (
        <p className="rounded border border-status-alert/40 bg-white px-3 py-2 text-sm text-ink-950" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded border border-status-good/40 bg-white px-3 py-2 text-sm text-ink-950">
          {state.success}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-ink-950 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-ink-800 disabled:opacity-60"
      >
        {pending ? 'Adding…' : 'Add contact'}
      </button>
    </form>
  );
}

export function InteractionForm({ contactId, contactName }: { contactId: string; contactName: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-2xs font-medium text-ink-700 underline-offset-2 hover:underline"
      >
        Log interaction
      </button>
    );
  }

  return (
    <form
      action={logInteractionAction.bind(null, contactId)}
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={() => setOpen(false)}
    >
      <input
        type="text"
        name="notes"
        placeholder={`Notes for the ${contactName} interaction…`}
        className="w-full min-w-[200px] flex-1 rounded border border-line-300 px-2.5 py-1.5 text-xs"
      />
      <button
        type="submit"
        className="rounded bg-ink-950 px-2.5 py-1 text-2xs font-medium text-white hover:bg-ink-800"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded border border-line-300 px-2.5 py-1 text-2xs text-ink-700"
      >
        Cancel
      </button>
    </form>
  );
}
