import { layoutFlow, type FlowLayout, type PNode } from './flowLayout';
import type { FlowKind, FlowModel } from './flowModel';
import { createZip } from './zip';
import { XML_DECL, xmlAttr, xmlText } from './xml';

/**
 * Exporters that turn a FlowModel into editable diagram formats:
 *  - BPMN 2.0 XML (opens in Camunda Modeler, bpmn.io, Signavio, Bizagi)
 *  - draw.io / diagrams.net (.drawio)
 *  - Visio (.vsdx)
 * Positions come from the same layout the on-screen diagram uses, so exports match what the user sees.
 */

export interface PreparedFlow {
  model: FlowModel;
  layout: FlowLayout;
  multiLane: boolean;
}

export function prepareFlow(model: FlowModel): PreparedFlow {
  const multiLane = model.lanes.filter((l) => model.nodes.some((n) => n.lane === l)).length > 1;
  return { model, layout: layoutFlow(model, multiLane ? 'swimlane' : 'flowchart'), multiLane };
}

interface Pt { x: number; y: number }

/** Point where the segment from the box centre toward `to` leaves a w x h box. */
function clip(c: Pt, w: number, h: number, to: Pt): Pt {
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (!dx && !dy) return c;
  const sx = dx ? w / 2 / Math.abs(dx) : Infinity;
  const sy = dy ? h / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

const centre = (n: PNode): Pt => ({ x: n.x, y: n.y });
const r1 = (v: number) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- BPMN

const bpmnId = (prefix: string, id: string) => `${prefix}_${id.replace(/[^A-Za-z0-9_-]/g, '_')}`;

interface BpmnShape { tag: string; w: number; h: number }
function bpmnShape(kind: FlowKind, hasIn: boolean, hasOut: boolean, n: PNode): BpmnShape {
  if (kind === 'start' && !hasIn) return { tag: 'startEvent', w: 36, h: 36 };
  if (kind === 'end' && !hasOut) return { tag: 'endEvent', w: 36, h: 36 };
  if (kind === 'decision') return { tag: 'exclusiveGateway', w: 50, h: 50 };
  if (kind === 'data') return { tag: 'serviceTask', w: n.w * 0.7, h: 70 };
  return { tag: 'task', w: n.w * 0.7, h: 70 };
}

export function flowToBpmn(model: FlowModel): string {
  const { layout, multiLane } = prepareFlow(model);
  const hasIn = new Set(model.edges.map((e) => e.to));
  const hasOut = new Set(model.edges.map((e) => e.from));
  const placed = new Map(layout.nodes.map((n) => [n.id, n]));
  const shapes = new Map<string, BpmnShape>();
  for (const n of layout.nodes) shapes.set(n.id, bpmnShape(n.kind, hasIn.has(n.id), hasOut.has(n.id), n));

  const flowId = (i: number) => `Flow_${i + 1}`;
  const nodeXml = layout.nodes.map((n) => {
    const sh = shapes.get(n.id)!;
    const id = bpmnId('Node', n.id);
    const incoming = model.edges.map((e, i) => (e.to === n.id ? `<bpmn:incoming>${flowId(i)}</bpmn:incoming>` : '')).join('');
    const outgoing = model.edges.map((e, i) => (e.from === n.id ? `<bpmn:outgoing>${flowId(i)}</bpmn:outgoing>` : '')).join('');
    const doc = n.detail ? `<bpmn:documentation>${xmlText(n.detail)}</bpmn:documentation>` : '';
    return `    <bpmn:${sh.tag} id="${id}" name="${xmlAttr(n.label)}">${doc}${incoming}${outgoing}</bpmn:${sh.tag}>`;
  });
  const flows = model.edges
    .map((e, i) => (placed.has(e.from) && placed.has(e.to)
      ? `    <bpmn:sequenceFlow id="${flowId(i)}"${e.label ? ` name="${xmlAttr(e.label)}"` : ''} sourceRef="${bpmnId('Node', e.from)}" targetRef="${bpmnId('Node', e.to)}"/>`
      : ''))
    .filter(Boolean);

  const laneNames = layout.lanes.map((l) => l.name);
  const laneSet = multiLane
    ? `    <bpmn:laneSet id="LaneSet_1">\n${laneNames.map((name, i) => `      <bpmn:lane id="Lane_${i + 1}" name="${xmlAttr(name)}">${layout.nodes.filter((n) => n.lane === name).map((n) => `<bpmn:flowNodeRef>${bpmnId('Node', n.id)}</bpmn:flowNodeRef>`).join('')}</bpmn:lane>`).join('\n')}\n    </bpmn:laneSet>\n`
    : '';

  const poolX = 0;
  const poolW = layout.width + 30;
  const di: string[] = [];
  if (multiLane) {
    di.push(`      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true"><dc:Bounds x="${poolX}" y="0" width="${r1(poolW)}" height="${r1(layout.height)}"/></bpmndi:BPMNShape>`);
    layout.lanes.forEach((l, i) => di.push(`      <bpmndi:BPMNShape id="Lane_${i + 1}_di" bpmnElement="Lane_${i + 1}" isHorizontal="true"><dc:Bounds x="${poolX + 30}" y="${r1(l.y)}" width="${r1(poolW - 30)}" height="${r1(l.h)}"/></bpmndi:BPMNShape>`));
  }
  const dx = multiLane ? 30 : 0;
  for (const n of layout.nodes) {
    const sh = shapes.get(n.id)!;
    di.push(`      <bpmndi:BPMNShape id="${bpmnId('Node', n.id)}_di" bpmnElement="${bpmnId('Node', n.id)}"${sh.tag === 'exclusiveGateway' ? ' isMarkerVisible="true"' : ''}><dc:Bounds x="${r1(n.x + dx - sh.w / 2)}" y="${r1(n.y - sh.h / 2)}" width="${r1(sh.w)}" height="${r1(sh.h)}"/>${sh.tag.endsWith('Event') || sh.tag === 'exclusiveGateway' ? '<bpmndi:BPMNLabel><dc:Bounds x="' + r1(n.x + dx - 40) + '" y="' + r1(n.y + sh.h / 2 + 4) + '" width="80" height="27"/></bpmndi:BPMNLabel>' : ''}</bpmndi:BPMNShape>`);
  }
  model.edges.forEach((e, i) => {
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (!a || !b) return;
    const sa = shapes.get(a.id)!;
    const sb = shapes.get(b.id)!;
    const p1 = clip(centre(a), sa.w, sa.h, centre(b));
    const p2 = clip(centre(b), sb.w, sb.h, centre(a));
    const label = e.label ? `<bpmndi:BPMNLabel><dc:Bounds x="${r1((p1.x + p2.x) / 2 + dx)}" y="${r1((p1.y + p2.y) / 2 - 14)}" width="40" height="14"/></bpmndi:BPMNLabel>` : '';
    di.push(`      <bpmndi:BPMNEdge id="${flowId(i)}_di" bpmnElement="${flowId(i)}"><di:waypoint x="${r1(p1.x + dx)}" y="${r1(p1.y)}"/><di:waypoint x="${r1(p2.x + dx)}" y="${r1(p2.y)}"/>${label}</bpmndi:BPMNEdge>`);
  });

  const root = multiLane ? 'Collaboration_1' : 'Process_1';
  return `${XML_DECL}
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://application-dna/bpmn">
${multiLane ? `  <bpmn:collaboration id="Collaboration_1"><bpmn:participant id="Participant_1" name="${xmlAttr(model.title)}" processRef="Process_1"/></bpmn:collaboration>\n` : ''}  <bpmn:process id="Process_1" name="${xmlAttr(model.title)}" isExecutable="false">
${laneSet}${nodeXml.join('\n')}
${flows.join('\n')}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="${root}">
${di.join('\n')}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}

// ---------------------------------------------------------------- draw.io

const DRAWIO_STYLE: Record<FlowKind, string> = {
  start: 'ellipse;whiteSpace=wrap;html=1;fillColor=#DCEFEA;strokeColor=#0F4C5C;fontColor=#1F2A30;',
  end: 'ellipse;whiteSpace=wrap;html=1;fillColor=#F3D9D4;strokeColor=#9B3D2E;fontColor=#1F2A30;',
  step: 'rounded=1;whiteSpace=wrap;html=1;arcSize=12;fillColor=#FFFFFF;strokeColor=#0F4C5C;fontColor=#1F2A30;',
  decision: 'rhombus;whiteSpace=wrap;html=1;fillColor=#FFF4D6;strokeColor=#9A6B00;fontColor=#1F2A30;',
  data: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=10;fillColor=#E7EEF0;strokeColor=#0F4C5C;fontColor=#1F2A30;',
};

export function flowToDrawio(model: FlowModel): string {
  const { layout, multiLane } = prepareFlow(model);
  const cell = (id: string) => `c_${id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const out: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  if (multiLane) {
    layout.lanes.forEach((l, i) => {
      out.push(`<mxCell id="lane_${i}" value="${xmlAttr(l.name)}" style="swimlane;horizontal=0;whiteSpace=wrap;html=1;startSize=30;fillColor=#F6F8F9;strokeColor=#9AA5AB;fontColor=#1F2A30;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="0" y="${r1(l.y)}" width="${r1(layout.width)}" height="${r1(l.h)}" as="geometry"/></mxCell>`);
    });
  }
  for (const n of layout.nodes) {
    const w = n.kind === 'start' || n.kind === 'end' ? 120 : n.w;
    const h = n.kind === 'decision' ? n.h : n.kind === 'start' || n.kind === 'end' ? 50 : n.h;
    out.push(`<mxCell id="${cell(n.id)}" value="${xmlAttr(n.label)}" style="${DRAWIO_STYLE[n.kind]}" vertex="1" parent="1"${n.detail ? ` tooltip="${xmlAttr(n.detail)}"` : ''}><mxGeometry x="${r1(n.x - w / 2)}" y="${r1(n.y - h / 2)}" width="${r1(w)}" height="${r1(h)}" as="geometry"/></mxCell>`);
  }
  const known = new Set(layout.nodes.map((n) => n.id));
  model.edges.forEach((e, i) => {
    if (!known.has(e.from) || !known.has(e.to)) return;
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;html=1;endArrow=block;endFill=1;strokeColor=#44525A;fontColor=#1F2A30;${e.dashed ? 'dashed=1;' : ''}`;
    out.push(`<mxCell id="e_${i}" value="${xmlAttr(e.label ?? '')}" style="${style}" edge="1" parent="1" source="${cell(e.from)}" target="${cell(e.to)}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  });
  const w = Math.ceil(layout.width + 40);
  const h = Math.ceil(layout.height + 40);
  return `<mxfile host="app.diagrams.net" agent="Application DNA"><diagram id="flow1" name="${xmlAttr(model.title.slice(0, 60) || 'Process flow')}"><mxGraphModel dx="${w}" dy="${h}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${w}" pageHeight="${h}" math="0" shadow="0"><root>${out.join('')}</root></mxGraphModel></diagram></mxfile>`;
}

// ---------------------------------------------------------------- Visio (.vsdx)

const VS = 'http://schemas.microsoft.com/office/visio/2012/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PX = 96; // pixels per inch
const inch = (v: number) => Math.round((v / PX) * 10000) / 10000;

const cellX = (n: string, v: string | number, f?: string) => `<Cell N="${n}" V="${v}"${f ? ` F="${f}"` : ''}/>`;

function vsGeometry(kind: FlowKind, w: number, h: number): string {
  const row = (t: string, ix: number, x: number, y: number) => `<Row T="${t}" IX="${ix}">${cellX('X', inch(x))}${cellX('Y', inch(y))}</Row>`;
  let rows: string;
  if (kind === 'start' || kind === 'end') {
    rows = `<Row T="Ellipse" IX="1">${cellX('X', inch(w / 2))}${cellX('Y', inch(h / 2))}${cellX('A', inch(w))}${cellX('B', inch(h / 2))}${cellX('C', inch(w / 2))}${cellX('D', inch(h))}</Row>`;
  } else if (kind === 'decision') {
    rows = [row('MoveTo', 1, w / 2, 0), row('LineTo', 2, w, h / 2), row('LineTo', 3, w / 2, h), row('LineTo', 4, 0, h / 2), row('LineTo', 5, w / 2, 0)].join('');
  } else {
    rows = [row('MoveTo', 1, 0, 0), row('LineTo', 2, w, 0), row('LineTo', 3, w, h), row('LineTo', 4, 0, h), row('LineTo', 5, 0, 0)].join('');
  }
  return `<Section N="Geometry" IX="0">${cellX('NoFill', 0)}${cellX('NoLine', 0)}${rows}</Section>`;
}

const VS_FILL: Record<FlowKind, string> = { start: '#DCEFEA', end: '#F3D9D4', step: '#FFFFFF', decision: '#FFF4D6', data: '#E7EEF0' };

export function flowToVsdx(model: FlowModel): Uint8Array {
  const { layout, multiLane } = prepareFlow(model);
  const pageW = inch(layout.width + 60);
  const pageH = inch(layout.height + 60);
  // Visio's origin is bottom-left; flip y and add a margin.
  const fx = (x: number) => inch(x + 30);
  const fy = (y: number) => inch(layout.height + 30 - y);
  let id = 0;
  const shapes: string[] = [];
  const ids = new Map<string, number>();

  const baseShape = (name: string, cx: number, cy: number, w: number, h: number, kind: FlowKind, fill: string, text: string, extra = '') =>
    `<Shape ID="${++id}" Type="Shape" NameU="${xmlAttr(name)}" Name="${xmlAttr(name)}">${cellX('PinX', fx(cx))}${cellX('PinY', fy(cy))}${cellX('Width', inch(w))}${cellX('Height', inch(h))}${cellX('LocPinX', inch(w / 2), 'Width*0.5')}${cellX('LocPinY', inch(h / 2), 'Height*0.5')}${cellX('Angle', 0)}${cellX('FillForegnd', fill)}${cellX('FillPattern', 1)}${cellX('LineColor', '#0F4C5C')}${cellX('LineWeight', 0.01)}${extra}${vsGeometry(kind, w, h)}<Text>${xmlText(text)}</Text></Shape>`;

  if (multiLane) {
    layout.lanes.forEach((l) => {
      shapes.push(baseShape(`Lane ${l.name}`, layout.width / 2, l.y + l.h / 2, layout.width, l.h, 'step', '#F6F8F9', '', `${cellX('LineColor', '#9AA5AB')}${cellX('VerticalAlign', 0)}${cellX('LeftMargin', 0.1)}`).replace('<Text></Text>', `<Text>${xmlText(l.name)}</Text>`));
    });
  }
  for (const n of layout.nodes) {
    const w = n.kind === 'start' || n.kind === 'end' ? 120 : n.w;
    const h = n.kind === 'start' || n.kind === 'end' ? 50 : n.h;
    shapes.push(baseShape(n.label.slice(0, 40), n.x, n.y, w, h, n.kind, VS_FILL[n.kind], n.label));
    ids.set(n.id, id);
  }
  const sizeOf = new Map(layout.nodes.map((n) => [n.id, n.kind === 'start' || n.kind === 'end' ? { w: 120, h: 50 } : { w: n.w, h: n.h }]));
  const placed = new Map(layout.nodes.map((n) => [n.id, n]));
  const connects: string[] = [];
  for (const e of model.edges) {
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (!a || !b) continue;
    const sa = sizeOf.get(a.id)!;
    const sb = sizeOf.get(b.id)!;
    const p1 = clip(centre(a), sa.w, sa.h, centre(b));
    const p2 = clip(centre(b), sb.w, sb.h, centre(a));
    const bx = fx(p1.x), by = fy(p1.y), ex = fx(p2.x), ey = fy(p2.y);
    const len = Math.hypot(ex - bx, ey - by);
    const angle = Math.atan2(ey - by, ex - bx);
    const cid = ++id;
    shapes.push(`<Shape ID="${cid}" Type="Shape" NameU="Connector" Name="Connector">${cellX('PinX', (bx + ex) / 2)}${cellX('PinY', (by + ey) / 2)}${cellX('Width', len)}${cellX('Height', 0)}${cellX('LocPinX', len / 2)}${cellX('LocPinY', 0)}${cellX('Angle', angle)}${cellX('BeginX', bx)}${cellX('BeginY', by)}${cellX('EndX', ex)}${cellX('EndY', ey)}${cellX('ObjType', 2)}${cellX('EndArrow', 4)}${cellX('LineColor', '#44525A')}${cellX('LineWeight', 0.01)}${e.dashed ? cellX('LinePattern', 2) : ''}<Section N="Geometry" IX="0">${cellX('NoFill', 1)}<Row T="MoveTo" IX="1">${cellX('X', 0)}${cellX('Y', 0)}</Row><Row T="LineTo" IX="2">${cellX('X', len)}${cellX('Y', 0)}</Row></Section><Text>${xmlText(e.label ?? '')}</Text></Shape>`);
    connects.push(`<Connect FromSheet="${cid}" FromCell="BeginX" ToSheet="${ids.get(e.from)}" ToCell="PinX"/>`, `<Connect FromSheet="${cid}" FromCell="EndX" ToSheet="${ids.get(e.to)}" ToCell="PinX"/>`);
  }

  const page = `${XML_DECL}<PageContents xmlns="${VS}" xmlns:r="${R}" xml:space="preserve"><Shapes>${shapes.join('')}</Shapes><Connects>${connects.join('')}</Connects></PageContents>`;
  const pages = `${XML_DECL}<Pages xmlns="${VS}" xmlns:r="${R}" xml:space="preserve"><Page ID="0" NameU="Page-1" Name="${xmlAttr(model.title.slice(0, 40) || 'Page-1')}"><PageSheet>${cellX('PageWidth', pageW)}${cellX('PageHeight', pageH)}</PageSheet><Rel r:id="rId1"/></Page></Pages>`;
  const doc = `${XML_DECL}<VisioDocument xmlns="${VS}" xmlns:r="${R}" xml:space="preserve"><DocumentSettings TopPage="0" DefaultTextStyle="0" DefaultLineStyle="0" DefaultFillStyle="0"/><Colors/><FaceNames/><StyleSheets><StyleSheet ID="0" Name="No Style" NameU="No Style"><Cell N="LineWeight" V="0.01"/><Cell N="LineColor" V="0"/><Cell N="LinePattern" V="1"/><Cell N="FillForegnd" V="1"/><Cell N="FillPattern" V="1"/></StyleSheet></StyleSheets></VisioDocument>`;
  const rel = (rid: string, type: string, target: string) => `<Relationship Id="${rid}" Type="${type}" Target="${target}"/>`;
  const relsDoc = (...r: string[]) => `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${r.join('')}</Relationships>`;
  return createZip([
    { name: '[Content_Types].xml', data: `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/><Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/><Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/></Types>` },
    { name: '_rels/.rels', data: relsDoc(rel('rId1', `${R}/document`, 'visio/document.xml')) },
    { name: 'visio/document.xml', data: doc },
    { name: 'visio/_rels/document.xml.rels', data: relsDoc(rel('rId1', 'http://schemas.microsoft.com/visio/2010/relationships/pages', 'pages/pages.xml')) },
    { name: 'visio/pages/pages.xml', data: pages },
    { name: 'visio/pages/_rels/pages.xml.rels', data: relsDoc(rel('rId1', 'http://schemas.microsoft.com/visio/2010/relationships/page', 'page1.xml')) },
    { name: 'visio/pages/page1.xml', data: page },
  ]);
}
