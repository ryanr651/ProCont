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
 * Scan binary data for IEEE 754 doubles that look like accounting values
 * Returns values in ORDER OF OFFSET (preserves position in file)
 */
function scanForAccountingDoubles(data: Uint8Array): { value: number; offset: number }[] {
  const found: Map<string, { value: number; offset: number }> = new Map();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  
  // Scan every 4 bytes (most values align at 4 bytes)
  for (let i = 0; i + 8 <= data.byteLength; i += 4) {
    try {
      const val = view.getFloat64(i, true); // Little endian
      
      // Filter for reasonable accounting values
      if (!Number.isFinite(val)) continue;
      
      const absVal = Math.abs(val);
      
      // Skip very small values (not accounting amounts)
      if (absVal < 0.01) continue;
      
      // Skip unreasonably large values
      if (absVal > 1e12) continue;
      
      // Skip powers of 2 (likely garbage/metadata)
      const log2 = Math.log2(absVal);
      if (Number.isInteger(log2) && absVal >= 256) continue;
      
      // Skip values that are exact large powers (likely garbage)
      if (absVal >= 1e6 && absVal === Math.round(absVal) && String(absVal).match(/^[1-9]0{6,}$/)) continue;
      
      // Skip if exponent byte pattern looks like text (0x40-0x5A = @-Z)
      const expByte = data[i + 7];
      if (expByte >= 0x40 && expByte <= 0x5A) continue;
      
      // Round to 2 decimal places for deduplication
      const rounded = Math.round(val * 100) / 100;
      const key = rounded.toFixed(2);
      
      // Keep first occurrence (by offset)
      if (!found.has(key)) {
        found.set(key, { value: rounded, offset: i });
      }
      
    } catch {
      continue;
    }
  }
  
  // Return sorted by OFFSET (preserves file order)
  const values = Array.from(found.values());
  values.sort((a, b) => a.offset - b.offset);
  
  return values;
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
 * Extract cells from legacy XLS (BIFF8).
 * 
 * Strategy:
 * 1. Try BIFF record parsing first (preserves row/col positions)
 * 2. If no numbers found, use IEEE double scanner as fallback
 * 3. Associate numbers with account names by position in file
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

  // FALLBACK: No BIFF number records found
  // CRITICAL: Não distribuir IEEE doubles sequencialmente - isso causa valores errados!
  // Retornar APENAS células de texto quando não temos posições reais de números
  debugLog("No BIFF numbers found - returning TEXT-ONLY cells to prevent wrong value associations");
  
  // Extract account names from SST in order
  const accountNames: { name: string; index: number }[] = [];
  for (let i = 0; i < strings.length; i++) {
    const text = String(strings[i] || "").trim();
    if (text && isAccountName(text)) {
      accountNames.push({ name: text, index: i });
    }
  }
  
  debugLog(`Account names found: ${accountNames.length}`);
  debugLog(`First 10 account names: ${accountNames.slice(0, 10).map(a => a.name).join(" | ")}`);
  
  if (accountNames.length === 0) {
    debugLog("No account names found in strings");
    return cells;
  }

  // NOVA ESTRATÉGIA: Procurar números formatados como texto nas strings SST
  // Alguns arquivos XLS antigos armazenam números como strings formatadas
  const formattedNumbers: { value: number; index: number }[] = [];
  for (let i = 0; i < strings.length; i++) {
    const text = String(strings[i] || "").trim();
    if (text && looksLikeFormattedNumber(text)) {
      const parsed = parseBrazilianNumberFromString(text);
      if (parsed !== null && Number.isFinite(parsed)) {
        formattedNumbers.push({ value: parsed, index: i });
      }
    }
  }
  
  debugLog(`Formatted numbers in SST: ${formattedNumbers.length}`);
  if (formattedNumbers.length > 0) {
    debugLog(`Sample formatted: ${formattedNumbers.slice(0, 10).map(n => n.value.toFixed(2)).join(", ")}`);
  }
  
  // Build cells: text only, sem números IEEE (que não têm posição confiável)
  const newCells: BIFFCell[] = [];
  
  for (let rowIdx = 0; rowIdx < accountNames.length; rowIdx++) {
    const name = accountNames[rowIdx].name;
    newCells.push({ row: rowIdx, col: 0, value: name, type: "string" });
  }
  
  // Se encontramos números formatados como strings, tentar associá-los
  // Estratégia: números que aparecem LOGO APÓS um nome de conta na SST
  // pertencem a essa conta
  if (formattedNumbers.length > 0) {
    let lastAccountRow = -1;
    let numbersForCurrentAccount: number[] = [];
    
    for (let i = 0; i < strings.length; i++) {
      const text = String(strings[i] || "").trim();
      
      // É um nome de conta?
      const accountIdx = accountNames.findIndex(a => a.index === i);
      if (accountIdx !== -1) {
        // Salvar números pendentes da conta anterior
        if (lastAccountRow >= 0 && numbersForCurrentAccount.length > 0) {
          for (let c = 0; c < numbersForCurrentAccount.length && c < 2; c++) {
            newCells.push({ 
              row: lastAccountRow, 
              col: c + 1, 
              value: numbersForCurrentAccount[c], 
              type: "number" 
            });
          }
        }
        lastAccountRow = accountIdx;
        numbersForCurrentAccount = [];
      }
      // É um número formatado?
      else if (looksLikeFormattedNumber(text)) {
        const parsed = parseBrazilianNumberFromString(text);
        if (parsed !== null && Number.isFinite(parsed)) {
          numbersForCurrentAccount.push(parsed);
        }
      }
    }
    
    // Não esquecer a última conta
    if (lastAccountRow >= 0 && numbersForCurrentAccount.length > 0) {
      for (let c = 0; c < numbersForCurrentAccount.length && c < 2; c++) {
        newCells.push({ 
          row: lastAccountRow, 
          col: c + 1, 
          value: numbersForCurrentAccount[c], 
          type: "number" 
        });
      }
    }
  }
  
  const numericCount = newCells.filter(c => c.type === "number").length;
  debugLog(`Cells created: ${newCells.length} (${numericCount} numeric from SST formatted strings)`);
  
  // Se não conseguimos associar valores via SST formatado, fazer fallback IEEE
  // (melhor do que quebrar o upload; ainda assim pode não ser perfeito)
  if (numericCount === 0) {
    debugLog("No formatted numeric strings found; using IEEE double scanner fallback (best-effort)");

    const doublesWithOffset = scanForAccountingDoubles(uint8);
    debugLog(`IEEE doubles found: ${doublesWithOffset.length}`);
    if (doublesWithOffset.length > 0) {
      debugLog(`Sample doubles (by offset): ${doublesWithOffset.slice(0, 20).map(d => d.value.toFixed(2)).join(", ")}`);
    }

    // Heurística: normalmente 1 (valor) ou 2 (valor + anterior) por conta
    const ratio = accountNames.length > 0 ? doublesWithOffset.length / accountNames.length : 0;
    const numPerRow = ratio >= 1.5 ? 2 : 1;
    debugLog(`Building ${accountNames.length} rows with ${numPerRow} number(s) each (IEEE fallback)`);

    let numIdx = 0;
    for (let rowIdx = 0; rowIdx < accountNames.length; rowIdx++) {
      for (let c = 0; c < numPerRow && numIdx < doublesWithOffset.length; c++) {
        newCells.push({
          row: rowIdx,
          col: c + 1,
          value: doublesWithOffset[numIdx].value,
          type: "number",
        });
        numIdx++;
      }
    }

    const fallbackCount = newCells.filter(c => c.type === "number").length;
    debugLog(`IEEE fallback numeric cells created: ${fallbackCount}`);
  }
  
  return newCells;
}

