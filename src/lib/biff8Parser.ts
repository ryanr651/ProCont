import * as XLSX from "xlsx";

export interface BIFFCell {
  row: number;
  col: number;
  value: number | string;
  type: "number" | "string";
}

const DEBUG = true;
function debugLog(msg: string, data?: unknown) {
  if (DEBUG) console.log(`[BIFF8] ${msg}`, data !== undefined ? data : "");
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
  let numRecords = 0;
  let labelRecords = 0;
  let rkRecords = 0;
  let mulrkRecords = 0;

  while (offset + 4 <= len) {
    const recordType = data.getUint16(offset, true);
    const recordLen = data.getUint16(offset + 2, true);
    const next = offset + 4 + recordLen;

    if (recordLen > 0x4000 || next > len) {
      offset += 1;
      continue;
    }

    // NUMBER (0x0203)
    if (recordType === 0x0203 && recordLen >= 14) {
      const row = data.getUint16(offset + 4, true);
      const col = data.getUint16(offset + 6, true);
      const value = data.getFloat64(offset + 10, true);
      if (Number.isFinite(value) && row < 100000 && col < 256) {
        cells.push({ row, col, value, type: "number" });
        numRecords++;
      }
    }

    // RK (0x027E)
    else if (recordType === 0x027e && recordLen >= 10) {
      const row = data.getUint16(offset + 4, true);
      const col = data.getUint16(offset + 6, true);
      const rk = data.getUint32(offset + 10, true);
      const value = decodeRK(rk);
      if (Number.isFinite(value) && row < 100000 && col < 256) {
        cells.push({ row, col, value, type: "number" });
        rkRecords++;
      }
    }

    // MULRK (0x00BD)
    else if (recordType === 0x00bd && recordLen >= 14) {
      const row = data.getUint16(offset + 4, true);
      const colFirst = data.getUint16(offset + 6, true);
      const colLast = data.getUint16(offset + 4 + recordLen - 2, true);
      const count = colLast - colFirst + 1;
      const payloadOffset = offset + 8;
      for (let i = 0; i < count; i++) {
        const pos = payloadOffset + i * 6;
        if (pos + 6 > offset + 4 + recordLen - 2) break;
        const rk = data.getUint32(pos + 2, true);
        const value = decodeRK(rk);
        if (Number.isFinite(value) && row < 100000 && colFirst + i < 256) {
          cells.push({ row, col: colFirst + i, value, type: "number" });
          mulrkRecords++;
        }
      }
    }

    // LABELSST (0x00FD)
    else if (recordType === 0x00fd && recordLen >= 10) {
      const row = data.getUint16(offset + 4, true);
      const col = data.getUint16(offset + 6, true);
      const sstIndex = data.getUint32(offset + 10, true);
      const text = strings[sstIndex];
      if (typeof text === "string" && text.length) {
        cells.push({ row, col, value: text, type: "string" });
        labelRecords++;
      }
    }

    offset = next;
  }

  debugLog(`Records: NUMBER=${numRecords}, RK=${rkRecords}, MULRK=${mulrkRecords}, LABELSST=${labelRecords}`);
  return cells;
}

/**
 * Scan for IEEE 754 doubles in buffer - fallback when BIFF records don't work
 */
