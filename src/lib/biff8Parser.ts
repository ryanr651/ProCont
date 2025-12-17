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
 * Scan for IEEE 754 doubles that look like accounting values
 * Returns pairs of (offset, value) sorted by offset
 */
function scanForAccountingDoubles(buffer: ArrayBuffer): Array<{ offset: number; value: number }> {
  const data = new DataView(buffer);
  const len = buffer.byteLength;
  const found: Array<{ offset: number; value: number }> = [];

  for (let i = 0; i < len - 8; i++) {
    try {
      const value = data.getFloat64(i, true);
      if (value !== 0 && Number.isFinite(value) && !Number.isNaN(value)) {
        const absVal = Math.abs(value);
        // Accounting range: 0.01 to 1 billion
        if (absVal >= 0.01 && absVal <= 1000000000) {
          // Must be "clean" - max 2 decimals
          const rounded = Math.round(value * 100) / 100;
          if (Math.abs(value - rounded) < 0.0001) {
            // Skip powers of 2 (likely memory addresses)
            const log2 = Math.log2(absVal);
            if (absVal > 1000 && log2 > 10 && Math.abs(log2 - Math.round(log2)) < 0.001) {
              continue;
            }
            found.push({ offset: i, value: rounded });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // Remove duplicates and sort by offset
  const seen = new Set<string>();
  const unique: Array<{ offset: number; value: number }> = [];
  
  for (const f of found) {
    const key = `${Math.floor(f.offset / 8)}_${f.value.toFixed(2)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(f);
    }
  }

  unique.sort((a, b) => a.offset - b.offset);
  
  // Further dedupe by removing values within 8 bytes of each other
  const final: Array<{ offset: number; value: number }> = [];
  for (const item of unique) {
    const lastOffset = final.length > 0 ? final[final.length - 1].offset : -100;
    if (item.offset - lastOffset >= 8) {
      final.push(item);
    }
  }

  return final;
}

/**
 * Check if string is a valid account name (not metadata)
 */
function isAccountName(text: string): boolean {
  if (!text || text.length < 2 || text.length > 80) return false;
  
  // Skip headers/metadata
  if (
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
    /^\d{2}\.\d{3}\.\d{3}/.test(text) ||
    /^\d+$/.test(text) ||
    /^[\d.,\s]+$/.test(text) // Pure numbers
  ) {
    return false;
  }
  
  return true;
}

/**
 * Extract cells from legacy XLS (BIFF8).
 */
export function parseBIFF8CellsFromXls(buffer: ArrayBuffer, strings: string[]): BIFFCell[] {
  debugLog(`Parsing XLS: ${buffer.byteLength} bytes, ${strings.length} strings`);

  // Log sample strings
  const sampleStrings = strings.slice(0, 15).map(s => `"${String(s).substring(0, 40)}"`);
  debugLog(`Sample strings: ${sampleStrings.join(", ")}`);

  const uint8 = new Uint8Array(buffer);
  const isOLE =
    uint8.length >= 8 &&
    uint8[0] === 0xd0 &&
    uint8[1] === 0xcf &&
    uint8[2] === 0x11 &&
    uint8[3] === 0xe0;

  debugLog(`isOLE: ${isOLE}`);

  // First try BIFF record parsing
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
      cells = parseBIFFStream(uint8, strings);
    }
  } catch (e) {
    debugLog(`CFB error: ${e}`);
  }

  const numericCells = cells.filter((c) => c.type === "number").length;
  const stringCells = cells.filter((c) => c.type === "string").length;
  debugLog(`BIFF result: ${numericCells} numbers, ${stringCells} strings`);

  // FALLBACK: Use IEEE scan + string analysis
  if (numericCells === 0 && strings.length > 0) {
    debugLog("No BIFF numbers found, using IEEE scan + string analysis...");
    
    // 1. Extract account names from strings (in order)
    const accountNames: string[] = [];
    for (const str of strings) {
      const text = String(str || "").trim();
      if (isAccountName(text)) {
        accountNames.push(text);
      }
    }
    
    debugLog(`Account names: ${accountNames.length}`);
    debugLog(`First 10 names: ${accountNames.slice(0, 10).join(" | ")}`);

    // 2. Extract numbers via IEEE scan
    const numbersWithOffsets = scanForAccountingDoubles(buffer);
    const numbers = numbersWithOffsets.map(n => n.value);
    
    debugLog(`Numbers found: ${numbers.length}`);
    debugLog(`First 20 numbers: ${numbers.slice(0, 20).join(", ")}`);

    // 3. Build cells - pair account names with numbers
    // Each row: account name + current value + previous value
    cells = [];
    let numIdx = 0;
    
    for (let rowIdx = 0; rowIdx < accountNames.length; rowIdx++) {
      const name = accountNames[rowIdx];
      
      // Add account name cell
      cells.push({ row: rowIdx, col: 0, value: name, type: "string" });
      
      // Add value cell(s) - 2 values per row (current + previous)
      if (numIdx < numbers.length) {
        cells.push({ row: rowIdx, col: 1, value: numbers[numIdx], type: "number" });
        numIdx++;
      }
      if (numIdx < numbers.length) {
        cells.push({ row: rowIdx, col: 2, value: numbers[numIdx], type: "number" });
        numIdx++;
      }
    }

    debugLog(`Cells created: ${cells.length} (${cells.filter(c => c.type === "number").length} numeric)`);
  }

  return cells;
}
