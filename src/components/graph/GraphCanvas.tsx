import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { NODE_META, type NodeType } from '@/config/graph';
import { paletteFor } from '@/config/palette';
import type { Layer } from '@/config/technical';
import type { EdgeKind, GraphEdgeData, GraphNodeData } from '@/lib/graphModel';
import { downloadBlob } from '@/lib/download';

interface GNode extends SimulationNodeDatum {
  id: string;
  data: GraphNodeData;
  r: number;
}

interface GLink extends SimulationLinkDatum<GNode> {
  kind: EdgeKind;
}

export interface GraphCanvasHandle {
  fit: () => void;
  zoomBy: (factor: number) => void;
  focusNode: (id: string) => void;
  exportPng: (filename: string) => void;
}

interface Props {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  selectedId: string | null;
  /** When set, everything outside this set is dimmed (search results, selection neighbourhood). */
  highlightIds: Set<string> | null;
  /** Changing this re-fits the view once the layout is ready. */
  fitKey: string;
  theme: 'light' | 'dark';
  ariaLabel: string;
  onSelect: (id: string | null) => void;
}

const LINK_DISTANCE: Record<EdgeKind, number> = { contains: 36, uses: 64, depends: 58, related: 90, implements: 64 };
const LINK_STRENGTH: Record<EdgeKind, number> = { contains: 0.7, uses: 0.25, depends: 0.35, related: 0.1, implements: 0.3 };
const BASE_RADIUS: Record<NodeType, number> = { application: 15, module: 11, screen: 9, functionality: 7, component: 7, requirement: 8 };
const MIN_K = 0.1;
const MAX_K = 6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const radiusOf = (d: GraphNodeData) => BASE_RADIUS[d.type] + Math.min(6, Math.sqrt(d.degree)) * 0.9;

/** Traces the outline of a node's shape. */
function shapePath(ctx: CanvasRenderingContext2D, type: NodeType, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  switch (type) {
    case 'application': {
      const h = r * 0.95;
      const c = Math.min(4, h * 0.3);
      ctx.moveTo(cx - h + c, cy - h);
      ctx.arcTo(cx + h, cy - h, cx + h, cy + h, c);
      ctx.arcTo(cx + h, cy + h, cx - h, cy + h, c);
      ctx.arcTo(cx - h, cy + h, cx - h, cy - h, c);
      ctx.arcTo(cx - h, cy - h, cx + h, cy - h, c);
      break;
    }
    case 'module': {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      break;
    }
    case 'screen': {
      const w = r * 1.45;
      const h = r * 1.05;
      const c = Math.min(3, h * 0.3);
      ctx.moveTo(cx - w + c, cy - h);
      ctx.arcTo(cx + w, cy - h, cx + w, cy + h, c);
      ctx.arcTo(cx + w, cy + h, cx - w, cy + h, c);
      ctx.arcTo(cx - w, cy + h, cx - w, cy - h, c);
      ctx.arcTo(cx - w, cy - h, cx + w, cy - h, c);
      break;
    }
    case 'component': {
      const d = r * 1.2;
      ctx.moveTo(cx, cy - d);
      ctx.lineTo(cx + d, cy);
      ctx.lineTo(cx, cy + d);
      ctx.lineTo(cx - d, cy);
      break;
    }
    case 'requirement': {
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy - r * 0.2);
      ctx.lineTo(cx + r * 0.62, cy + r);
      ctx.lineTo(cx - r * 0.62, cy + r);
      ctx.lineTo(cx - r, cy - r * 0.2);
      break;
    }
    default:
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }
  ctx.closePath();
}

