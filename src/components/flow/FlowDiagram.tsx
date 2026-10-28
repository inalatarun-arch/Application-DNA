import type { Palette } from '@/config/palette';
import { wrapText, type FlowLayout, type PEdge, type PNode } from '@/lib/flowLayout';
import { DIAGRAM_LABEL, type EdgeType, type FlowView } from '@/lib/flowModel';

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

type Ink = 'edge' | 'text' | 'accent' | 'muted' | 'warn';
interface EdgeStyle { ink: Ink; width: number; dash?: string; head: 'filled' | 'open' | 'none'; cap?: 'round' }

/** One look per meaning, so an association can never be mistaken for a step. */
const EDGE_STYLE: Record<EdgeType, EdgeStyle> = {
  sequence: { ink: 'edge', width: 1.8, head: 'filled' },
  branch: { ink: 'text', width: 1.8, head: 'filled' },
  handoff: { ink: 'accent', width: 3.2, head: 'filled' },
  dataflow: { ink: 'accent', width: 1.7, dash: '9 3 2 3', head: 'filled' },
  depends: { ink: 'muted', width: 1.5, dash: '6 4', head: 'open' },
  related: { ink: 'muted', width: 1.4, dash: '1 4', head: 'none', cap: 'round' },
  contains: { ink: 'edge', width: 1, head: 'none' },
};

function styleOf(e: PEdge): EdgeStyle & { dash?: string } {
  const base: EdgeStyle = e.type ? EDGE_STYLE[e.type] : { ink: 'edge', width: 1.5, dash: e.dashed || e.back ? '5 4' : undefined, head: 'filled' };
  return e.uncertain ? { ...base, ink: 'warn', dash: '3 3' } : base;
}

function NodeShape({ n, palette }: { n: PNode; palette: Palette }) {
  const left = n.x - n.w / 2;
  const top = n.y - n.h / 2;
  const flagged = !!n.flags?.length;
  if (n.kind === 'decision') {
    return <polygon points={`${n.x},${top} ${n.x + n.w / 2},${n.y} ${n.x},${top + n.h} ${n.x - n.w / 2},${n.y}`} fill={palette.panelAlt} stroke={flagged ? palette.warn : palette.text} strokeWidth={1.5} />;
  }
  switch (n.role) {
    case 'screen':
      return (
        <g>
          <rect x={left} y={top} width={n.w} height={n.h} rx={6} fill={palette.panel} stroke={palette.edge} strokeWidth={1.5} />
          <rect x={left} y={top} width={6} height={n.h} rx={3} fill={palette.accent} />
        </g>
      );
    case 'application':
      return (
        <g>
          <rect x={left} y={top} width={n.w} height={n.h} rx={8} fill={palette.panelAlt} stroke={palette.accent} strokeWidth={3} />
          <rect x={left + 5} y={top + 5} width={n.w - 10} height={n.h - 10} rx={5} fill="none" stroke={palette.accent} strokeWidth={0.8} />
        </g>
      );
    case 'external':
      return <rect x={left} y={top} width={n.w} height={n.h} rx={n.h / 2} fill={palette.bg} stroke={palette.edge} strokeWidth={1.5} strokeDasharray="6 4" />;
    case 'boundary':
      return <rect x={left} y={top} width={n.w} height={n.h} rx={4} fill={palette.panel} stroke={palette.muted} strokeWidth={1.5} strokeDasharray="7 4" />;
    case 'unordered':
      return <rect x={left} y={top} width={n.w} height={n.h} rx={6} fill={palette.warnBg} stroke={palette.warn} strokeWidth={1.5} strokeDasharray="5 3" />;
    case 'function':
      if (n.kind === 'end') return <rect x={left} y={top} width={n.w} height={n.h} rx={n.h / 2} fill={palette.panelAlt} stroke={flagged ? palette.warn : palette.text} strokeWidth={1.5} />;
      return <rect x={left} y={top} width={n.w} height={n.h} rx={6} fill={palette.bg} stroke={flagged ? palette.warn : palette.edge} strokeWidth={flagged ? 2 : 1.5} />;
    default:
      break;
  }
  switch (n.kind) {
    case 'start':
    case 'end':
      return <rect x={left} y={top} width={n.w} height={n.h} rx={n.h / 2} fill={palette.accent} stroke={palette.accent} strokeWidth={1.5} />;
    case 'data':
      return <polygon points={`${left + 14},${top} ${left + n.w},${top} ${left + n.w - 14},${top + n.h} ${left},${top + n.h}`} fill={palette.panel} stroke={palette.edge} strokeWidth={1.5} />;
    default:
      return <rect x={left} y={top} width={n.w} height={n.h} rx={6} fill={palette.bg} stroke={palette.edge} strokeWidth={1.5} />;
  }
}

