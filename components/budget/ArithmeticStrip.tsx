'use client';

/**
 * Budget arithmetic strip — 16-VISUAL-ASSETS-MASTER-PLAN.md §3.8.
 *
 * "This is not a chart. It is the arithmetic itself, rendered." The whole point
 * of the module is that a number can be traced to the operations that produced
 * it, so this component shows the operations rather than a bar whose length
 * somebody would have to interpret.
 *
 * Motion rule from §3.8: clauses reveal left to right in sequence, ~300ms each,
 * about 1.2s total — **on first load only**, and never again for a cycle that
 * has been locked. A locked number is a settled fact; re-animating it would
 * suggest it had just been recalculated.
 */

import { useEffect, useState } from 'react';

export interface ArithmeticClause {
  /** The weight as a fraction, e.g. 0.4 — rendered with two decimals. */
  weight: number;
  /** The component score, 0–100. */
  score: number;
  /** What the clause measures, for the accessible name. */
  label: string;
}

export interface ArithmeticStripProps {
  clauses: ArithmeticClause[];
  /** The weighted sum, already computed by core/budget.ts. */
  result: number;
  /** The result's name, e.g. "Unit Score". */
  resultLabel?: string;
  /** A locked cycle does not animate: its number is settled, not fresh. */
  locked?: boolean;
  className?: string;
}

const CLAUSE_MS = 300;

export function ArithmeticStrip({
  clauses,
  result,
  resultLabel = 'Unit Score',
  locked = false,
  className = '',
}: ArithmeticStripProps) {
  const [revealed, setRevealed] = useState(locked ? clauses.length + 1 : 0);

  useEffect(() => {
    if (locked) {
      setRevealed(clauses.length + 1);
      return;
    }
    let clause = 0;
    const timer = window.setInterval(() => {
      clause += 1;
      setRevealed(clause);
      if (clause > clauses.length) window.clearInterval(timer);
    }, CLAUSE_MS);
    return () => window.clearInterval(timer);
  }, [locked, clauses.length]);

  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-sm ${className}`}
      // The accessible name is the whole equation, so a screen reader gets the
      // arithmetic in one pass instead of six unlabelled fragments.
      aria-label={`${resultLabel}: ${clauses
        .map((clause) => `${clause.weight.toFixed(2)} times ${clause.score} ${clause.label}`)
        .join(', plus ')}, equals ${result}`}
    >
      {clauses.map((clause, index) => {
        const visible = revealed > index;
        return (
          <span key={clause.label} className="flex items-baseline gap-x-2">
            {index > 0 && (
              <span
                aria-hidden
                className="text-slate-300 transition-opacity duration-motion-2"
                style={{ opacity: visible ? 1 : 0 }}
              >
                +
              </span>
            )}
            <span
              className="whitespace-nowrap transition-opacity duration-motion-2"
              style={{ opacity: visible ? 1 : 0 }}
              title={clause.label}
            >
              <span className="text-slate-500">({clause.weight.toFixed(2)}</span>
              <span className="text-slate-300"> × </span>
              <span className="text-ink-950">{clause.score}</span>
              <span className="text-slate-500">)</span>
            </span>
          </span>
        );
      })}

      <span
        aria-hidden
        className="text-slate-300 transition-opacity duration-motion-2"
        style={{ opacity: revealed > clauses.length ? 1 : 0 }}
      >
        =
      </span>
      <span
        className="font-display text-xl text-ink-950 transition-opacity duration-motion-2"
        style={{ opacity: revealed > clauses.length ? 1 : 0 }}
      >
        {result}
      </span>
      <span
        className="font-sans text-xs text-slate-500 transition-opacity duration-motion-2"
        style={{ opacity: revealed > clauses.length ? 1 : 0 }}
      >
        {resultLabel}
      </span>
    </div>
  );
}
