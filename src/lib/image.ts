export interface ProcessedImage {
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
}

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 1920;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

const approxBytes = (dataUrl: string) => Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);

/**
 * Validates an image and downsizes large rasters (max 1920px, WebP) so IndexedDB and backups stay small.
 * SVG and GIF are stored as-is.
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is larger than 15 MB.`);

  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return { dataUrl: await readAsDataUrl(file), mimeType: file.type, sizeBytes: file.size };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name} could not be decoded as an image.`);
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Image processing is not available in this browser.');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const encoded = canvas.toDataURL('image/webp', 0.9);
  const encodedSize = approxBytes(encoded);

  // Unscaled image where re-encoding didn't help (or the browser can't encode WebP): keep the original.
  if (scale === 1 && (encodedSize >= file.size || !encoded.startsWith('data:image/webp'))) {
    return { dataUrl: await readAsDataUrl(file), mimeType: file.type, sizeBytes: file.size };
  }
  return { dataUrl: encoded, mimeType: encoded.slice(5, encoded.indexOf(';')), sizeBytes: encodedSize };
}