function scanForDoubles(buffer: ArrayBuffer): number[] {
  const data = new DataView(buffer);
  const len = buffer.byteLength;
  const found: { offset: number; value: number }[] = [];

  for (let i = 0; i < len - 8; i++) {
    try {
      const value = data.getFloat64(i, true);
      if (value !== 0 && Number.isFinite(value) && !Number.isNaN(value)) {
        const absVal = Math.abs(value);
        // Typical accounting range: 0.01 to 100 billion
        if (absVal >= 0.01 && absVal <= 100000000000) {
          // Must look like a "clean" number (max 2 decimals)
          const rounded = Math.round(value * 100) / 100;
          if (Math.abs(value - rounded) < 0.001) {
            found.push({ offset: i, value: rounded });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // Dedupe (same offset within 8 bytes = same double)
  const unique: number[] = [];
  for (const f of found) {
    const isDupe = found.some(
      (o) => Math.abs(o.offset - f.offset) < 8 && Math.abs(o.offset - f.offset) > 0 && o.value === f.value
    );
    if (!isDupe && !unique.includes(f.value)) {
      unique.push(f.value);
    }
  }

  // Remove very similar values (within 0.01)
  const final: number[] = [];
  for (const val of unique) {
    if (!final.some((v) => Math.abs(v - val) < 0.01)) {
      final.push(val);
    }
  }

  debugLog(`IEEE scan: found ${found.length} candidates, ${final.length} unique`);
  return final;
}

/**
 * Extract cells from legacy XLS (BIFF8) by reading OLE streams.
 * Falls back to IEEE double scanning if BIFF records yield no numbers.
 */
export function parseBIFF8CellsFromXls(buffer: ArrayBuffer, strings: string[]): BIFFCell[] {
  const uint8 = new Uint8Array(buffer);

  debugLog(`Parsing XLS: ${buffer.byteLength} bytes, ${strings.length} strings`);

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

  debugLog(`isOLE: ${isOLE}`);

  let cells: BIFFCell[] = [];

  try {
    if (isOLE) {
      const cfb = XLSX.CFB.read(uint8, { type: "buffer" });
      const paths: string[] = (cfb?.FullPaths || []) as string[];
      const fileIndex: any[] = (cfb?.FileIndex || []) as any[];

      debugLog(`CFB paths: ${paths.length}`);

      for (let i = 0; i < paths.length; i++) {
        const p = paths[i] || "";
        const fi = fileIndex[i];
        const content: Uint8Array | undefined = fi?.content;
        
        if (!content || !(content instanceof Uint8Array) || content.byteLength < 8) continue;

        const isWorkbook = /\b(Workbook|Book)\b/i.test(p);
        if (!isWorkbook) continue;

        debugLog(`Parsing stream: ${p} (${content.byteLength} bytes)`);
        const parsed = parseBIFFStream(content, strings);
        cells.push(...parsed);
      }
    } else {
      // Scan whole buffer
      cells = parseBIFFStream(uint8, strings);
    }
  } catch (e) {
    debugLog(`CFB error: ${e}`);
    cells = parseBIFFStream(uint8, strings);
  }

  // Count numeric vs string cells
  const numericCells = cells.filter((c) => c.type === "number").length;
  const stringCells = cells.filter((c) => c.type === "string").length;
  debugLog(`BIFF result: ${numericCells} numbers, ${stringCells} strings`);

  // FALLBACK: If no numeric cells found via BIFF, scan for IEEE doubles
  if (numericCells === 0 && strings.length > 0) {
    debugLog("No BIFF numbers found, falling back to IEEE double scan...");
    
    const doubles = scanForDoubles(buffer);
    debugLog(`IEEE doubles found: ${doubles.slice(0, 20)}`);

    // Filter account names from strings
    const accountNames: string[] = [];
    for (const str of strings) {
      const text = String(str || "").trim();
      if (
        !text ||
        text.length < 3 ||
        text.includes("Empresa:") ||
        text.includes("C.N.P.J.") ||
        text.includes("Período:") ||
        text.includes("Folha:") ||
        text.includes("DEMONSTRAÇÃO") ||
        text.includes("BALANÇO") ||
        text.includes("________") ||
        text.includes("CPF:") ||
        text.includes("CRC") ||
        text.includes("GERENTE") ||
        text.includes("Sistema licenciado") ||
        text.includes("CNPJ") ||
        text.includes("Número livro") ||
        /^\d{2}\.\d{3}\.\d{3}/.test(text)
      ) {
        continue;
      }
      accountNames.push(text);
    }

    debugLog(`Account names: ${accountNames.length}`);

    // Associate doubles with account names
    // Heuristic: 2 values per row (current + previous period)
    let dblIdx = 0;
    for (let rowIdx = 0; rowIdx < accountNames.length; rowIdx++) {
      const name = accountNames[rowIdx];
      
      // Add text cell
      cells.push({ row: rowIdx, col: 0, value: name, type: "string" });

      // Add up to 2 numeric values per row
      if (dblIdx < doubles.length) {
        cells.push({ row: rowIdx, col: 1, value: doubles[dblIdx], type: "number" });
        dblIdx++;
      }
      if (dblIdx < doubles.length) {
        cells.push({ row: rowIdx, col: 2, value: doubles[dblIdx], type: "number" });
        dblIdx++;
      }
    }

    debugLog(`Fallback cells created: ${cells.length}`);
  }

  return cells;
}
