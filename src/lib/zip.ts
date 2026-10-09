/**
 * Minimal ZIP writer (store method, no compression). Enough for DOCX, VSDX and other Office
 * Open XML containers, and avoids pulling in a dependency.
 */
export interface ZipEntry {
  name: string;
  data: string | Uint8Array;
}

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();
const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

export function createZip(entries: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: number[][] = [];
  let offset = 0;
  // Fixed DOS timestamp (2024-01-01 00:00) keeps output reproducible.
  const time = 0;
  const date = ((2024 - 1980) << 9) | (1 << 5) | 1;
  for (const entry of entries) {
    const name = enc.encode(entry.name);
    const data = typeof entry.data === 'string' ? enc.encode(entry.data) : entry.data;
    const crc = crc32(data);
    const header = [
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0),
    ];
    chunks.push(new Uint8Array(header), name, data);
    central.push([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...Array.from(name),
    ]);
    offset += header.length + name.length + data.length;
  }
  const centralBytes = new Uint8Array(central.flat());
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(centralBytes.length), ...u32(offset), ...u16(0),
  ]);
  const total = offset + centralBytes.length + end.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of [...chunks, centralBytes, end]) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
