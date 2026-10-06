import { renderToStaticMarkup } from 'react-dom/server';
import FlowDiagram from '@/components/flow/FlowDiagram';
import { LIGHT } from '@/config/palette';
import type { FlowLayout } from './flowLayout';
import type { FlowView } from './flowModel';
import { downloadBlob } from './download';

/** Self-contained SVG using the light palette, so exports look the same regardless of the current theme. */
export function flowToSvg(layout: FlowLayout, view: FlowView, title: string): string {
  const svg = renderToStaticMarkup(<FlowDiagram layout={layout} view={view} palette={LIGHT} title={title} idPrefix="eih-export" />);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
}

export function exportFlowSvg(layout: FlowLayout, view: FlowView, title: string, filename: string): void {
  downloadBlob(new Blob([flowToSvg(layout, view, title)], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

export async function exportFlowPng(layout: FlowLayout, view: FlowView, title: string, filename: string, scale = 2): Promise<void> {
  const url = URL.createObjectURL(new Blob([flowToSvg(layout, view, title)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('The diagram could not be rendered to an image.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(layout.width * scale);
    canvas.height = Math.round(layout.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image export is not available in this browser.');
    ctx.fillStyle = LIGHT.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The PNG could not be created.');
    downloadBlob(blob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
