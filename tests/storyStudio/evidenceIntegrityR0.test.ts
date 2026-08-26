import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { groupDuplicateHashes, scanHorizontalRepeat } from "../../scripts/evidence-integrity.mjs";

const fixtureRoot = mkdtempSync(path.join(tmpdir(), "tianyan-evidence-integrity-r0-"));

test("the generic integrity gate rejects deterministic tiled PNG fixtures", () => {
  const files = Array.from({ length: 16 }, (_, index) => {
    const filePath = path.join(fixtureRoot, `${String(index + 1).padStart(2, "0")}-fixture.png`);
    writeFileSync(filePath, index === 15 ? pngBuffer({ tiled: false, seed: index }) : pngBuffer({ tiled: true, seed: index }));
    return filePath;
  });
  const tiled = files.map((filePath) => ({ filePath, scan: scanHorizontalRepeat(filePath) })).filter(({ scan }) => scan.tiled);
  assert.equal(tiled.length, 15);
  assert.equal(tiled.every(({ scan }) => scan.repeatOffset === 1024 && scan.largestRepeatedBand === 416 && scan.mode === "exact"), true);
});

test("semantic descriptions cannot count duplicate bytes as two independent visual states", () => {
  const fourth = path.join(fixtureRoot, "04-duplicate.png");
  const fifth = path.join(fixtureRoot, "05-duplicate.png");
  const bytes = pngBuffer({ tiled: true, seed: 42 });
  writeFileSync(fourth, bytes);
  writeFileSync(fifth, bytes);
  const duplicates = groupDuplicateHashes([
    { filePath: fourth, description: "one derived version", sha256: scanHorizontalRepeat(fourth).sha256 },
    { filePath: fifth, description: "version provenance", sha256: scanHorizontalRepeat(fifth).sha256 }
  ]);
  assert.deepEqual(duplicates.map((group) => group.files.map((file) => path.basename(file))), [[path.basename(fourth), path.basename(fifth)]]);
});

function pngBuffer({ tiled, seed }: { tiled: boolean; seed: number }) {
  const width = 1440;
  const height = 4;
  const rows = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 3 + 1);
    rows[rowOffset] = 0;
    const pixels = rows.subarray(rowOffset + 1, rowOffset + 1 + width * 3);
    let state = (seed + 1) * 1103515245 + y;
    for (let x = 0; x < (tiled ? 1024 : width); x += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      pixels[x * 3] = state & 255;
      pixels[x * 3 + 1] = (state >>> 8) & 255;
      pixels[x * 3 + 2] = (state >>> 16) & 255;
    }
    if (tiled) pixels.copy(pixels, 1024 * 3, 0, 416 * 3);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", Buffer.from([0, 0, 5, 160, 0, 0, 0, 4, 8, 2, 0, 0, 0])),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const typeBytes = Buffer.from(type);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function crc32(input: Buffer) {
  let value = 0xffffffff;
  for (const byte of input) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
