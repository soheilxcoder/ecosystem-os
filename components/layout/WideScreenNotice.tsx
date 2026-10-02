/**
 * "Best on larger screens" notice (12-DESIGN-SYSTEM.md §6).
 *
 * The Hub Console and the Budget history table are dense, wide surfaces. Below
 * 768px they stay fully usable — the design rules out blocking access — but a
 * one-line notice sets the expectation instead of letting a cramped layout
 * speak for itself. Renders only under `md`, never replaces content.
 */
export function WideScreenNotice({ surface }: { surface: string }) {
  return (
    <p
      className="mb-4 rounded border border-line-200 border-l-2 border-l-status-watch bg-surface-white px-3 py-2 text-xs text-slate-500 md:hidden"
      role="note"
    >
      {surface} is designed for larger screens. Everything below remains
      readable here — for the full layout, open it on a wider display.
    </p>
  );
}
