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

/**
 * Parse Brazilian number from string
 * Handles: 1.234,56 | 1234,56 | 1,234.56 | 1234.56 | with D/C suffix
 */
function parseBrazilianNumberFromString(text: string): number | null {
  if (!text || typeof text !== 'string') return null;
  
  let cleaned = text.trim();
  
  // Remove quotes and R$
  cleaned = cleaned.replace(/^[\"']|[\"']$/g, "");
  cleaned = cleaned.replace(/R\$\s*/gi, "");
  
  // Check D/C suffix
  const hasCredit = /[cC]\s*$/.test(cleaned);
  cleaned = cleaned.replace(/\s*[dcDC]\s*$/i, "");
  
  // Handle parentheses as negative
  const isNegativeParens = cleaned.includes("(") && cleaned.includes(")");
  cleaned = cleaned.replace(/[()]/g, "");
  cleaned = cleaned.replace(/\s/g, "");
  
  // Must have digits
  if (!/\d/.test(cleaned)) return null;
  
  // Detect format: Brazilian (1.234,56) vs US (1,234.56)
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  
  let num: number;
  
  if (lastComma > lastDot) {
    // Brazilian: 1.234,56 -> comma is decimal
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // US: 1,234.56 -> dot is decimal
    cleaned = cleaned.replace(/,/g, "");
  } else if (lastComma >= 0 && lastDot < 0) {
    // Only comma: 1234,56 -> comma is decimal
    cleaned = cleaned.replace(",", ".");
  }
  // Only dot or no separator: keep as is
  
  num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  
  // Apply sign
  if (isNegativeParens || hasCredit) {
    num = -Math.abs(num);
  }
  
  return num;
}

/**
 * Check if string looks like an account name (not a number or metadata)
 */
function isAccountName(text: string): boolean {
  if (!text || text.length < 2 || text.length > 100) return false;
  
  const t = text.trim();
  
  // Skip metadata
  if (
    t.includes("Empresa:") ||
    t.includes("C.N.P.J.") ||
    t.includes("Período:") ||
    t.includes("Folha:") ||
    t.includes("DEMONSTRAÇÃO") ||
    t.includes("BALANÇO") ||
    t.includes("________") ||
    t.includes("CPF:") ||
    t.includes("CRC") ||
    t.includes("GERENTE") ||
    t.includes("Sistema licenciado") ||
    t.includes("CNPJ") ||
    t.includes("Número livro") ||
    /^\d{2}\.\d{3}\.\d{3}/.test(t) ||
    /^[\d.,\s]+$/.test(t) ||
    t === "[object Object]"
  ) {
    return false;
  }
  
  // Must have letters
  return /[a-zA-ZÀ-ú]/.test(t);
}

/**
 * Check if a string looks like a numeric value (Brazilian format)
 */
function isNumericString(text: string): boolean {
  if (!text) return false;
  const cleaned = text.trim().replace(/^[\"']|[\"']$/g, "").replace(/R\$\s*/gi, "");
  // Brazilian number: 1.234,56 or (1.234,56) or 1234,56 D/C
  return /^[\d.,()R$\s-]+[dcDC]?$/.test(cleaned) && /\d/.test(cleaned);
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
  let formulaRecords = 0;

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

    // FORMULA (0x0006)
    else if (recordType === 0x0006 && recordLen >= 20) {
      const row = data.getUint16(offset + 4, true);
      const col = data.getUint16(offset + 6, true);
      const value = data.getFloat64(offset + 10, true);
      if (Number.isFinite(value) && row < 100000 && col < 256) {
        cells.push({ row, col, value, type: "number" });
        formulaRecords++;
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

  debugLog(`Records: NUMBER=${numRecords}, FORMULA=${formulaRecords}, RK=${rkRecords}, MULRK=${mulrkRecords}, LABELSST=${labelRecords}`);
  return cells;
}

/**
 * Try to extract numbers from SST strings that look like formatted numbers
 */
function extractNumbersFromStrings(strings: string[]): Map<string, number> {
  const numberMap = new Map<string, number>();
  
  for (const str of strings) {
    const text = String(str || "").trim();
    if (isNumericString(text)) {
      const num = parseBrazilianNumberFromString(text);
      if (num !== null) {
        numberMap.set(text, num);
      }
    }
  }
  
  debugLog(`Numbers found in SST strings: ${numberMap.size}`);
  return numberMap;
}

/**
 * Extract cells from legacy XLS (BIFF8).
 * 
 * Strategy:
 * 1. Try BIFF record parsing first (preserves row/col positions)
 * 2. If no numbers found, check if numbers are stored as formatted strings in SST
 * 3. Build rows preserving the original structure
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

  // If we have BIFF records with numbers, return them
  if (numericCells > 0) {
    return cells;
  }

  // STRATEGY 2: Check if numbers are in SST as formatted strings
  debugLog("No BIFF numbers found, checking SST for formatted number strings...");
  
  const numberStringsMap = extractNumbersFromStrings(strings);
  
  if (numberStringsMap.size > 0) {
    debugLog(`Found ${numberStringsMap.size} formatted numbers in SST`);
    
    // Now we need to find the row/col positions of these strings
    // We'll use the LABELSST records we already parsed
    const stringCellsList = cells.filter(c => c.type === "string");
    
    for (const cell of stringCellsList) {
      const text = String(cell.value).trim();
      if (numberStringsMap.has(text)) {
        const numValue = numberStringsMap.get(text)!;
        // Add a numeric cell at same position (different column would be better, but we use col+1)
        cells.push({
          row: cell.row,
          col: cell.col,
          value: numValue,
          type: "number"
        });
      }
    }
    
    const newNumericCount = cells.filter(c => c.type === "number").length;
    debugLog(`After SST number extraction: ${newNumericCount} numeric cells`);
    
    if (newNumericCount > 0) {
      return cells;
    }
  }
  
  // STRATEGY 3: Build rows from account names and try to find their values
  // This is the last resort - we scan strings sequentially
  debugLog("Building rows from sequential SST analysis...");
  
  const accountNames: string[] = [];
  const numericStrings: { value: number; index: number }[] = [];
  
  for (let i = 0; i < strings.length; i++) {
    const text = String(strings[i] || "").trim();
    if (!text) continue;
    
    if (isAccountName(text)) {
      accountNames.push(text);
    } else if (isNumericString(text)) {
      const num = parseBrazilianNumberFromString(text);
      if (num !== null) {
        numericStrings.push({ value: num, index: i });
      }
    }
  }
  
  debugLog(`Account names: ${accountNames.length}, Numeric strings: ${numericStrings.length}`);
  
  if (accountNames.length === 0) {
    debugLog("No account names found");
    return cells;
  }
  
  // Build cells with sequential assignment
  // In PROCONT files, numbers usually follow their account name in SST order
  const newCells: BIFFCell[] = [];
  let numIdx = 0;
  
  for (let rowIdx = 0; rowIdx < accountNames.length; rowIdx++) {
    const name = accountNames[rowIdx];
    
    // Add account name in column 0
    newCells.push({ row: rowIdx, col: 0, value: name, type: "string" });
    
    // Try to find the next numeric value that should belong to this row
    // Simple heuristic: take the next available number
    if (numIdx < numericStrings.length) {
      newCells.push({ 
        row: rowIdx, 
        col: 1, 
        value: numericStrings[numIdx].value, 
        type: "number" 
      });
      numIdx++;
      
      // Check if there's a second value (valor_anterior)
      if (numIdx < numericStrings.length) {
        newCells.push({ 
          row: rowIdx, 
          col: 2, 
          value: numericStrings[numIdx].value, 
          type: "number" 
        });
        numIdx++;
      }
    }
  }
  
  debugLog(`Cells created from SST: ${newCells.length} (${newCells.filter(c => c.type === "number").length} numeric)`);
  
  return newCells;
}
