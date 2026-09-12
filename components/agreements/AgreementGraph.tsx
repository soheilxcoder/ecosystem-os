/**
 * Network graph view — 04-MODULE-CLOU-AGREEMENTS.md, screen `/agreements/active`.
 *
 * This is the visual teaching tool for the module's source rule: pods are
 * connected by a solid arrow only when a real, in-force CLOU exists between
 * them, and *every* pod is drawn with a faint dotted line to the central
 * "Platform & Budget Market" hub, because every pod shares the platform and the
 * budget market whether or not it trades with anybody.
 *
 * The dotted hub lines are computed on every render (never stored), so an
 * agreement ending immediately returns both pods to "connected only through the
 * platform" with no cleanup job.
 */

import Link from 'next/link';
import type { AgreementGraph } from '../../core/agreements';

export interface AgreementGraphProps {
  graph: AgreementGraph;
  /** Pod the viewer filtered to — highlighted, the rest are dimmed. */
  focusPodId?: string | null;
  /** Pods the viewer currently leads. */
  viewerPodIds?: string[];
  /** Link target builder for a pod node. */
  podHref?: (podId: string) => string;
}

const HUB_FILL = '#f1f3f0';
const NODE_FILL = '#ffffff';
const FOCUS_FILL = '#edf5f2';

