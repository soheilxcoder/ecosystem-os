/**
 * i18n-aware copy of the CLOU network graph. Same SVG geometry as the
 * production AgreementGraphView; only the drawn labels, legend and summary
 * are translated. The layout itself still comes from computeAgreementGraph.
 */
import Link from '../shims/link';
import type { AgreementGraph } from '../../../core/agreements';
import { useI18n } from '../i18n';

const HUB_FILL = '#f1f3f0';
const NODE_FILL = '#ffffff';
const FOCUS_FILL = '#edf5f2';

export function AgreementGraphI18n({
  graph,
  focusPodId = null,
  viewerPodIds = [],
  podName: podNameFor,
  holdingName: holdingNameFor,
  podHref = (podId) => `#/pod/${podId}`,
}: {
  graph: AgreementGraph;
  focusPodId?: string | null;
  viewerPodIds?: string[];
  /** Resolve a pod's display name for the current language. */
  podName: (podId: string) => string;
  holdingName: (holdingId: string) => string;
  podHref?: (podId: string) => string;
}) {
  const { t, num } = useI18n();
  const { hub, nodes, edges, hubEdges, width, height, nodeRadius } = graph;
  const half = { x: width / 2, y: height / 2 };

  return (
    <div>
      <div className="border border-line-200 bg-white p-3">
        <svg
          viewBox={`${-half.x} ${-half.y} ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={t('agreements.summary', {
            pods: num(nodes.length),
            edges: num(edges.length),
          })}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <marker id="cloud-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#1e6f5c" />
            </marker>
            <marker id="cloud-arrow-start" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#1e6f5c" />
            </marker>
            <marker id="cloud-arrow-watch" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#b7791f" />
            </marker>
          </defs>

          {/* Shared infrastructure — dashed to the platform hub. */}
          <g>
            {hubEdges.map((edge) => {
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

          {/* Real agreements — solid, directed, labelled. */}
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
                    {...(edge.bidirectional ? { markerStart: 'url(#cloud-arrow-start)' } : {})}
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

          {/* The hub. */}
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
            <text x={hub.x} y={hub.y - 6} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--ink-700)">
              {t('agreements.hubLabel')}
            </text>
            <text x={hub.x} y={hub.y + 10} textAnchor="middle" fontSize={8.5} fill="var(--slate-500)">
              {t('agreements.hubSub')}
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
                    {shortName(podNameFor(node.id))}
                  </text>
                  <text
                    x={node.x}
                    y={node.y + nodeRadius + 13}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--slate-500)"
                  >
                    {node.agreementCount === 0
                      ? t('agreements.noClou')
                      : `${num(node.agreementCount)} CLOU`}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-500 sm:grid-cols-3">
        <li className="flex items-start gap-2">
          <svg width="34" height="10" aria-hidden className="mt-1 shrink-0">
            <line x1="0" y1="5" x2="34" y2="5" stroke="#1e6f5c" strokeWidth="1.75" />
            <path d="M 30 1 L 34 5 L 30 9 z" fill="#1e6f5c" />
          </svg>
          <span>{t('agreements.legendSolid')}</span>
        </li>
        <li className="flex items-start gap-2">
          <svg width="34" height="10" aria-hidden className="mt-1 shrink-0">
            <line x1="0" y1="5" x2="34" y2="5" stroke="var(--line-300)" strokeWidth="1" strokeDasharray="2 6" />
          </svg>
          <span>{t('agreements.legendDotted')}</span>
        </li>
        <li className="flex items-start gap-2">
          <svg width="34" height="10" aria-hidden className="mt-1 shrink-0">
            <line x1="0" y1="5" x2="34" y2="5" stroke="#b7791f" strokeWidth="1.75" />
          </svg>
          <span>{t('agreements.legend')}</span>
        </li>
      </ul>
    </div>
  );
}

/** «پاد اطلس» → «اطلس»: node labels are short by necessity. */
function shortName(name: string): string {
  const trimmed = name.replace(/^(pod|پاد)\s+/i, '').trim();
  return trimmed.length > 10 ? `${trimmed.slice(0, 9)}…` : trimmed;
}
