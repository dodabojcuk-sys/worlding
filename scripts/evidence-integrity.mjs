import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Decode a non-interlaced, 8-bit PNG into rows of unfiltered pixel bytes.
 * Evidence capture is deliberately fail-closed: unsupported PNG variants are
 * not silently treated as clean screenshots.
 */
export function decodePng(filePath) {
  const bytes = readFileSync(filePath);
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${filePath}: not a PNG`);
  let offset = 8;
  let header;
  const data = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset); offset += 4;
    const type = bytes.subarray(offset, offset + 4).toString("ascii"); offset += 4;
    const chunk = bytes.subarray(offset, offset + length); offset += length + 4;
    if (type === "IHDR") header = { width: chunk.readUInt32BE(0), height: chunk.readUInt32BE(4), bitDepth: chunk[8], colorType: chunk[9], compression: chunk[10], filter: chunk[11], interlace: chunk[12] };
    if (type === "IDAT") data.push(chunk);
    if (type === "IEND") break;
  }
  if (!header || header.bitDepth !== 8 || header.interlace !== 0 || header.compression !== 0 || header.filter !== 0) throw new Error(`${filePath}: unsupported PNG encoding`);
  const channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 })[header.colorType];
  if (!channels) throw new Error(`${filePath}: unsupported PNG color type ${header.colorType}`);
  const rowBytes = header.width * channels;
  const input = inflateSync(Buffer.concat(data));
  if (input.length !== header.height * (rowBytes + 1)) throw new Error(`${filePath}: malformed PNG scanlines`);
  const pixels = Buffer.alloc(rowBytes * header.height);
  let source = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = input[source++];
    const row = pixels.subarray(y * rowBytes, (y + 1) * rowBytes);
    const previous = y ? pixels.subarray((y - 1) * rowBytes, y * rowBytes) : null;
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = input[source++];
      const left = x >= channels ? row[x - channels] : 0;
      const above = previous ? previous[x] : 0;
      const upperLeft = previous && x >= channels ? previous[x - channels] : 0;
      if (filter === 0) row[x] = raw;
      else if (filter === 1) row[x] = (raw + left) & 255;
      else if (filter === 2) row[x] = (raw + above) & 255;
      else if (filter === 3) row[x] = (raw + Math.floor((left + above) / 2)) & 255;
      else if (filter === 4) row[x] = (raw + paeth(left, above, upperLeft)) & 255;
      else throw new Error(`${filePath}: unsupported PNG filter ${filter}`);
    }
  }
  return { ...header, channels, rowBytes, pixels, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/** Scan all practical offsets without assuming a filename or viewport. */
export function scanHorizontalRepeat(filePath, { minBandWidth = 256, exactMaeThreshold = 0, nearMaeThreshold = 3 } = {}) {
  const image = decodePng(filePath);
  if (image.width < minBandWidth * 2) return emptyRepeat(image, minBandWidth);
  let largest = { offset: null, bandWidth: 0, exact: false, mae: null, edgeAgreement: null };
  for (let offset = minBandWidth; offset <= image.width - minBandWidth; offset += 1) {
    const bandWidth = image.width - offset;
    const sample = sampleDifference(image, offset, bandWidth);
    // A blank canvas is expected to repeat. It is not compositor evidence.
    if (sample.mae > nearMaeThreshold || sample.edgeAgreement < 0.97 || sample.edgeDensity < 0.02) continue;
    const full = fullDifference(image, offset, bandWidth);
    const exact = full.mae <= exactMaeThreshold && full.edgeAgreement === 1 && full.edgeDensity >= 0.01;
    if (exact || (full.mae <= nearMaeThreshold && full.edgeAgreement >= 0.97)) {
      if (bandWidth > largest.bandWidth || (bandWidth === largest.bandWidth && exact && !largest.exact)) largest = { offset, bandWidth, exact, mae: full.mae, edgeAgreement: full.edgeAgreement };
    }
  }
  return { width: image.width, height: image.height, sha256: image.sha256, repeatOffsetsChecked: { min: minBandWidth, max: image.width - minBandWidth, count: Math.max(0, image.width - minBandWidth * 2 + 1) }, largestRepeatedBand: largest.bandWidth, repeatOffset: largest.offset, nearRepeatScore: largest.mae, edgeAgreement: largest.edgeAgreement, tiled: largest.bandWidth >= minBandWidth, mode: largest.exact ? "exact" : largest.bandWidth ? "near" : "none" };
}

export function groupDuplicateHashes(records) {
  const groups = new Map();
  for (const record of records) groups.set(record.sha256, [...(groups.get(record.sha256) || []), record]);
  return [...groups.entries()].filter(([, items]) => items.length > 1).map(([sha256, items]) => ({ sha256, files: items.map((item) => item.filePath), descriptions: items.map((item) => item.description || null) }));
}

function emptyRepeat(image, minBandWidth) {
  return { width: image.width, height: image.height, sha256: image.sha256, repeatOffsetsChecked: { min: minBandWidth, max: 0, count: 0 }, largestRepeatedBand: 0, repeatOffset: null, nearRepeatScore: null, edgeAgreement: null, tiled: false, mode: "none" };
}

function sampleDifference(image, offset, bandWidth) {
  const rows = uniqueIntegers(Array.from({ length: 13 }, (_, index) => Math.floor((index * (image.height - 1)) / 12)));
  const sampleWidth = Math.min(192, bandWidth);
  return difference(image, offset, sampleWidth, rows);
}

function fullDifference(image, offset, bandWidth) {
  return difference(image, offset, bandWidth, null);
}

function difference(image, offset, width, selectedRows) {
  const { channels, rowBytes, height, pixels } = image;
  let absolute = 0;
  let edgeMatches = 0;
  let edgeTotal = 0;
  let edgeSignal = 0;
  let count = 0;
  const rows = selectedRows || Array.from({ length: height }, (_, index) => index);
  for (const y of rows) {
    const row = y * rowBytes;
    for (let x = 0; x < width * channels; x += 1) {
      const a = pixels[row + x]; const b = pixels[row + offset * channels + x];
      absolute += Math.abs(a - b); count += 1;
      if (x >= channels) {
        const edgeA = Math.abs(a - pixels[row + x - channels]) > 12;
        const edgeB = Math.abs(b - pixels[row + offset * channels + x - channels]) > 12;
        if (edgeA === edgeB) edgeMatches += 1;
        if (edgeA || edgeB) edgeSignal += 1;
        edgeTotal += 1;
      }
    }
  }
  return { mae: Number((absolute / Math.max(1, count)).toFixed(6)), edgeAgreement: Number((edgeMatches / Math.max(1, edgeTotal)).toFixed(6)), edgeDensity: Number((edgeSignal / Math.max(1, edgeTotal)).toFixed(6)) };
}

function uniqueIntegers(values) { return [...new Set(values)]; }
function paeth(a, b, c) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
