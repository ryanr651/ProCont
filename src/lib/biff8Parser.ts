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
 * Check if string looks like a Brazilian formatted number
 */
function isBrazilianNumber(str: string): boolean {
  const text = str.trim();
  if (!text) return false;
  
  // Skip obvious non-numbers
  if (/^[A-Za-z\(\-\+]/.test(text) && !/^[-+]?\d/.test(text)) return false;
  
  // Brazilian format: 1.234,56 or 1234,56 or -1.234,56 D/C
  const pattern = /^[-+]?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?(?:\s*[DC])?$/;
  if (pattern.test(text)) return true;
  
  // Also accept: 1234.56 (international format sometimes used)
  const intlPattern = /^[-+]?\d+(?:\.\d{1,2})?$/;
  if (intlPattern.test(text) && text.includes('.') && !text.includes(',')) {
    const num = parseFloat(text);
    return Number.isFinite(num) && Math.abs(num) >= 0.01 && Math.abs(num) <= 100000000000;
  }
  
  return false;
}

/**
 * Parse Brazilian formatted number string
 */
function parseBrazilianNumberString(str: string): number {
  let text = str.trim();
  
  // Handle D/C suffix (Debit/Credit)
  const hasDebit = /\s*D\s*$/i.test(text);
  const hasCredit = /\s*C\s*$/i.test(text);
  text = text.replace(/\s*[DC]\s*$/i, '');
  
  // Brazilian format: dots as thousands, comma as decimal
  // 1.234.567,89 -> 1234567.89
  let normalized = text
    .replace(/\./g, '')  // Remove thousand separators
    .replace(',', '.');  // Convert decimal separator
  
  const value = parseFloat(normalized);
  if (!Number.isFinite(value)) return 0;
  
  // Apply D/C rules (simplified: D = positive, C = negative for assets)
  if (hasCredit) return -Math.abs(value);
  if (hasDebit) return Math.abs(value);
  
  return value;
}

/**
 * Extract cells from legacy XLS (BIFF8) by analyzing string table content.
 * Numbers in legacy XLS are often stored as formatted text strings.
 */
export function parseBIFF8CellsFromXls(buffer: ArrayBuffer, strings: string[]): BIFFCell[] {
  debugLog(`Parsing XLS: ${buffer.byteLength} bytes, ${strings.length} strings`);

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

  // FALLBACK: Analyze strings for numbers stored as text
  if (numericCells === 0 && strings.length > 0) {
    debugLog("No BIFF numbers found, analyzing strings for formatted numbers...");
    
    cells = [];
    let currentRow = 0;
    let currentCol = 0;
    
    // Track which strings are account names vs numbers
    const processedStrings: Array<{
      text: string;
      isNumber: boolean;
      value: number;
      row: number;
      col: number;
    }> = [];
    
    for (const str of strings) {
      const text = String(str || "").trim();
      if (!text || text.length < 1) continue;
      
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
        text.length > 100
      ) {
        continue;
      }
      
      const isNumber = isBrazilianNumber(text);
      const value = isNumber ? parseBrazilianNumberString(text) : 0;
      
      processedStrings.push({
        text,
        isNumber,
        value,
        row: currentRow,
        col: currentCol
      });
      
      // Move to next position
      if (isNumber) {
        currentCol++;
        // Assume max 2 value columns (current + previous period)
        if (currentCol > 2) {
          currentCol = 0;
          currentRow++;
        }
      } else {
        // Text usually starts a new row (account name)
        if (currentCol > 0) {
          currentRow++;
        }
        currentCol = 0;
      }
    }
    
    // Re-process into proper row structure
    // Account name at col 0, value at col 1, previous value at col 2
    let rowIdx = 0;
    let pendingName: string | null = null;
    let pendingValues: number[] = [];
    
    for (const item of processedStrings) {
      if (!item.isNumber) {
        // Save previous row if exists
        if (pendingName !== null) {
          cells.push({ row: rowIdx, col: 0, value: pendingName, type: "string" });
          if (pendingValues.length > 0) {
            cells.push({ row: rowIdx, col: 1, value: pendingValues[0], type: "number" });
          }
          if (pendingValues.length > 1) {
            cells.push({ row: rowIdx, col: 2, value: pendingValues[1], type: "number" });
          }
          rowIdx++;
        }
        pendingName = item.text;
        pendingValues = [];
      } else {
        pendingValues.push(item.value);
      }
    }
    
    // Save last row
    if (pendingName !== null) {
      cells.push({ row: rowIdx, col: 0, value: pendingName, type: "string" });
      if (pendingValues.length > 0) {
        cells.push({ row: rowIdx, col: 1, value: pendingValues[0], type: "number" });
      }
      if (pendingValues.length > 1) {
        cells.push({ row: rowIdx, col: 2, value: pendingValues[1], type: "number" });
      }
    }

    debugLog(`String analysis cells created: ${cells.length}`);
    debugLog(`Sample values: ${cells.filter(c => c.type === "number").slice(0, 10).map(c => c.value).join(", ")}`);
  }

  return cells;
}