/** Pure SVG renderer, so the same markup can be shown on screen and exported as SVG/PNG. */
export default function FlowDiagram({ layout, view, palette, title, idPrefix, scale = 1, onNodeClick }: Props) {
  const { width, height } = layout;
  const ink = (k: Ink) => (k === 'edge' ? palette.edge : k === 'text' ? palette.text : k === 'accent' ? palette.accent : k === 'warn' ? palette.warn : palette.muted);
  const marker = (k: Ink, open = false) => `${idPrefix}-${open ? 'open' : 'a'}-${k}`;
  const inks: Ink[] = ['edge', 'text', 'accent', 'muted', 'warn'];

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={Math.round(width * scale)} height={Math.round(height * scale)} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} fontFamily={FONT}>
      <title>{title}</title>
      <defs>
        {inks.map((k) => (
          <g key={k}>
            <marker id={marker(k)} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={ink(k)} />
            </marker>
            <marker id={marker(k, true)} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke={ink(k)} strokeWidth={1.6} />
            </marker>
          </g>
        ))}
      </defs>
      <rect x={0} y={0} width={width} height={height} fill={palette.bg} />

      {layout.header && (
        <g>
          <text x={28} y={28} fontSize={17} fontWeight={700} fill={palette.text}>{layout.header.title}</text>
          <text x={28} y={47} fontSize={12} fill={palette.muted}>{layout.header.subtitle}</text>
          <g transform={`translate(${width - 28}, 14)`}>
            <rect x={-(DIAGRAM_LABEL[layout.header.diagram].length * 6.4 + 22)} y={0} width={DIAGRAM_LABEL[layout.header.diagram].length * 6.4 + 22} height={26} rx={13} fill={palette.accent} />
            <text x={-(DIAGRAM_LABEL[layout.header.diagram].length * 6.4 + 22) / 2} y={13} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600} fill={palette.onAccent}>{DIAGRAM_LABEL[layout.header.diagram]}</text>
          </g>
        </g>
      )}

      {view === 'swimlane' &&
        layout.lanes.map((lane, i) => {
          const lines = wrapText(lane.name, 19, 5);
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

      {layout.edges.map((e, i) => {
        const st = styleOf(e);
        const head = st.head === 'filled' ? `url(#${marker(st.ink)})` : st.head === 'open' ? `url(#${marker(st.ink, true)})` : undefined;
        const lines = e.label ? wrapText(`${e.uncertain ? '? ' : ''}${e.label}`, 20, 3) : [];
        const w = lines.length ? Math.max(...lines.map((l) => l.length)) * 6.3 + 10 : 0;
        const h = lines.length * 13 + 4;
        return (
          <g key={i}>
            {e.evidence && <title>{e.evidence}</title>}
            <path d={e.d} fill="none" stroke={ink(st.ink)} strokeWidth={st.width} strokeDasharray={st.dash} strokeLinecap={st.cap} strokeLinejoin="round" markerEnd={head} />
            {lines.length > 0 && (
              <g>
                {e.type && <rect x={e.lx - w / 2} y={e.ly - h / 2} width={w} height={h} rx={3} fill={palette.bg} fillOpacity={0.92} stroke={e.type === 'handoff' || e.uncertain ? ink(st.ink) : 'none'} strokeWidth={0.8} />}
                <text x={e.lx} y={e.ly - ((lines.length - 1) * 6.5)} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={e.type === 'branch' || e.type === 'handoff' ? 600 : 400} fill={e.uncertain ? palette.warn : e.type === 'handoff' ? palette.accent : palette.muted} stroke={e.type ? undefined : palette.bg} strokeWidth={e.type ? undefined : 3} paintOrder="stroke">
                  {lines.map((line, li) => (
                    <tspan key={li} x={e.lx} dy={li === 0 ? 0 : 13}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {layout.nodes.map((n) => {
        const typed = !!n.role;
        const lines = wrapText(n.label, n.kind === 'decision' ? 15 : 24, n.role === 'application' ? 4 : n.sub ? 2 : 3);
        const subLines = n.sub ? wrapText(n.sub, 30, 1) : [];
        const dark = (n.kind === 'start' || n.kind === 'end') && !typed;
        const textColor = dark ? palette.onAccent : palette.text;
        const clickable = !!n.to && !!onNodeClick;
        const blockH = lines.length * 14 + (subLines.length ? 14 : 0);
        const y0 = n.y - blockH / 2 + 7;
        const indent = n.role === 'screen' ? 3 : 0;
        const tip = [n.label, n.detail, ...(n.flags ?? [])].filter(Boolean).join(' — ');
        return (
          <g
            key={n.id}
            style={clickable ? { cursor: 'pointer' } : undefined}
            onClick={clickable ? () => onNodeClick?.(n) : undefined}
            onKeyDown={clickable ? (e) => (e.key === 'Enter' || e.key === ' ') && onNodeClick?.(n) : undefined}
            role={clickable ? 'link' : undefined}
            tabIndex={clickable ? 0 : undefined}
          >
            <title>{tip}</title>
            <NodeShape n={n} palette={palette} />
            <text x={n.x + indent} y={y0} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={n.role === 'screen' || n.role === 'application' || n.kind !== 'step' ? 600 : 500} fill={textColor}>
              {lines.map((line, li) => (
                <tspan key={li} x={n.x + indent} dy={li === 0 ? 0 : 14}>
                  {line}
                </tspan>
              ))}
              {subLines.map((line) => (
                <tspan key="sub" x={n.x + indent} dy={14} fontSize={10.5} fontWeight={400} fill={palette.muted}>
                  {line}
                </tspan>
              ))}
            </text>
            {n.flags?.length ? (
              <g>
                <circle cx={n.x + n.w / 2 - 2} cy={n.y - n.h / 2 + 2} r={9} fill={palette.warn} />
                <text x={n.x + n.w / 2 - 2} y={n.y - n.h / 2 + 2} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill={palette.bg}>?</text>
              </g>
            ) : null}
          </g>
        );
      })}

      {layout.legend && (
        <g transform={`translate(28, ${layout.legend.y})`}>
          <text x={0} y={10} fontSize={12} fontWeight={700} fill={palette.text}>Legend</text>
          {layout.legend.items.map((it, i) => {
            const col = i % layout.legend!.columns;
            const row = Math.floor(i / layout.legend!.columns);
            const x = col * Math.floor((width - 56) / layout.legend!.columns);
            const y = 30 + row * 24;
            return (
              <g key={it.key} transform={`translate(${x}, ${y})`}>
                {it.kind === 'edge' ? <LegendLine keyName={it.key} palette={palette} marker={marker} /> : <LegendNode keyName={it.key} palette={palette} />}
                <text x={70} y={0} dominantBaseline="central" fontSize={11} fill={palette.text}>
                  <tspan fontWeight={600}>{it.label}</tspan>
                  <tspan fill={palette.muted}>{` — ${it.meaning}`}</tspan>
                </text>
              </g>
            );
          })}
        </g>
      )}

      {layout.notes && (
        <g transform={`translate(28, ${layout.notes.y})`}>
          <rect x={-8} y={-4} width={width - 40} height={layout.notes.h} rx={6} fill={palette.warnBg} stroke={palette.warn} strokeWidth={1} />
          <text x={4} y={12} fontSize={12} fontWeight={700} fill={palette.warn}>Gaps and uncertainties in the documentation</text>
          {layout.notes.lines.map((line, i) => (
            <text key={i} x={4} y={32 + i * 15} fontSize={11} fill={palette.text}>{line}</text>
          ))}
          {layout.notes.more > 0 && <text x={4} y={32 + layout.notes.lines.length * 15} fontSize={11} fill={palette.muted}>{`+ ${layout.notes.more} more, listed on the page`}</text>}
        </g>
      )}
    </svg>
  );
}

function LegendLine({ keyName, palette, marker }: { keyName: string; palette: Palette; marker: (k: Ink, open?: boolean) => string }) {
  const e = { type: keyName === 'uncertain' ? 'sequence' : (keyName as EdgeType), uncertain: keyName === 'uncertain' } as PEdge;
  const st = styleOf(e);
  const col = st.ink === 'edge' ? palette.edge : st.ink === 'text' ? palette.text : st.ink === 'accent' ? palette.accent : st.ink === 'warn' ? palette.warn : palette.muted;
  const head = st.head === 'filled' ? `url(#${marker(st.ink)})` : st.head === 'open' ? `url(#${marker(st.ink, true)})` : undefined;
  return <path d="M 0 0 H 56" stroke={col} strokeWidth={st.width} strokeDasharray={st.dash} strokeLinecap={st.cap} markerEnd={head} fill="none" />;
}

function LegendNode({ keyName, palette }: { keyName: string; palette: Palette }) {
  const n = { x: 28, y: 0, w: 52, h: 18, rank: 0, id: 'l', label: '', lane: '', kind: 'step' } as PNode;
  switch (keyName) {
    case 'decision':
      return <NodeShape n={{ ...n, kind: 'decision', w: 40, h: 22 }} palette={palette} />;
    case 'flagged':
      return (
        <g>
          <circle cx={28} cy={0} r={8} fill={palette.warn} />
          <text x={28} y={0} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill={palette.bg}>?</text>
        </g>
      );
    default:
      return <NodeShape n={{ ...n, role: keyName as PNode['role'] }} palette={palette} />;
  }
}