/** Small white icon inside the node. Drawn only when the node is large enough on screen. */
function drawGlyph(ctx: CanvasRenderingContext2D, type: NodeType, layer: Layer | undefined, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, s * 0.22);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(cx + x1 * s, cy + y1 * s);
    ctx.lineTo(cx + x2 * s, cy + y2 * s);
    ctx.stroke();
  };
  switch (type) {
    case 'application': {
      const q = s * 0.5;
      for (const dx of [-1, 1]) for (const dy of [-1, 1]) ctx.fillRect(cx + dx * q - q * 0.42, cy + dy * q - q * 0.42, q * 0.84, q * 0.84);
      break;
    }
    case 'module':
      line(-0.8, -0.6, 0.8, -0.6);
      line(-0.8, 0, 0.8, 0);
      line(-0.8, 0.6, 0.8, 0.6);
      break;
    case 'screen':
      ctx.strokeRect(cx - s * 0.8, cy - s * 0.6, s * 1.6, s * 1.05);
      line(-0.4, 0.85, 0.4, 0.85);
      break;
    case 'functionality':
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.7, cy);
      ctx.lineTo(cx - s * 0.2, cy + s * 0.55);
      ctx.lineTo(cx + s * 0.75, cy - s * 0.55);
      ctx.stroke();
      break;
    case 'requirement':
      line(-0.5, -0.8, -0.5, 0.8);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.5, cy - s * 0.8);
      ctx.lineTo(cx + s * 0.8, cy - s * 0.3);
      ctx.lineTo(cx - s * 0.5, cy + s * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      if (layer === 'database') {
        ctx.beginPath();
        ctx.ellipse(cx, cy - s * 0.5, s * 0.75, s * 0.28, 0, 0, Math.PI * 2);
        ctx.stroke();
        line(-0.75, -0.5, -0.75, 0.5);
        line(0.75, -0.5, 0.75, 0.5);
        ctx.beginPath();
        ctx.ellipse(cx, cy + s * 0.5, s * 0.75, s * 0.28, 0, 0, Math.PI);
        ctx.stroke();
      } else if (layer === 'integration') {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.3, cy - s * 0.65);
        ctx.lineTo(cx - s * 0.85, cy);
        ctx.lineTo(cx - s * 0.3, cy + s * 0.65);
        ctx.moveTo(cx + s * 0.3, cy - s * 0.65);
        ctx.lineTo(cx + s * 0.85, cy);
        ctx.lineTo(cx + s * 0.3, cy + s * 0.65);
        ctx.stroke();
      } else {
        ctx.font = `700 ${Math.round(s * 1.7)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('{}', cx, cy);
      }
  }
  ctx.restore();
}

const GraphCanvas = forwardRef<GraphCanvasHandle, Props>(function GraphCanvas(props, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<GNode, undefined> | null>(null);
  const gnodes = useRef<GNode[]>([]);
  const glinks = useRef<GLink[]>([]);
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const tf = useRef({ x: 0, y: 0, k: 1 });
  const size = useRef({ w: 320, h: 320, dpr: 1 });
  const sized = useRef(false);
  const hover = useRef<string | null>(null);
  const raf = useRef(0);
  const drawRef = useRef<() => void>(() => undefined);
  const fitKeyRef = useRef<string | null>(null);
  const live = useRef(props);
  live.current = props;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ mode: 'none' | 'pan' | 'node' | 'pinch'; sx: number; sy: number; moved: boolean; node: GNode | null; dist: number }>({
    mode: 'none',
    sx: 0,
    sy: 0,
    moved: false,
    node: null,
    dist: 0,
  });

  const schedule = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => drawRef.current());
  };

  const fit = () => {
    const list = gnodes.current;
    if (list.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of list) {
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      minX = Math.min(minX, x - n.r);
      maxX = Math.max(maxX, x + n.r);
      minY = Math.min(minY, y - n.r);
      maxY = Math.max(maxY, y + n.r);
    }
    const pad = 56;
    const { w, h } = size.current;
    const k = clamp(Math.min((w - pad * 2) / Math.max(maxX - minX, 1), (h - pad * 2) / Math.max(maxY - minY, 1)), 0.15, 2.2);
    tf.current = { k, x: w / 2 - ((minX + maxX) / 2) * k, y: h / 2 - ((minY + maxY) / 2) * k };
    schedule();
  };

  const zoomAt = (cx: number, cy: number, factor: number) => {
    const { x, y, k } = tf.current;
    const nk = clamp(k * factor, MIN_K, MAX_K);
    const f = nk / k;
    tf.current = { k: nk, x: cx - (cx - x) * f, y: cy - (cy - y) * f };
    schedule();
  };

  useImperativeHandle(
    ref,
    () => ({
      fit,
      zoomBy: (factor: number) => zoomAt(size.current.w / 2, size.current.h / 2, factor),
      focusNode: (id: string) => {
        const n = gnodes.current.find((g) => g.id === id);
        if (!n) return;
        const k = Math.max(tf.current.k, 1.1);
        tf.current = { k, x: size.current.w / 2 - (n.x ?? 0) * k, y: size.current.h / 2 - (n.y ?? 0) * k };
        schedule();
      },
      exportPng: (filename: string) => {
        drawRef.current();
        const src = canvasRef.current;
        if (!src) return;
        const out = document.createElement('canvas');
        out.width = src.width;
        out.height = src.height;
        const c = out.getContext('2d');
        if (!c) return;
        c.fillStyle = paletteFor(live.current.theme).bg;
        c.fillRect(0, 0, out.width, out.height);
        c.drawImage(src, 0, 0);
        out.toBlob((blob) => {
          if (blob) downloadBlob(blob, filename);
        }, 'image/png');
      },
    }),
    // The handle only touches refs, so it can be created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ---------------------------------------------------------------- drawing
  const draw = () => {
    raf.current = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { w, h, dpr } = size.current;
    const { x: tx, y: ty, k } = tf.current;
    const { selectedId, highlightIds, theme } = live.current;
    const pal = paletteFor(theme);
    const links = glinks.current;
    const list = gnodes.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Hovering a node highlights its neighbourhood; otherwise use what the page asked for.
    const hoverId = hover.current;
    let active: Set<string> | null = highlightIds;
    if (hoverId) {
      active = new Set([hoverId]);
      for (const l of links) {
        const s = l.source as GNode;
        const t = l.target as GNode;
        if (s.id === hoverId) active.add(t.id);
        else if (t.id === hoverId) active.add(s.id);
      }
    }

    // Edges
    ctx.lineCap = 'round';
    for (const l of links) {
      const s = l.source as GNode;
      const t = l.target as GNode;
      if (typeof s !== 'object' || typeof t !== 'object') continue;
      const on = !active || (active.has(s.id) && active.has(t.id));
      ctx.globalAlpha = on ? (l.kind === 'contains' ? 0.45 : 0.8) : 0.06;
      ctx.strokeStyle = pal.edge;
      ctx.lineWidth = on && active ? 1.6 : 1;
      ctx.setLineDash(l.kind === 'depends' ? [5, 4] : []);
      ctx.beginPath();
      ctx.moveTo((s.x ?? 0) * k + tx, (s.y ?? 0) * k + ty);
      ctx.lineTo((t.x ?? 0) * k + tx, (t.y ?? 0) * k + ty);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Nodes
    ctx.font = '500 11px "Inter Variable", Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const n of list) {
      const sx = (n.x ?? 0) * k + tx;
      const sy = (n.y ?? 0) * k + ty;
      const rk = n.r * k;
      if (sx < -60 || sy < -60 || sx > w + 60 || sy > h + 60) continue;
      const isOn = !active || active.has(n.id);
      const isSel = n.id === selectedId;
      const color = NODE_META[n.data.type].color;

      ctx.globalAlpha = isOn ? 1 : 0.14;
      shapePath(ctx, n.data.type, sx, sy, Math.max(rk, 2.5));
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = isSel ? 2.5 : 1.5;
      ctx.strokeStyle = isSel ? pal.text : pal.bg;
      ctx.stroke();
      if (rk >= 8) drawGlyph(ctx, n.data.type, n.data.layer, sx, sy, rk * 0.5);

      const showLabel =
        isSel ||
        n.id === hoverId ||
        (isOn && (active !== null || k >= 0.9 || n.data.type === 'application' || (k >= 0.55 && n.data.type === 'module')));
      if (showLabel) {
        const text = n.data.label.length > 28 ? `${n.data.label.slice(0, 27)}…` : n.data.label;
        const ly = sy + Math.max(rk, 2.5) + 4;
        ctx.globalAlpha = isOn ? 1 : 0.3;
        ctx.lineWidth = 3;
        ctx.strokeStyle = pal.bg;
        ctx.strokeText(text, sx, ly);
        ctx.fillStyle = pal.text;
        ctx.fillText(text, sx, ly);
      }
    }
    ctx.globalAlpha = 1;
  };
  drawRef.current = draw;

  // ---------------------------------------------------------------- sizing
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const apply = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (!sized.current) {
        tf.current = { x: w / 2, y: h / 2, k: 1 };
        sized.current = true;
      } else {
        // Keep the same point at the centre when the container resizes.
        tf.current = { ...tf.current, x: tf.current.x + (w - size.current.w) / 2, y: tf.current.y + (h - size.current.h) / 2 };
      }
      size.current = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      schedule();
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- layout
  useEffect(() => {
    simRef.current?.stop();
    for (const n of gnodes.current) {
      if (n.x !== undefined && n.y !== undefined) positions.current.set(n.id, { x: n.x, y: n.y });
    }
    const prev = positions.current;
    const list: GNode[] = props.nodes.map((d, i) => {
      const p = prev.get(d.id);
      const angle = i * 2.399963; // golden-angle spiral for nodes without a remembered position
      const rad = 14 * Math.sqrt(i + 1);
      return { id: d.id, data: d, r: radiusOf(d), x: p ? p.x : Math.cos(angle) * rad, y: p ? p.y : Math.sin(angle) * rad };
    });
    const links: GLink[] = props.edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind }));

    const sim = forceSimulation<GNode>(list)
      .force(
        'link',
        forceLink<GNode, GLink>(links)
          .id((d) => d.id)
          .distance((l) => LINK_DISTANCE[l.kind])
          .strength((l) => LINK_STRENGTH[l.kind]),
      )
      .force('charge', forceManyBody<GNode>().strength((d) => -40 - d.r * 4))
      .force('collide', forceCollide<GNode>().radius((d) => d.r + 3))
      .force('x', forceX<GNode>(0).strength(0.04))
      .force('y', forceY<GNode>(0).strength(0.04))
      .velocityDecay(0.4)
      .stop();

    const fresh = list.filter((n) => !prev.has(n.id)).length;
    const preTicks = fresh > list.length * 0.5 ? 160 : 30;
    for (let i = 0; i < preTicks; i++) sim.tick();

    gnodes.current = list;
    glinks.current = links;
    simRef.current = sim;
    sim.on('tick', schedule);
    sim.alpha(fresh > 0 ? 0.2 : 0.05).restart();

    if (fitKeyRef.current !== props.fitKey && list.length > 0) {
      fitKeyRef.current = props.fitKey;
      fit();
    }
    schedule();
    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.nodes, props.edges, props.fitKey]);

  useEffect(() => {
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedId, props.highlightIds, props.theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      simRef.current?.stop();
    },
    [],
  );

  // ---------------------------------------------------------------- pointer interaction
  const localPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const hitTest = (x: number, y: number): GNode | null => {
    const { x: tx, y: ty, k } = tf.current;
    const list = gnodes.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      const dx = (n.x ?? 0) * k + tx - x;
      const dy = (n.y ?? 0) * k + ty - y;
      const reach = Math.max(n.r * k, 3) + 4;
      if (dx * dx + dy * dy <= reach * reach) return n;
    }
    return null;
  };

  const toWorld = (x: number, y: number) => ({ x: (x - tf.current.x) / tf.current.k, y: (y - tf.current.y) / tf.current.k });

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      g.mode = 'pinch';
      g.dist = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }
    g.sx = p.x;
    g.sy = p.y;
    g.moved = false;
    const hit = hitTest(p.x, p.y);
    if (hit) {
      g.mode = 'node';
      g.node = hit;
      hit.fx = hit.x;
      hit.fy = hit.y;
      simRef.current?.alphaTarget(0.25).restart();
    } else {
      g.mode = 'pan';
      g.node = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(e);
    const g = gesture.current;
    const last = pointers.current.get(e.pointerId);
    if (last) pointers.current.set(e.pointerId, p);

    if (g.mode === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.dist > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / g.dist);
      g.dist = dist;
      return;
    }
    if (g.mode === 'node' && g.node) {
      if (Math.hypot(p.x - g.sx, p.y - g.sy) > 4) g.moved = true;
      const w = toWorld(p.x, p.y);
      g.node.fx = w.x;
      g.node.fy = w.y;
      schedule();
      return;
    }
    if (g.mode === 'pan' && last) {
      if (Math.hypot(p.x - g.sx, p.y - g.sy) > 4) g.moved = true;
      tf.current = { ...tf.current, x: tf.current.x + (p.x - last.x), y: tf.current.y + (p.y - last.y) };
      schedule();
      return;
    }
    const hit = hitTest(p.x, p.y);
    const id = hit ? hit.id : null;
    if (id !== hover.current) {
      hover.current = id;
      e.currentTarget.style.cursor = id ? 'pointer' : 'grab';
      schedule();
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (g.mode === 'node' && g.node) {
      if (!g.moved) live.current.onSelect(g.node.id);
      g.node.fx = null;
      g.node.fy = null;
      simRef.current?.alphaTarget(0);
    } else if (g.mode === 'pan' && !g.moved) {
      live.current.onSelect(null);
    }
    if (pointers.current.size === 0) {
      g.mode = 'none';
      g.node = null;
    } else if (g.mode === 'pinch') {
      g.mode = 'none';
    }
  };

  const onPointerLeave = () => {
    if (hover.current !== null && gesture.current.mode === 'none') {
      hover.current = null;
      schedule();
    }
  };

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={props.ariaLabel}
        className="block touch-none"
        style={{ cursor: 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
      />
    </div>
  );
});

export default GraphCanvas;
