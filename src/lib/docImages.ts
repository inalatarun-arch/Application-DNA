/** Browser-only helpers that turn diagrams and stored screenshots into PNGs for the DOCX writer. */
import type { DocxImage } from './docx';
import { flowToSvg } from './flowExport';
import { layoutFlow } from './flowLayout';
import { parseMermaidFlow } from './mermaidFlow';

const MAX_PX = 1600;

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Image could not be decoded.'));
    img.src = url;
  });
  return img;
}

async function canvasToImage(canvas: HTMLCanvasElement): Promise<DocxImage> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG could not be created.');
  return { png: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}

/** Draws a Mermaid flowchart with the app's own renderer (no foreignObject, so the canvas is never tainted). */
export async function mermaidToImage(source: string): Promise<DocxImage | null> {
  const model = parseMermaidFlow(source, 'Process');
  if (model.nodes.length < 2) return null;
  const layout = layoutFlow(model, 'flowchart');
  const svg = flowToSvg(layout, 'flowchart', 'Process flow');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await loadImage(url);
    const scale = Math.min(2, MAX_PX / layout.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(layout.width * scale));
    canvas.height = Math.max(1, Math.round(layout.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await canvasToImage(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Re-encodes a stored screenshot (any browser-readable format) as a PNG no wider than MAX_PX. */
export async function dataUrlToImage(dataUrl: string): Promise<DocxImage | null> {
  try {
    const img = await loadImage(dataUrl);
    const w = img.naturalWidth || 800;
    const h = img.naturalHeight || 600;
    const scale = Math.min(1, MAX_PX / w);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await canvasToImage(canvas);
  } catch {
    return null;
  }
}
