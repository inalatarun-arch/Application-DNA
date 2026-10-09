import type { Palette } from '@/config/palette';
import { wrapText, type FlowLayout, type PNode } from '@/lib/flowLayout';
import type { FlowView } from '@/lib/flowModel';

interface Props {
  layout: FlowLayout;
  view: FlowView;
  palette: Palette;
  title: string;
  /** Unique per rendered diagram so arrowhead markers never collide. */
  idPrefix: string;
  scale?: number;
  onNodeClick?: (node: PNode) => void;
}

const FONT = '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

function NodeShape({ n, palette }: { n: PNode; palette: Palette }) {
  const left = n.x - n.w / 2;
  const top = n.y - n.h / 2;
  switch (n.kind) {
    case 'start':
    case 'end':
      return <rect x={left} y={top} width={n.w} height={n.h} rx={n.h / 2} fill={palette.accent} stroke={palette.accent} strokeWidth={1.5} />;
    case 'decision':
      return (
        <polygon
          points={`${n.x},${top} ${n.x + n.w / 2},${n.y} ${n.x},${top + n.h} ${n.x - n.w / 2},${n.y}`}
          fill={palette.panelAlt}
          stroke={palette.text}
          strokeWidth={1.5}
        />
      );
    case 'data':
      return (
        <polygon
          points={`${left + 14},${top} ${left + n.w},${top} ${left + n.w - 14},${top + n.h} ${left},${top + n.h}`}
          fill={palette.panel}
          stroke={palette.edge}
          strokeWidth={1.5}
        />
      );
    default:
      return <rect x={left} y={top} width={n.w} height={n.h} rx={6} fill={palette.bg} stroke={palette.edge} strokeWidth={1.5} />;
  }
}

/** Pure SVG renderer, so the same markup can be shown on screen and exported as SVG/PNG. */
export default function FlowDiagram({ layout, view, palette, title, idPrefix, scale = 1, onNodeClick }: Props) {
  const arrow = `${idPrefix}-arrow`;
  const { width, height } = layout;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={Math.round(width * scale)}
      height={Math.round(height * scale)}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title}
      fontFamily={FONT}
    >
      <title>{title}</title>
      <defs>
        <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={palette.edge} />
        </marker>
      </defs>
      <rect x={0} y={0} width={width} height={height} fill={palette.bg} />

      {view === 'swimlane' &&
        layout.lanes.map((lane, i) => {
          const lines = wrapText(lane.name, 17, 4);
          return (
            <g key={lane.name}>
              <rect x={0} y={lane.y} width={width} height={lane.h} fill={i % 2 === 0 ? palette.bg : palette.panel} />
              <rect x={0} y={lane.y} width={layout.laneLabelW} height={lane.h} fill={palette.panelAlt} stroke={palette.border} strokeWidth={1} />
              <text x={layout.laneLabelW / 2} y={lane.y + lane.h / 2 - ((lines.length - 1) * 8)} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600} fill={palette.text}>
                {lines.map((line, li) => (
                  <tspan key={li} x={layout.laneLabelW / 2} dy={li === 0 ? 0 : 16}>
                    {line}
                  </tspan>
                ))}
              </text>
              <line x1={0} y1={lane.y + lane.h} x2={width} y2={lane.y + lane.h} stroke={palette.border} strokeWidth={1} />
            </g>
          );
        })}

      {layout.edges.map((e, i) => (
        <g key={i}>
          <path d={e.d} fill="none" stroke={palette.edge} strokeWidth={1.5} strokeDasharray={e.dashed || e.back ? '5 4' : undefined} markerEnd={`url(#${arrow})`} />
          {e.label && (
            <text x={e.lx} y={e.ly} textAnchor="middle" fontSize={11} fill={palette.muted} stroke={palette.bg} strokeWidth={3} paintOrder="stroke">
              {e.label}
            </text>
          )}
        </g>
      ))}

      {layout.nodes.map((n) => {
        const lines = wrapText(n.label, n.kind === 'decision' ? 15 : 24, 3);
        const textColor = n.kind === 'start' || n.kind === 'end' ? palette.onAccent : palette.text;
        const clickable = !!n.to && !!onNodeClick;
        return (
          <g
            key={n.id}
            style={clickable ? { cursor: 'pointer' } : undefined}
            onClick={clickable ? () => onNodeClick?.(n) : undefined}
            onKeyDown={clickable ? (e) => (e.key === 'Enter' || e.key === ' ') && onNodeClick?.(n) : undefined}
            role={clickable ? 'link' : undefined}
            tabIndex={clickable ? 0 : undefined}
          >
            <title>{[n.label, n.detail].filter(Boolean).join(', ')}</title>
            <NodeShape n={n} palette={palette} />
            <text x={n.x} y={n.y - ((lines.length - 1) * 7)} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={n.kind === 'step' ? 500 : 600} fill={textColor}>
              {lines.map((line, li) => (
                <tspan key={li} x={n.x} dy={li === 0 ? 0 : 14}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
