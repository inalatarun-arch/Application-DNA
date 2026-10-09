import { createZip } from './zip';
import { XML_DECL, xmlAttr, xmlText } from './xml';

/**
 * Markdown to DOCX, with no dependencies. Supports what the generated design documents use:
 * headings, paragraphs, bold/italic/code, bullet and numbered lists, pipe tables, quotes, fenced code
 * and diagrams (as embedded PNG when the caller supplies one for a Mermaid block).
 */
export interface DocxImage {
  png: Uint8Array;
  /** Pixel size of the PNG; used to scale it into the page. */
  width: number;
  height: number;
}

export interface DocxOptions {
  title: string;
  subtitle?: string;
  /** Text shown in the page header. */
  headerText?: string;
  /** Static contents list built from headings (levels 1 and 2). Default true. */
  contents?: boolean;
  /** PNGs keyed by the exact Mermaid source of a fenced block, or by the key in a `![alt](key)` line. */
  images?: Map<string, DocxImage>;
}

type Block =
  | { t: 'heading'; level: number; text: string }
  | { t: 'para'; text: string; quote?: boolean }
  | { t: 'list'; ordered: boolean; items: Array<{ level: number; text: string }> }
  | { t: 'table'; rows: string[][] }
  | { t: 'code'; lang: string; text: string }
  | { t: 'image'; alt: string; key: string }
  | { t: 'rule' };

const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const splitRow = (l: string) => {
  let s = l.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
};

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: 'para', text: para.join(' ').trim() });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```\s*([\w-]*)\s*$/.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++) body.push(lines[i]);
      blocks.push({ t: 'code', lang: fence[1].toLowerCase(), text: body.join('\n') });
      continue;
    }
    const img = /^\s*!\[([^\]]*)\]\(([^)]*)\)\s*$/.exec(line);
    if (img) {
      flush();
      blocks.push({ t: 'image', alt: img[1], key: img[2] });
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      blocks.push({ t: 'heading', level: h[1].length, text: h[2] });
      continue;
    }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush();
      const rows = [splitRow(line)];
      for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(splitRow(lines[i]));
      i--;
      blocks.push({ t: 'table', rows });
      continue;
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const ordered = /\d/.test(li[2]);
      const item = { level: Math.min(2, Math.floor(li[1].replace(/\t/g, '  ').length / 2)), text: li[3] };
      const last = blocks[blocks.length - 1];
      if (last && last.t === 'list' && last.ordered === ordered) last.items.push(item);
      else blocks.push({ t: 'list', ordered, items: [item] });
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      blocks.push({ t: 'para', text: line.replace(/^\s*>\s?/, ''), quote: true });
      continue;
    }
    if (/^\s*([-*_])\1\1+\s*$/.test(line)) {
      flush();
      blocks.push({ t: 'rule' });
      continue;
    }
    if (!line.trim()) flush();
    else para.push(line.trim());
  }
  flush();
  return blocks;
}

// ---------------------------------------------------------------- inline

interface RunStyle { b?: boolean; i?: boolean; code?: boolean; size?: number; color?: string }

function runXml(text: string, s: RunStyle): string {
  if (!text) return '';
  const props =
    (s.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : '') +
    (s.b ? '<w:b/>' : '') + (s.i ? '<w:i/>' : '') +
    (s.color ? `<w:color w:val="${s.color}"/>` : '') +
    (s.size ? `<w:sz w:val="${s.size}"/><w:szCs w:val="${s.size}"/>` : '');
  const parts = text.split(/<br\s*\/?>|\n/i);
  const body = parts.map((p, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${xmlText(p)}</w:t>`).join('');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${body}</w:r>`;
}

export function inlineRuns(text: string, base: RunStyle = {}): string {
  const out: string[] = [];
  const re = /(\*\*|__)(.+?)\1|`([^`]+)`|(?<![\w*])([*_])(?!\s)(.+?)(?<!\s)\4(?![\w*])|\[([^\]]+)\]\(([^)]+)\)/gs;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(runXml(text.slice(last, m.index), base));
    if (m[2] !== undefined) out.push(inlineRuns(m[2], { ...base, b: true }));
    else if (m[3] !== undefined) out.push(runXml(m[3], { ...base, code: true }));
    else if (m[5] !== undefined) out.push(inlineRuns(m[5], { ...base, i: true }));
    else out.push(runXml(m[6] === m[7] ? m[6] : `${m[6]} (${m[7]})`, base));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(runXml(text.slice(last), base));
  return out.join('');
}

