'use client';

/**
 * Marks one notification read (Module 11). Reading is a quiet acknowledgement,
 * not the completion of anything — completing the underlying action is what
 * clears a Needs-Action item, and that happens on its own.
 */

import { useActionState } from 'react';
import { markNotificationRead } from '../../app/actions/notifications';

export function MarkReadButton({ id }: { id: string }) {
  const [, action, pending] = useActionState(markNotificationRead, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line-300 bg-white px-2 py-0.5 text-2xs text-slate-500 hover:border-signal-600 hover:text-signal-600 disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Mark read'}
      </button>
    </form>
  );
}
