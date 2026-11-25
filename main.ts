// news-image-20261125 entry (Node 22, standard library only).
// Validates the bundled 25 November 2026 world news digest image and writes it deterministically to /output/entry.png.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES = 1_048_576;
const MAX_DIM = 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IEND = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

function parseJpegDimensions(bytes: Buffer): { width: number; height: number } {
  let offset = 2;
  while (offset + 4 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const segLen = bytes.readUInt16BE(offset + 2);
    if (segLen < 2 || offset + 2 + segLen > bytes.byteLength) break;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)) {
      if (offset + 9 <= bytes.byteLength) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
    }
    offset += 2 + segLen;
  }
  throw new Error('entry.png JPEG missing SOF dimensions');
}

function validateImagePayload(bytes: Buffer): { format: 'PNG' | 'JPEG'; width: number; height: number } {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    throw new Error(`entry.png byte length ${bytes.byteLength} outside 1..${MAX_BYTES}`);
  }
  if (bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    if (bytes.byteLength < 24 || !bytes.subarray(bytes.byteLength - 12).equals(PNG_IEND)) {
      throw new Error('entry.png PNG payload truncated (missing IEND trailer)');
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width < 1 || width > MAX_DIM || height < 1 || height > MAX_DIM) {
      throw new Error(`entry.png PNG dimensions ${width}x${height} exceed ${MAX_DIM}x${MAX_DIM}`);
    }
    return { format: 'PNG', width, height };
  }
  if (bytes.subarray(0, 3).equals(JPEG_MAGIC)) {
    if (bytes.byteLength < 6 || bytes[bytes.byteLength - 2] !== 0xff || bytes[bytes.byteLength - 1] !== 0xd9) {
      throw new Error('entry.png JPEG payload truncated (missing EOI trailer)');
    }
    const { width, height } = parseJpegDimensions(bytes);
    if (width < 1 || width > MAX_DIM || height < 1 || height > MAX_DIM) {
      throw new Error(`entry.png JPEG dimensions ${width}x${height} exceed ${MAX_DIM}x${MAX_DIM}`);
    }
    return { format: 'JPEG', width, height };
  }
  throw new Error('entry.png must be a whole PNG or JPEG image');
}

const sourcePath = new URL('./entry.png', import.meta.url);
const payload = readFileSync(sourcePath);
const meta = validateImagePayload(payload);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'entry.png');
writeFileSync(outFile, payload);

const sha256 = createHash('sha256').update(payload).digest('hex');
process.stdout.write(
  `wrote ${outFile} (${meta.format} ${meta.width}x${meta.height}, ${payload.byteLength} bytes, sha256=${sha256})\n`,
);