const stripInline = (t: string) => t.replace(/\*\*|__|`/g, '');

// ---------------------------------------------------------------- blocks to XML

const CONTENT_TWIPS = 9638; // A4 with 2 cm margins

function paragraph(runs: string, style?: string, extra = ''): string {
  return `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>${runs}</w:p>`;
}

function tableXml(rows: string[][]): string {
  const cols = Math.max(...rows.map((r) => r.length), 1);
  const w = Math.floor(CONTENT_TWIPS / cols);
  const grid = Array.from({ length: cols }, () => `<w:gridCol w:w="${w}"/>`).join('');
  const body = rows
    .map((row, ri) => {
      const cells = Array.from({ length: cols }, (_, ci) => {
        const text = row[ci] ?? '';
        const head = ri === 0;
        const shade = head ? '<w:shd w:val="clear" w:color="auto" w:fill="E7EEF0"/>' : '';
        return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shade}</w:tcPr>${paragraph(inlineRuns(text, { b: head, size: 18 }), 'TableText')}</w:tc>`;
      }).join('');
      return `<w:tr>${ri === 0 ? '<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${cells}</w:tr>`;
    })
    .join('');
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${CONTENT_TWIPS}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>${paragraph('', 'Normal')}`;
}

function imageXml(id: number, rId: string, img: DocxImage): string {
  const maxEmu = 5_900_000;
  let cx = img.width * 9525;
  let cy = img.height * 9525;
  if (cx > maxEmu) {
    cy = Math.round((cy * maxEmu) / cx);
    cx = maxEmu;
  }
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Diagram ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="diagram${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';

const STYLES = `${XML_DECL}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="1200" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="0F4C5C"/><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:rPr><w:color w:val="5B6770"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:pageBreakBefore/><w:spacing w:before="240" w:after="160"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="0F4C5C"/></w:pBdr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="0F4C5C"/><w:sz w:val="34"/><w:szCs w:val="34"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="0F4C5C"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:color w:val="1F2A30"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="60"/><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:b/><w:i/><w:color w:val="1F2A30"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="40"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="360"/></w:pPr><w:rPr><w:i/><w:color w:val="5B6770"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F3F5F6"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ContentsHeading"><w:name w:val="Contents Heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:before="480" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="0F4C5C"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="5B6770"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="5B6770"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="9AA5AB"/><w:left w:val="single" w:sz="4" w:space="0" w:color="9AA5AB"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="9AA5AB"/><w:right w:val="single" w:sz="4" w:space="0" w:color="9AA5AB"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="9AA5AB"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="9AA5AB"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`;

const lvl = (i: number, fmt: string, text: string) =>
  `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 + i * 360}" w:hanging="260"/></w:pPr></w:lvl>`;