export function AgreementGraphView({
  graph,
  focusPodId = null,
  viewerPodIds = [],
  podHref = (podId) => `/agreements?podId=${podId}&view=graph`,
}: AgreementGraphProps) {
  const { hub, nodes, edges, hubEdges, width, height, nodeRadius } = graph;
  const half = { x: width / 2, y: height / 2 };
  const unconnected = nodes.filter((node) => node.agreementCount === 0);

  const summary =
    `${nodes.length} pods. ${edges.length} direct agreement${edges.length === 1 ? '' : 's'} in force. ` +
    (unconnected.length === 0
      ? 'Every pod is connected by at least one agreement.'
      : `${unconnected.length} pod${unconnected.length === 1 ? '' : 's'} — ${unconnected
          .map((node) => node.name)
          .join(', ')} — ${unconnected.length === 1 ? 'is' : 'are'} connected only through the platform and budget market.`);

  return (
    <div>
      <div className="border border-line-200 bg-white p-3">
        <svg
          viewBox={`${-half.x} ${-half.y} ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={summary}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <marker
              id="cloud-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#1e6f5c" />
            </marker>
            <marker
              id="cloud-arrow-start"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#1e6f5c" />
            </marker>
            <marker
              id="cloud-arrow-watch"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#b7791f" />
            </marker>
          </defs>

          {/* Shared infrastructure: computed for every pod, always. */}
          <g>
            {hubEdges.map((edge) => {
              const node = nodes.find((item) => item.id === edge.podId);
              const dimmed = Boolean(focusPodId) && edge.podId !== focusPodId;
              return (
                <path
                  key={`hub-${edge.podId}`}
                  d={edge.path}
                  fill="none"
                  stroke="var(--line-300)"
                  strokeWidth={1}
                  strokeDasharray="2 6"
                  opacity={dimmed ? 0.35 : 0.9}
                  aria-hidden
                />
              );
            })}
          </g>

          {/* Real agreements: solid, directed, labelled with the service. */}
          <g>
            {edges.map((edge) => {
              const dimmed =
                Boolean(focusPodId) && edge.fromPodId !== focusPodId && edge.toPodId !== focusPodId;
              const stroke = edge.kind === 'renegotiating' ? '#b7791f' : '#1e6f5c';
              return (
                <g key={edge.id} opacity={dimmed ? 0.25 : 1}>
                  <path
                    d={edge.path}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={1.75}
                    markerEnd={`url(#${edge.kind === 'renegotiating' ? 'cloud-arrow-watch' : 'cloud-arrow'})`}
                    {...(edge.bidirectional
                      ? { markerStart: 'url(#cloud-arrow-start)' }
                      : {})}
                  />
                  <text
                    x={edge.labelX}
                    y={edge.labelY}
                    textAnchor="middle"
                    className="tabular"
                    fontSize={9}
                    fill="var(--slate-500)"
                  >
                    {edge.serviceLabel}
                  </text>
                </g>
              );
            })}
          </g>

          {/* The hub: shared infrastructure, not a pod. */}
          <g>
            <circle
              cx={hub.x}
              cy={hub.y}
              r={hub.radius}
              fill={HUB_FILL}
              stroke="var(--line-300)"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <text
              x={hub.x}
              y={hub.y - 6}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill="var(--ink-700)"
            >
              Platform &amp;
            </text>
            <text
              x={hub.x}
              y={hub.y + 8}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill="var(--ink-700)"
            >
              Budget Market
            </text>
          </g>

          {/* Pods. */}
          <g>
            {nodes.map((node) => {
              const isFocus = node.id === focusPodId;
              const dimmed = Boolean(focusPodId) && !isFocus;
              const isMine = viewerPodIds.includes(node.id);
              return (
                <g key={node.id} opacity={dimmed ? 0.45 : 1}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={nodeRadius}
                    fill={isFocus || isMine ? FOCUS_FILL : NODE_FILL}
                    stroke={isFocus ? 'var(--signal-600)' : 'var(--line-300)'}
                    strokeWidth={isFocus ? 2 : 1}
                  />
                  <text
                    x={node.x}
                    y={node.y + 3}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill="var(--ink-950)"
                  >
                    {shortName(node.name)}
                  </text>
                  <text
                    x={node.x}
                    y={node.y + nodeRadius + 13}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--slate-500)"
                  >
                    {node.agreementCount === 0
                      ? 'no direct CLOU'
                      : `${node.agreementCount} CLOU${node.agreementCount === 1 ? '' : 's'}`}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Legend — the rule stated in words as well as in lines (§6: colour and
          shape are never the only carrier of meaning). */}
      <ul className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-500 sm:grid-cols-3">
        <li className="flex items-start gap-2">
          <svg width="34" height="10" aria-hidden className="mt-1 shrink-0">
            <line x1="0" y1="5" x2="34" y2="5" stroke="#1e6f5c" strokeWidth="1.75" />
            <path d="M 30 1 L 34 5 L 30 9 z" fill="#1e6f5c" />
          </svg>
          <span>
            Solid arrow = a real CLOU. The arrowhead points from the serving pod to the pod being
            served.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <svg width="34" height="10" aria-hidden className="mt-1 shrink-0">
            <line
              x1="0"
              y1="5"
              x2="34"
              y2="5"
              stroke="var(--line-300)"
              strokeWidth="1"
              strokeDasharray="2 6"
            />
          </svg>
          <span>
            Dotted line = shared infrastructure only. These pods use the same platform and budget
            market but exchange nothing directly.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <svg width="34" height="10" aria-hidden className="mt-1 shrink-0">
            <line x1="0" y1="5" x2="34" y2="5" stroke="#b7791f" strokeWidth="1.75" />
          </svg>
          <span>Amber = in force, but under renegotiation.</span>
        </li>
      </ul>

      <p className="mt-3 text-sm text-ink-700">{summary}</p>

      {unconnected.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2 text-xs">
          {unconnected.map((node) => (
            <li key={node.id}>
              <Link
                href={podHref(node.id)}
                className="inline-flex items-center gap-1 border border-line-200 bg-white px-2 py-1 text-ink-700 hover:border-signal-600"
              >
                {node.name}
                <span className="text-slate-500">· {node.holdingName}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** "Pod Atlas" → "Atlas": node labels are short by necessity. */
function shortName(name: string): string {
  const trimmed = name.replace(/^pod\s+/i, '').trim();
  return trimmed.length > 10 ? `${trimmed.slice(0, 9)}…` : trimmed;
}