/**
 * Check if a string looks like a formatted number (not an account name)
 */
function looksLikeFormattedNumber(text: string): boolean {
  if (!text || text.length < 1 || text.length > 30) return false;
  
  const t = text.trim();
  
  // Patterns for Brazilian formatted numbers:
  // "1.234,56" or "1234,56" or "(1.234,56)" or "1.234,56 D" or "1.234,56 C"
  // Also negative: "-1.234,56"
  
  // Must have digits
  if (!/\d/.test(t)) return false;
  
  // Remove D/C suffix and parentheses for checking
  const cleaned = t.replace(/\s*[DC]\s*$/i, '').replace(/[()]/g, '').trim();
  
  // Should be mostly digits, dots, commas, minus
  const nonNumericChars = cleaned.replace(/[\d.,\-\s]/g, '');
  if (nonNumericChars.length > 0) return false;
  
  // Should have comma as decimal separator (Brazilian format)
  // or be a plain integer
  if (cleaned.includes(',') || /^\-?\d+$/.test(cleaned)) {
    return true;
  }
  
  return false;
}

/**
 * Parse a Brazilian formatted number string
 */
function parseBrazilianNumberFromString(text: string): number | null {
  if (!text) return null;
  
  let t = text.trim();
  let sign = 1;
  
  // Handle D/C suffix (D = Débito = negative in some contexts, C = Crédito = positive)
  if (/\s*D\s*$/i.test(t)) {
    sign = -1;
    t = t.replace(/\s*D\s*$/i, '');
  } else if (/\s*C\s*$/i.test(t)) {
    t = t.replace(/\s*C\s*$/i, '');
  }
  
  // Handle parentheses (negative)
  if (t.startsWith('(') && t.endsWith(')')) {
    sign = -1;
    t = t.slice(1, -1);
  }
  
  // Handle leading minus
  if (t.startsWith('-')) {
    sign = -1;
    t = t.slice(1);
  }
  
  t = t.trim();
  
  // Brazilian format: 1.234,56 -> 1234.56
  // Remove thousand separators (dots) and convert decimal comma to dot
  const normalized = t.replace(/\./g, '').replace(',', '.');
  
  const num = parseFloat(normalized);
  if (!Number.isFinite(num)) return null;
  
  return sign * num;
}