function numberingXml(orderedLists: number): string {
  const bullets = ['•', '◦', '▪'].map((c, i) => lvl(i, 'bullet', c)).join('');
  const decimals = [0, 1, 2].map((i) => lvl(i, i === 0 ? 'decimal' : i === 1 ? 'lowerLetter' : 'lowerRoman', `%${i + 1}.`)).join('');
  const nums = Array.from({ length: orderedLists }, (_, k) => `<w:num w:numId="${k + 2}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join('');
  return `${XML_DECL}<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${bullets}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${decimals}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${nums}</w:numbering>`;
}

export function markdownToDocx(markdown: string, opts: DocxOptions): Uint8Array {
  const blocks = parseBlocks(markdown);
  const media: Array<{ name: string; data: Uint8Array }> = [];
  const parts: string[] = [];
  let orderedLists = 0;
  let drawingId = 1;

  parts.push(paragraph(runXml(opts.title, {}), 'Title'));
  if (opts.subtitle) parts.push(paragraph(runXml(opts.subtitle, {}), 'Subtitle'));
  parts.push(paragraph(runXml(`Generated ${new Date().toISOString().slice(0, 10)}`, { color: '5B6770', size: 18 })));

  if (opts.contents !== false) {
    const heads = blocks.filter((b): b is Extract<Block, { t: 'heading' }> => b.t === 'heading' && b.level <= 2);
    if (heads.length) {
      parts.push(paragraph(runXml('Contents', {}), 'ContentsHeading'));
      for (const h of heads) {
        parts.push(paragraph(runXml(stripInline(h.text), { b: h.level === 1 }), 'Normal', `<w:spacing w:after="40"/><w:ind w:left="${(h.level - 1) * 360}"/>`));
      }
    }
  }

  let firstHeading = true;
  for (const b of blocks) {
    switch (b.t) {
      case 'heading': {
        const level = Math.min(b.level, 4);
        // The first level-1 heading follows the cover block, so it starts the body on a new page via style.
        parts.push(paragraph(inlineRuns(b.text), `Heading${level}`, firstHeading && level === 1 ? '' : ''));
        if (level === 1) firstHeading = false;
        break;
      }
      case 'para':
        parts.push(b.quote ? paragraph(inlineRuns(b.text), 'Quote') : paragraph(inlineRuns(b.text)));
        break;
      case 'list': {
        const numId = b.ordered ? ++orderedLists + 1 : 1;
        for (const it of b.items) {
          parts.push(paragraph(inlineRuns(it.text), 'ListParagraph', `<w:numPr><w:ilvl w:val="${it.level}"/><w:numId w:val="${numId}"/></w:numPr>`));
        }
        break;
      }
      case 'table':
        parts.push(tableXml(b.rows));
        break;
      case 'image': {
        const img = opts.images?.get(b.key);
        if (img) {
          media.push({ name: `image${media.length + 1}.png`, data: img.png });
          parts.push(imageXml(drawingId++, `rIdImg${media.length}`, img));
          if (b.alt) parts.push(paragraph(runXml(b.alt, { i: true, color: '5B6770', size: 17 }), 'Normal', '<w:jc w:val="center"/>'));
        } else {
          parts.push(paragraph(runXml(`[${b.alt || 'Image placeholder'}]`, { i: true, color: '5B6770' }), 'Normal', '<w:pBdr><w:top w:val="dashed" w:sz="4" w:space="6" w:color="9AA5AB"/><w:left w:val="dashed" w:sz="4" w:space="6" w:color="9AA5AB"/><w:bottom w:val="dashed" w:sz="4" w:space="6" w:color="9AA5AB"/><w:right w:val="dashed" w:sz="4" w:space="6" w:color="9AA5AB"/></w:pBdr><w:spacing w:before="120" w:after="200"/><w:jc w:val="center"/>'));
        }
        break;
      }
      case 'rule':
        parts.push(paragraph('', 'Normal', '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="9AA5AB"/></w:pBdr>'));
        break;
      case 'code': {
        const img = b.lang === 'mermaid' ? opts.images?.get(b.text.trim()) : undefined;
        if (img) {
          const name = `image${media.length + 1}.png`;
          media.push({ name, data: img.png });
          parts.push(imageXml(drawingId++, `rIdImg${media.length}`, img));
        } else {
          for (const line of b.text.split('\n')) parts.push(paragraph(runXml(line || ' ', { code: true }), 'Code'));
          parts.push(paragraph(''));
        }
        break;
      }
    }
  }

  const sect = `<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
  const documentXml = `${XML_DECL}<w:document ${NS}><w:body>${parts.join('')}${sect}</w:body></w:document>`;

  const header = `${XML_DECL}<w:hdr ${NS}>${paragraph(runXml(opts.headerText ?? opts.title, {}), 'Header')}</w:hdr>`;
  const footer = `${XML_DECL}<w:ftr ${NS}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="right"/></w:pPr><w:r><w:t xml:space="preserve">Page </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;

  const rels = [
    '<Relationship Id="rIdSty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
    '<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>',
    '<Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>',
    ...media.map((m, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`),
  ].join('');

  const core = `${XML_DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlAttr(opts.title)}</dc:title><dc:creator>Application DNA</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`;

  return createZip([
    { name: '[Content_Types].xml', data: `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: 'docProps/core.xml', data: core },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/_rels/document.xml.rels', data: `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>` },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/numbering.xml', data: numberingXml(orderedLists) },
    { name: 'word/header1.xml', data: header },
    { name: 'word/footer1.xml', data: footer },
    ...media.map((m) => ({ name: `word/media/${m.name}`, data: m.data })),
  ]);
}
