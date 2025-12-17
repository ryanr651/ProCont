import * as XLSX from "xlsx";

export interface BIFFCell {
  row: number;
  col: number;
  value: number | string;
  type: "number" | "string";
}

function decodeRK(rk: number): number {
  let value: number;
  if (rk & 0x02) {
    value = rk >> 2;
    if (rk & 0x01) value /= 100;
  } else {
    const ieee = new ArrayBuffer(8);
    const view = new DataView(ieee);
    view.setUint32(4, rk & 0xfffffffc, true);
    view.setUint32(0, 0, true);
    value = view.getFloat64(0, true);
    if (rk & 0x01) value /= 100;
  }
  return value;
}

function parseBIFFStream(stream: Uint8Array, strings: string[]): BIFFCell[] {
  const data = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const cells: BIFFCell[] = [];

  let offset = 0;
  const len = stream.byteLength;

  // Basic BIFF record scan
  while (offset + 4 <= len) {
    const recordType = data.getUint16(offset, true);
    const recordLen = data.getUint16(offset + 2, true);
    const next = offset + 4 + recordLen;

    if (recordLen > 0x4000 || next > len) {
      // resync
      offset += 1;
      continue;
    }

    // NUMBER (0x0203): row(2) col(2) xf(2) val(8)
    if (recordType === 0x0203 && recordLen >= 14) {
      const row = data.getUint16(offset + 4, true);
      const col = data.getUint16(offset + 6, true);
      const value = data.getFloat64(offset + 10, true);
      if (Number.isFinite(value) && row < 100000 && col < 256) {
        cells.push({ row, col, value, type: "number" });
      }
    }

    // RK (0x027E): row(2) col(2) xf(2) rk(4)
    else if (recordType === 0x027e && recordLen >= 10) {
      const row = data.getUint16(offset + 4, true);
      const col = data.getUint16(offset + 6, true);
      const rk = data.getUint32(offset + 10, true);
      const value = decodeRK(rk);
      if (Number.isFinite(value) && row < 100000 && col < 256) {
        cells.push({ row, col, value, type: "number" });
      }
    }

    // MULRK (0x00BD): row(2) colFirst(2) {xf(2) rk(4)}* colLast(2)
    else if (recordType === 0x00bd && recordLen >= 6 + 6 + 2) {
      const row = data.getUint16(offset + 4, true);
      const colFirst = data.getUint16(offset + 6, true);
      const colLast = data.getUint16(offset + 4 + recordLen - 2, true);
      const count = colLast - colFirst + 1;
      // each entry is 6 bytes (xf + rk)
      const payloadOffset = offset + 8;
      for (let i = 0; i < count; i++) {
        const pos = payloadOffset + i * 6;
        if (pos + 6 > offset + 4 + recordLen - 2) break;
        const rk = data.getUint32(pos + 2, true);
        const value = decodeRK(rk);
        if (Number.isFinite(value) && row < 100000 && colFirst + i < 256) {
          cells.push({ row, col: colFirst + i, value, type: "number" });
        }
      }
    }

    // LABELSST (0x00FD): row(2) col(2) xf(2) sst(4)
    else if (recordType === 0x00fd && recordLen >= 10) {
      const row = data.getUint16(offset + 4, true);
      const col = data.getUint16(offset + 6, true);
      const sstIndex = data.getUint32(offset + 10, true);
      const text = strings[sstIndex];
      if (typeof text === "string" && text.length) {
        cells.push({ row, col, value: text, type: "string" });
      }
    }

    offset = next;
  }

  return cells;
}

/**
 * Extract cells from legacy XLS (BIFF8) by reading OLE streams and scanning BIFF records.
 * This is used ONLY when the normal xlsx sheet extraction yields text but no numeric cells.
 */
export function parseBIFF8CellsFromXls(buffer: ArrayBuffer, strings: string[]): BIFFCell[] {
  const uint8 = new Uint8Array(buffer);

  // If not an OLE compound file, fall back to scanning raw stream
  const isOLE =
    uint8.length >= 8 &&
    uint8[0] === 0xd0 &&
    uint8[1] === 0xcf &&
    uint8[2] === 0x11 &&
    uint8[3] === 0xe0 &&
    uint8[4] === 0xa1 &&
    uint8[5] === 0xb1 &&
    uint8[6] === 0x1a &&
    uint8[7] === 0xe1;

  try {
    if (isOLE) {
      const cfb = XLSX.CFB.read(uint8, { type: "buffer" });
      const paths: string[] = (cfb?.FullPaths || []) as string[];
      const fileIndex: any[] = (cfb?.FileIndex || []) as any[];

      const cells: BIFFCell[] = [];

      for (let i = 0; i < paths.length; i++) {
        const p = paths[i] || "";
        const fi = fileIndex[i];
        const content: Uint8Array | undefined = fi?.content;
        if (!content || !(content instanceof Uint8Array) || content.byteLength < 8) continue;

        // Prioritize worksheet streams; fallback to anything likely containing BIFF records
        const isWorkbook = /\b(Workbook|Book)\b/i.test(p);
        const isWorksheet = /\b(Worksheet|Sheet)\b/i.test(p);
        if (!isWorkbook && !isWorksheet) continue;

        const parsed = parseBIFFStream(content, strings);
        if (parsed.length) cells.push(...parsed);
      }

      return cells;
    }

    // Non-OLE (rare): scan whole buffer
    return parseBIFFStream(uint8, strings);
  } catch {
    // If CFB fails, fall back to raw scan
    return parseBIFFStream(uint8, strings);
  }
}
