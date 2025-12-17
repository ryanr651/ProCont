import * as XLSX from "xlsx";
import Papa from "papaparse";
import { BIFFCell, parseBIFF8CellsFromXls } from "./biff8Parser";

// ============= DEBUG LOGGING =============
const DEBUG = true;

function debugLog(message: string, data?: unknown) {
  if (DEBUG) {
    console.log(`[PROCONT Parser] ${message}`, data !== undefined ? data : "");
  }
}

// ============= INTERFACES =============

interface XLSRow {
  cells: string[];
  firstTextCell: { text: string; index: number };
  numericValues: { value: number; raw: string }[];
}

export interface ParsedDREEntry {
  descricao: string;
  valor: number;
  valor_anterior: number | null;
  raw_row: string[];
}

export interface ParsedBalancoEntry {
  conta: string;
  tipo: string;
  valor: number;
  valor_anterior: number | null;
  hierarchy: string;
  raw_row: string[];
}

export interface BalancoMetrics {
  ativoTotal: number;
  ativoCirculante: number;
  ativoNaoCirculante: number;
  passivoTotal: number;
  passivoCirculante: number;
  passivoNaoCirculante: number;
  patrimonioLiquido: number;
}

export interface DREMetrics {
  receitaOperacional: number;
  despesasOperacionais: number;
  lucroBruto: number;
  lucroLiquido: number;
}

export interface BalancoParseResult {
  entries: ParsedBalancoEntry[];
  metrics: BalancoMetrics;
  periodo: string;
  errors: string[];
  parsed: boolean;
}

export interface DREParseResult {
  entries: ParsedDREEntry[];
  periodo: string;
  errors: string[];
  parsed: boolean;
}

// ============= TIPOS CONTÁBEIS PARA BALANÇO =============

type BalancoSectionType = "ATIVO" | "PASSIVO" | "PL";
type BalancoTipoCompleto = 
  | "ATIVO_TOTAL"
  | "ATIVO_CIRCULANTE"
  | "ATIVO_NAO_CIRCULANTE"
  | "PASSIVO_TOTAL"
  | "PASSIVO_CIRCULANTE"
  | "PASSIVO_NAO_CIRCULANTE"
  | "PATRIMONIO_LIQUIDO";

// Tipo usado para variável de estado (exclui totais)
type BalancoTipoSubconta = 
  | "ATIVO_CIRCULANTE"
  | "ATIVO_NAO_CIRCULANTE"
  | "PASSIVO_CIRCULANTE"
  | "PASSIVO_NAO_CIRCULANTE"
  | "PATRIMONIO_LIQUIDO";

// ============= NUMBER PARSING =============

/**
 * Parse Brazilian number format with D/C (Debit/Credit) handling
 * REGRA CONTÁBIL:
 * - ATIVO: D = soma (positivo), C = subtrai (negativo)
 * - PASSIVO/PL: C = soma (positivo), D = subtrai (negativo)
 */
export function parseBrazilianNumber(
  value: string | number | undefined | null,
  context?: BalancoSectionType,
): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return value;

  let cleaned = value.toString().trim();

  // Remove quotes
  cleaned = cleaned.replace(/^[\"']|[\"']$/g, "");

  // Remove R$ and currency symbols
  cleaned = cleaned.replace(/R\$\s*/gi, "");

  // Check for D/C suffix BEFORE removing it
  const hasDebitSuffix = /[dD]\s*$/i.test(cleaned);
  const hasCreditSuffix = /[cC]\s*$/i.test(cleaned);

  // Remove 'd' or 'c' suffix
  cleaned = cleaned.replace(/\s*[dcDC]\s*$/i, "");

  // Handle parentheses as negative: (6.593,46) -> -6593.46
  const isNegativeParens = cleaned.includes("(") && cleaned.includes(")");
  cleaned = cleaned.replace(/[()]/g, "");

  // Remove spaces
  cleaned = cleaned.replace(/\s/g, "");

  // Check if it's a pure numeric string (XLS format: 12345.67)
  const isPureNumeric = /^-?\d+(\.\d+)?$/.test(cleaned);
  
  if (!isPureNumeric) {
    // Brazilian format: dots for thousands, comma for decimal
    // 1.234.567,89 -> 1234567.89
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }

  let num = parseFloat(cleaned);
  if (isNaN(num)) return 0;

  // Apply D/C accounting rules based on context
  if (context && (hasDebitSuffix || hasCreditSuffix)) {
    if (context === "ATIVO") {
      // ATIVO: D = add (positive), C = subtract (negative)
      if (hasCreditSuffix) {
        num = -Math.abs(num);
      } else {
        num = Math.abs(num);
      }
    } else if (context === "PASSIVO" || context === "PL") {
      // PASSIVO/PL: C = add (positive), D = subtract (negative)
      if (hasDebitSuffix) {
        num = -Math.abs(num);
      } else {
        num = Math.abs(num);
      }
    }
  }

  // Handle parentheses negation
  if (isNegativeParens) {
    num = -Math.abs(num);
  }

  return num;
}

/**
 * Simple number parser without D/C context
 */
export function parseSimpleBrazilianNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return value;

  let cleaned = value.toString().trim();
  cleaned = cleaned.replace(/^[\"']|[\"']$/g, "");
  cleaned = cleaned.replace(/R\$\s*/gi, "");
  cleaned = cleaned.replace(/\s*[dcDC]\s*$/i, "");

  const isNegativeParens = cleaned.includes("(") && cleaned.includes(")");
  cleaned = cleaned.replace(/[()]/g, "");
  cleaned = cleaned.replace(/\s/g, "");

  const isPureNumeric = /^-?\d+(\.\d+)?$/.test(cleaned);
  
  if (!isPureNumeric) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }

  let num = parseFloat(cleaned);
  if (isNaN(num)) return 0;

  return isNegativeParens ? -Math.abs(num) : num;
}

/**
 * Check if a cell value looks like a number (with Brazilian format)
 */
function isNumericCell(value: string | number): boolean {
  if (typeof value === "number") return true;
  if (!value || value.toString().trim() === "") return false;

  const cleaned = value.toString().trim().replace(/^[\"']|[\"']$/g, "");
  
  const hasDigits = /\d/.test(cleaned);
  if (!hasDigits) return false;
  
  // Brazilian format: 1.234,56 or 1234,56 with optional D/C suffix
  const isBrazilianPattern = /^[R$\s]*[\d.,()R$\s-]+[dcDC]?$/.test(cleaned);
  
  // Pure numeric (from XLS): 12345.67 or -12345.67
  const isPureNumeric = /^-?\d+(\.\d+)?$/.test(cleaned);

  return isBrazilianPattern || isPureNumeric;
}

/**
 * Check if a cell is a valid text account name
 */
function isTextCell(value: string): boolean {
  if (!value || value.trim() === "") return false;
  const cleaned = value.trim();
  return cleaned.length >= 2 && /[a-zA-ZÀ-ú]/.test(cleaned) && !isNumericCell(cleaned);
}

/**
 * Normalize text for comparison (remove accents, uppercase)
 */
function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// ============= FILE TYPE DETECTION =============

function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

// ============= CSV PARSING =============

async function parseCSVFile(file: File): Promise<string[][]> {
  debugLog("Usando fluxo CSV para:", file.name);

  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      delimiter: ",",
      skipEmptyLines: false,
      complete: (results) => {
        const data = results.data as string[][];
        if (data.length > 0 && data[0].length > 1) {
          resolve(data);
        } else {
          Papa.parse(file, {
            delimiter: ";",
            skipEmptyLines: false,
            complete: (results2) => {
              resolve(results2.data as string[][]);
            },
            error: reject,
          });
        }
      },
      error: reject,
    });
  });
}

// ============= BIFF8 HELPERS (legacy XLS) =============

/**
 * Convert BIFF cells (row/col based) to XLSRow format preserving column positions.
 */
function biffCellsToXLSRows(cells: BIFFCell[]): XLSRow[] {
  if (cells.length === 0) return [];

  // Group by row
  const rowMap = new Map<number, BIFFCell[]>();
  for (const cell of cells) {
    if (!rowMap.has(cell.row)) rowMap.set(cell.row, []);
    rowMap.get(cell.row)!.push(cell);
  }

  const sortedRows = Array.from(rowMap.entries()).sort((a, b) => a[0] - b[0]);
  const rows: XLSRow[] = [];

  for (const [, rowCells] of sortedRows) {
    rowCells.sort((a, b) => a.col - b.col);

    const maxCol = rowCells[rowCells.length - 1]?.col ?? 0;
    const cellsArr: string[] = Array.from({ length: maxCol + 1 }, () => "");

    let firstText: { text: string; index: number } = { text: "", index: -1 };
    const numericValues: { value: number; raw: string }[] = [];

    for (const cell of rowCells) {
      const str = String(cell.value ?? "");
      cellsArr[cell.col] = str;

      if (cell.type === "string" && firstText.index === -1 && isTextCell(str)) {
        firstText = { text: str.trim(), index: cell.col };
      }

      if (cell.type === "number" && typeof cell.value === "number" && Number.isFinite(cell.value)) {
        numericValues.push({ value: cell.value, raw: str });
      }
    }

    numericValues.sort((a, b) => {
      // preserve left-to-right order by matching raw in cells (best-effort)
      const ai = cellsArr.indexOf(a.raw);
      const bi = cellsArr.indexOf(b.raw);
      return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
    });

    const hasContent = firstText.index !== -1 || numericValues.length > 0;
    if (hasContent) {
      rows.push({
        cells: cellsArr,
        firstTextCell: firstText,
        numericValues,
      });
    }
  }

  debugLog("BIFF to XLSRow: converted " + rows.length + " rows");
  return rows;
}


// ============= XLS/XLSX PARSING =============


async function parseXLSFile(file: File): Promise<XLSRow[]> {
  const extension = getFileExtension(file.name);
  debugLog("=== Usando fluxo XLS/XLSX para:", file.name);

  try {
    const buffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    
    let binaryString = "";
    for (let i = 0; i < uint8Array.length; i++) {
      binaryString += String.fromCharCode(uint8Array[i]);
    }

    const readConfigs: XLSX.ParsingOptions[] = [
      { type: "binary", WTF: true, sheetStubs: true, cellStyles: true, bookVBA: true, bookFiles: true },
      { type: "binary", sheetStubs: true, dense: true },
      { type: "binary", raw: true, sheetStubs: true },
      { type: "binary", codepage: 1252 },
      { type: "binary" },
      { type: "array", sheetStubs: true, cellStyles: true },
      { type: "array" },
    ];

    let workbook: XLSX.WorkBook | null = null;
    let sheet: XLSX.WorkSheet | null = null;

    for (const opts of readConfigs) {
      try {
        let inputData: ArrayBuffer | Uint8Array | string = buffer;
        
        if (opts.type === "buffer") {
          inputData = uint8Array;
        } else if (opts.type === "binary") {
          inputData = binaryString;
        }

        workbook = XLSX.read(inputData, opts);
        
        if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
          continue;
        }

        const sheetName = workbook.SheetNames[0];
        
        if (workbook.Sheets[sheetName]) {
          sheet = workbook.Sheets[sheetName];
          debugLog("Sheet encontrada:", sheetName);
          break;
        }

        // Try any available sheet
        const sheetKeys = Object.keys(workbook.Sheets);
        for (const key of sheetKeys) {
          if (workbook.Sheets[key]) {
            sheet = workbook.Sheets[key];
            debugLog("Sheet encontrada por key:", key);
            break;
          }
        }
        
        if (sheet) break;

      } catch (e) {
        debugLog("Tentativa falhou");
      }
    }

    if (!sheet && workbook) {
      // Try BIFF8 manual parsing
      const strings = (workbook as any)?.Strings || [];
      debugLog("Sheet não acessível, tentando BIFF8 manual parser...");
      debugLog("Strings disponíveis:", strings.length);
      
      // Extract string values
      const stringValues: string[] = [];
      for (const str of strings) {
        const text = typeof str === 'object' && (str as any).t ? (str as any).t : String(str || "");
        stringValues.push(text);
      }
      
      // Parse BIFF8 (records) to extract numbers + text positions
      const biffCells = parseBIFF8CellsFromXls(buffer, stringValues);
      if (biffCells.length > 0) {
        const biffRows = biffCellsToXLSRows(biffCells);
        if (biffRows.length > 0) {
          debugLog("BIFF8 manual parser SUCCESS: " + biffRows.length + " rows");
          return biffRows;
        }
      }
      
      // Fallback to strings-only
      if (stringValues.length > 0) {
        const rows = reconstructRowsFromStrings(stringValues);
        if (rows.length > 0) {
          return rows;
        }
      }
      return [];
    }

    if (!sheet) {
      return [];
    }

    // Extract data from sheet
    const jsonData = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: false,
    }) as unknown[][];

    debugLog("Linhas obtidas:", jsonData?.length || 0);

    if (jsonData && jsonData.length > 0) {
      const rowsFromSheet = processXLSRawRows(jsonData);
      const totalNumeric = rowsFromSheet.reduce((acc, r) => acc + (r.numericValues?.length || 0), 0);

      // Caso típico do seu bug: XLS antigo retorna texto mas 0 números
      if (extension === "xls" && totalNumeric === 0 && workbook) {
        debugLog("XLS retornou 0 células numéricas via sheet_to_json; tentando BIFF8...");

        const strings = (workbook as any)?.Strings || [];
        const stringValues: string[] = [];
        for (const str of strings) {
          const text = typeof str === "object" && (str as any).t ? (str as any).t : String(str || "");
          stringValues.push(text);
        }

        const biffCells = parseBIFF8CellsFromXls(buffer, stringValues);
        const biffRows = biffCellsToXLSRows(biffCells);
        if (biffRows.length > 0) {
          debugLog("BIFF8 fallback SUCCESS após sheet_to_json vazio: " + biffRows.length + " rows");
          return biffRows;
        }
      }

      return rowsFromSheet;
    }

    // Cell-by-cell fallback
    const sheetRef = sheet["!ref"];
    if (!sheetRef) return [];

    const range = XLSX.utils.decode_range(sheetRef);
    const rows: XLSRow[] = [];

    for (let rowIdx = range.s.r; rowIdx <= range.e.r; rowIdx++) {
      const cells: string[] = [];
      let firstText = { text: "", index: -1 };
      const numericValues: { value: number; raw: string }[] = [];

      for (let colIdx = range.s.c; colIdx <= range.e.c; colIdx++) {
        const addr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
        const cell = sheet[addr];
        
        let cellValue = "";
        let numericValue: number | null = null;

        if (cell) {
          if (typeof cell.v === "number") {
            numericValue = cell.v;
            cellValue = String(cell.v);
          } else if (cell.v !== undefined && cell.v !== null) {
            cellValue = String(cell.v).trim();
          }
        }

        cells.push(cellValue);

        if (firstText.index === -1 && isTextCell(cellValue)) {
          firstText = { text: cellValue.trim(), index: colIdx };
        }

        if (numericValue !== null) {
          numericValues.push({ value: numericValue, raw: cellValue });
        } else if (cellValue && isNumericCell(cellValue)) {
          numericValues.push({ value: parseSimpleBrazilianNumber(cellValue), raw: cellValue });
        }
      }

      if (cells.some(c => c.trim() !== "") || numericValues.length > 0) {
        rows.push({ cells, firstTextCell: firstText, numericValues });
      }
    }

    return rows;
  } catch (error) {
    debugLog("ERRO ao processar XLS:", error);
    return [];
  }
}

function reconstructRowsFromStrings(strings: string[]): XLSRow[] {
  const rows: XLSRow[] = [];
  
  for (const str of strings) {
    const text = String(str || "");
    if (!text || text.trim() === "") continue;
    
    const trimmed = text.trim();
    
    if (isTextCell(trimmed)) {
      rows.push({
        cells: [trimmed],
        firstTextCell: { text: trimmed, index: 0 },
        numericValues: [],
      });
    }
  }
  
  return rows;
}

function processXLSRawRows(rawRows: unknown[][]): XLSRow[] {
  const rows: XLSRow[] = [];

  for (const rowData of rawRows) {
    if (!Array.isArray(rowData)) continue;

    const hasContent = rowData.some(cell => 
      (typeof cell === 'string' && cell.trim().length > 0) ||
      typeof cell === 'number'
    );
    if (!hasContent) continue;

    const cells: string[] = [];
    let firstText = { text: "", index: -1 };
    const numericValues: { value: number; raw: string }[] = [];

    for (let colIdx = 0; colIdx < rowData.length; colIdx++) {
      const rawCell = rowData[colIdx];
      
      if (typeof rawCell === 'number') {
        const cellValue = String(rawCell);
        cells.push(cellValue);
        numericValues.push({ value: rawCell, raw: cellValue });
        continue;
      }

      const cellValue = typeof rawCell === 'string' ? rawCell.trim() : String(rawCell ?? "");
      cells.push(cellValue);

      if (firstText.index === -1 && isTextCell(cellValue)) {
        firstText = { text: cellValue.trim(), index: colIdx };
      }

      if (cellValue && isNumericCell(cellValue)) {
        numericValues.push({ value: parseSimpleBrazilianNumber(cellValue), raw: cellValue });
      }
    }

    rows.push({
      cells,
      firstTextCell: firstText,
      numericValues,
    });
  }

  return rows;
}

// ============= SAFE ROW ACCESS HELPERS =============

function safeGetFirstText(row: XLSRow | undefined | null): { text: string; index: number } {
  if (!row) return { text: "", index: -1 };
  if (row.firstTextCell?.text) return row.firstTextCell;
  
  if (row.cells) {
    for (let i = 0; i < row.cells.length; i++) {
      const cell = row.cells[i];
      if (typeof cell === "string" && cell.trim() !== "" && isTextCell(cell)) {
        return { text: cell.trim(), index: i };
      }
    }
  }
  
  return { text: "", index: -1 };
}

function safeGetNumericValues(row: XLSRow | undefined | null): { value: number; raw: string }[] {
  if (!row) return [];
  if (row.numericValues?.length) return row.numericValues;
  
  const values: { value: number; raw: string }[] = [];
  if (row.cells) {
    for (const cell of row.cells) {
      if (typeof cell === "string" && isNumericCell(cell)) {
        values.push({ value: parseSimpleBrazilianNumber(cell), raw: cell });
      }
    }
  }
  
  return values;
}

function safeGetCells(row: XLSRow | undefined | null): string[] {
  return row?.cells || [];
}

// ============= BALANÇO PATRIMONIAL PARSING - REGRAS CONTÁBEIS =============

/**
 * Parse Balanço Patrimonial com regras contábeis corretas:
 * 1. Início a partir de "ATIVO"
 * 2. Estado de leitura progressivo
 * 3. Classificação correta de tipos
 * 4. Não recalcular totais - usar valor da linha
 * 5. Tratamento correto de D/C
 */
function parseBalancoFromXLS(rows: XLSRow[], filename: string): BalancoParseResult {
  debugLog("=== Iniciando parseBalancoFromXLS (REGRAS CONTÁBEIS) ===");
  debugLog("Total de linhas:", rows?.length || 0);

  const entries: ParsedBalancoEntry[] = [];
  const errors: string[] = [];
  const periodo = extractPeriodFromRows(rows?.map(r => safeGetCells(r)) || [], filename);

  const metrics: BalancoMetrics = {
    ativoTotal: 0,
    ativoCirculante: 0,
    ativoNaoCirculante: 0,
    passivoTotal: 0,
    passivoCirculante: 0,
    passivoNaoCirculante: 0,
    patrimonioLiquido: 0,
  };

  if (!rows || rows.length === 0) {
    return { entries, metrics, periodo, errors, parsed: false };
  }

  // REGRA 2: Encontrar "ATIVO" para início dos dados
  let startRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const { text } = safeGetFirstText(rows[i]);
    if (normalizeText(text) === "ATIVO") {
      startRow = i;
      debugLog("INÍCIO DOS DADOS - ATIVO encontrado na linha:", i);
      break;
    }
  }

  if (startRow === -1) {
    debugLog("ATIVO não encontrado, usando fallback");
    startRow = 0;
  }

  // REGRA 2: Estado interno de leitura
  let currentSection: BalancoSectionType = "ATIVO";
  let currentTipo: BalancoTipoSubconta = "ATIVO_CIRCULANTE";
  let justSawAtivo = false;
  let justSawPassivo = false;
  let foundFirstCirculante = false;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const { text: conta, index: textIndex } = safeGetFirstText(row);
    
    if (!conta || conta.length < 2) continue;

    const normalConta = normalizeText(conta);
    
    // Skip headers
    if (normalConta.includes("DESCRICAO") || normalConta === "CONTA" || 
        normalConta.includes("EMPRESA") || normalConta.includes("CNPJ")) {
      continue;
    }

    // Get numeric values with D/C context
    const rawValues = safeGetNumericValues(row);
    
    // REGRA 5: Usar parseBrazilianNumber com contexto para D/C
    const valor = rawValues.length > 0 
      ? parseBrazilianNumber(rawValues[0].raw, currentSection) 
      : 0;
    const valorAnterior = rawValues.length > 1 
      ? parseBrazilianNumber(rawValues[1].raw, currentSection) 
      : null;

    // REGRA 3: Classificação por contexto
    let tipoEntry: BalancoTipoCompleto = currentTipo;

    // === DETECÇÃO DE SEÇÃO E CLASSIFICAÇÃO ===
    
    if (normalConta === "ATIVO") {
      // ATIVO total - USAR VALOR DIRETO (REGRA 6)
      currentSection = "ATIVO";
      currentTipo = "ATIVO_CIRCULANTE";
      tipoEntry = "ATIVO_TOTAL";
      justSawAtivo = true;
      justSawPassivo = false;
      foundFirstCirculante = false;
      
      if (valor !== 0) {
        metrics.ativoTotal = Math.abs(valor);
        debugLog("ATIVO TOTAL (do arquivo):", metrics.ativoTotal);
      }
    }
    else if (normalConta === "CIRCULANTE") {
      if (justSawAtivo && !foundFirstCirculante) {
        // Primeiro CIRCULANTE após ATIVO = ATIVO CIRCULANTE
        currentTipo = "ATIVO_CIRCULANTE";
        tipoEntry = "ATIVO_CIRCULANTE";
        foundFirstCirculante = true;
        justSawAtivo = false;
        
        if (valor !== 0) {
          metrics.ativoCirculante = Math.abs(valor);
          debugLog("ATIVO CIRCULANTE (do arquivo):", metrics.ativoCirculante);
        }
      } else if (justSawPassivo) {
        // CIRCULANTE após PASSIVO = PASSIVO CIRCULANTE
        currentTipo = "PASSIVO_CIRCULANTE";
        tipoEntry = "PASSIVO_CIRCULANTE";
        justSawPassivo = false;
        
        if (valor !== 0) {
          metrics.passivoCirculante = Math.abs(valor);
          debugLog("PASSIVO CIRCULANTE (do arquivo):", metrics.passivoCirculante);
        }
      }
    }
    else if (normalConta === "ATIVO NAO CIRCULANTE" || 
             normalConta === "NAO CIRCULANTE" && currentSection === "ATIVO") {
      currentTipo = "ATIVO_NAO_CIRCULANTE";
      tipoEntry = "ATIVO_NAO_CIRCULANTE";
      justSawAtivo = false;
      
      if (valor !== 0) {
        metrics.ativoNaoCirculante = Math.abs(valor);
        debugLog("ATIVO NAO CIRCULANTE (do arquivo):", metrics.ativoNaoCirculante);
      }
    }
    else if (normalConta === "PASSIVO") {
      currentSection = "PASSIVO";
      currentTipo = "PASSIVO_CIRCULANTE";
      tipoEntry = "PASSIVO_TOTAL";
      justSawPassivo = true;
      justSawAtivo = false;
      foundFirstCirculante = false;
      
      if (valor !== 0) {
        metrics.passivoTotal = Math.abs(valor);
        debugLog("PASSIVO TOTAL (do arquivo):", metrics.passivoTotal);
      }
    }
    else if (normalConta === "PASSIVO NAO CIRCULANTE" ||
             normalConta === "NAO CIRCULANTE" && currentSection === "PASSIVO") {
      currentTipo = "PASSIVO_NAO_CIRCULANTE";
      tipoEntry = "PASSIVO_NAO_CIRCULANTE";
      justSawPassivo = false;
      
      if (valor !== 0) {
        metrics.passivoNaoCirculante = Math.abs(valor);
        debugLog("PASSIVO NAO CIRCULANTE (do arquivo):", metrics.passivoNaoCirculante);
      }
    }
    else if (normalConta === "PATRIMONIO LIQUIDO" || normalConta.includes("PATRIMONIO LIQUIDO")) {
      currentSection = "PL";
      currentTipo = "PATRIMONIO_LIQUIDO";
      tipoEntry = "PATRIMONIO_LIQUIDO";
      justSawAtivo = false;
      justSawPassivo = false;
      
      if (valor !== 0) {
        metrics.patrimonioLiquido = Math.abs(valor);
        debugLog("PATRIMONIO LIQUIDO (do arquivo):", metrics.patrimonioLiquido);
      }
    }
    else {
      // Subconta - herda o tipo da seção atual
      tipoEntry = currentTipo;
      justSawAtivo = false;
      justSawPassivo = false;
    }

    // Criar entry se tiver valor
    if (valor !== 0 || (valorAnterior !== null && valorAnterior !== 0)) {
      const level = textIndex >= 0 ? textIndex : 0;
      
      entries.push({
        conta,
        tipo: tipoEntry,
        valor: Math.abs(valor),
        valor_anterior: valorAnterior !== null ? Math.abs(valorAnterior) : null,
        hierarchy: conta,
        raw_row: safeGetCells(row),
      });
      
      debugLog(`Entry: ${conta} | Tipo: ${tipoEntry} | Valor: ${Math.abs(valor)}`);
    }
  }

  debugLog("Total entries Balanço:", entries.length);
  debugLog("Metrics finais:", metrics);

  const hasAnyNumeric = rows.some(r => safeGetNumericValues(r).length > 0);
  const parsed = rows.length > 0 && (hasAnyNumeric || entries.length > 0);

  return { entries, metrics, periodo, errors, parsed };
}

/**
 * Parse Balanço from CSV
 */
function parseBalancoFromCSV(rows: string[][], filename: string): BalancoParseResult {
  debugLog("=== parseBalancoFromCSV ===");

  const entries: ParsedBalancoEntry[] = [];
  const errors: string[] = [];
  const periodo = extractPeriodFromRows(rows, filename);

  const metrics: BalancoMetrics = {
    ativoTotal: 0,
    ativoCirculante: 0,
    ativoNaoCirculante: 0,
    passivoTotal: 0,
    passivoCirculante: 0,
    passivoNaoCirculante: 0,
    patrimonioLiquido: 0,
  };

  // Find ATIVO
  let startRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const firstText = findFirstTextInRow(rows[i] || []);
    if (normalizeText(firstText) === "ATIVO") {
      startRow = i;
      break;
    }
  }

  if (startRow === -1) startRow = Math.min(8, rows.length - 1);

  let currentSection: BalancoSectionType = "ATIVO";
  let currentTipo: BalancoTipoSubconta = "ATIVO_CIRCULANTE";
  let justSawAtivo = false;
  let justSawPassivo = false;
  let foundFirstCirculante = false;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const conta = findFirstTextInRow(row);
    if (!conta || conta.length < 2) continue;

    const normalConta = normalizeText(conta);
    if (normalConta.includes("DESCRICAO") || normalConta === "CONTA") continue;

    const numericValues = findNumericValuesInRow(row);
    const valor = numericValues.length > 0 ? parseBrazilianNumber(numericValues[0], currentSection) : 0;
    const valorAnterior = numericValues.length > 1 ? parseBrazilianNumber(numericValues[1], currentSection) : null;

    let tipoEntry: BalancoTipoCompleto = currentTipo;

    if (normalConta === "ATIVO") {
      currentSection = "ATIVO";
      currentTipo = "ATIVO_CIRCULANTE";
      tipoEntry = "ATIVO_TOTAL";
      justSawAtivo = true;
      if (valor !== 0) metrics.ativoTotal = Math.abs(valor);
    }
    else if (normalConta === "CIRCULANTE" && justSawAtivo && !foundFirstCirculante) {
      currentTipo = "ATIVO_CIRCULANTE";
      tipoEntry = "ATIVO_CIRCULANTE";
      foundFirstCirculante = true;
      justSawAtivo = false;
      if (valor !== 0) metrics.ativoCirculante = Math.abs(valor);
    }
    else if (normalConta === "CIRCULANTE" && justSawPassivo) {
      currentTipo = "PASSIVO_CIRCULANTE";
      tipoEntry = "PASSIVO_CIRCULANTE";
      justSawPassivo = false;
      if (valor !== 0) metrics.passivoCirculante = Math.abs(valor);
    }
    else if (normalConta === "ATIVO NAO CIRCULANTE" || (normalConta === "NAO CIRCULANTE" && currentSection === "ATIVO")) {
      currentTipo = "ATIVO_NAO_CIRCULANTE";
      tipoEntry = "ATIVO_NAO_CIRCULANTE";
      justSawAtivo = false;
      if (valor !== 0) metrics.ativoNaoCirculante = Math.abs(valor);
    }
    else if (normalConta === "PASSIVO") {
      currentSection = "PASSIVO";
      currentTipo = "PASSIVO_CIRCULANTE";
      tipoEntry = "PASSIVO_TOTAL";
      justSawPassivo = true;
      justSawAtivo = false;
      foundFirstCirculante = false;
      if (valor !== 0) metrics.passivoTotal = Math.abs(valor);
    }
    else if (normalConta === "PASSIVO NAO CIRCULANTE" || (normalConta === "NAO CIRCULANTE" && currentSection === "PASSIVO")) {
      currentTipo = "PASSIVO_NAO_CIRCULANTE";
      tipoEntry = "PASSIVO_NAO_CIRCULANTE";
      justSawPassivo = false;
      if (valor !== 0) metrics.passivoNaoCirculante = Math.abs(valor);
    }
    else if (normalConta.includes("PATRIMONIO LIQUIDO")) {
      currentSection = "PL";
      currentTipo = "PATRIMONIO_LIQUIDO";
      tipoEntry = "PATRIMONIO_LIQUIDO";
      if (valor !== 0) metrics.patrimonioLiquido = Math.abs(valor);
    }
    else {
      tipoEntry = currentTipo;
      justSawAtivo = false;
      justSawPassivo = false;
    }

    if (valor !== 0 || (valorAnterior !== null && valorAnterior !== 0)) {
      entries.push({
        conta,
        tipo: tipoEntry,
        valor: Math.abs(valor),
        valor_anterior: valorAnterior !== null ? Math.abs(valorAnterior) : null,
        hierarchy: conta,
        raw_row: row.map(String),
      });
    }
  }

  return { entries, metrics, periodo, errors, parsed: true };
}

// ============= DRE PARSING - REGRAS CONTÁBEIS =============

/**
 * Parse DRE com regras contábeis:
 * 1. Início após "DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO EM"
 * 2. Não recalcular totais - usar valores do arquivo
 * 3. Preservar estrutura hierárquica
 */
function parseDREFromXLS(rows: XLSRow[], filename: string): DREParseResult {
  debugLog("=== Iniciando parseDREFromXLS (REGRAS CONTÁBEIS) ===");
  debugLog("Total de linhas:", rows?.length || 0);

  const entries: ParsedDREEntry[] = [];
  const errors: string[] = [];
  const periodo = extractPeriodFromRows(rows?.map(r => safeGetCells(r)) || [], filename);

  if (!rows || rows.length === 0) {
    return { entries, periodo, errors, parsed: false };
  }

  // REGRA 7: Encontrar header DRE
  let startRow = 0;
  let found = false;

  for (let i = 0; i < rows.length && i < 30; i++) {
    const cells = safeGetCells(rows[i]);
    const rowText = normalizeText(cells.join(" "));
    
    // Procurar "DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO EM"
    if (rowText.includes("DEMONSTRACAO DO RESULTADO DO EXERCICIO") || 
        rowText.includes("DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO")) {
      startRow = i + 1;
      found = true;
      debugLog("Header DRE encontrado na linha:", i);
      break;
    }
  }

  // Fallback: procurar "RECEITA"
  if (!found) {
    for (let i = 0; i < rows.length && i < 30; i++) {
      const { text } = safeGetFirstText(rows[i]);
      if (text && normalizeText(text).includes("RECEITA")) {
        startRow = i;
        found = true;
        debugLog("Fallback: RECEITA encontrada na linha:", i);
        break;
      }
    }
  }

  if (!found) {
    startRow = Math.min(5, rows.length - 1);
  }

  // Processar linhas DRE
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const { text: descricao } = safeGetFirstText(row);

    if (!descricao || descricao.length < 2) continue;

    const normalDesc = normalizeText(descricao);
    
    // Skip headers e linhas de assinatura
    if (normalDesc.includes("DESCRICAO") || 
        normalDesc === "CONTA" ||
        normalDesc.includes("CPF") ||
        normalDesc.includes("CRC") ||
        normalDesc.includes("GERENTE") ||
        normalDesc.includes("________")) {
      continue;
    }

    const numericValues = safeGetNumericValues(row);
    
    // Linhas sem valor são títulos de grupo (REGRA 8)
    if (numericValues.length === 0) {
      debugLog(`Título de grupo (sem valor): ${descricao}`);
      continue;
    }

    // REGRA: Usar valor direto do arquivo, não recalcular
    const valor = numericValues[0]?.value || 0;
    const valorAnterior = numericValues.length > 1 ? numericValues[1].value : null;

    entries.push({
      descricao,
      valor,
      valor_anterior: valorAnterior,
      raw_row: safeGetCells(row),
    });
    
    debugLog(`DRE Entry: ${descricao} | Valor: ${valor}`);
  }

  debugLog("Total entries DRE:", entries.length);

  const hasAnyNumeric = rows.some(r => safeGetNumericValues(r).length > 0);
  const parsed = rows.length > 0 && (hasAnyNumeric || entries.length > 0);

  return { entries, periodo, errors, parsed };
}

/**
 * Parse DRE from CSV
 */
function parseDREFromCSV(rows: string[][], filename: string): DREParseResult {
  debugLog("=== parseDREFromCSV ===");

  const entries: ParsedDREEntry[] = [];
  const errors: string[] = [];
  const periodo = extractPeriodFromRows(rows, filename);

  let startRow = 0;
  let found = false;

  for (let i = 0; i < rows.length && i < 30; i++) {
    const rowText = normalizeText(rows[i]?.join(" ") || "");
    if (rowText.includes("DEMONSTRACAO DO RESULTADO") || rowText.includes("DEMONSTRAÇÃO DO RESULTADO")) {
      startRow = i + 1;
      found = true;
      break;
    }
  }

  if (!found) {
    for (let i = 0; i < rows.length && i < 30; i++) {
      const firstText = findFirstTextInRow(rows[i] || []);
      if (normalizeText(firstText).includes("RECEITA")) {
        startRow = i;
        found = true;
        break;
      }
    }
  }

  if (!found) startRow = Math.min(7, rows.length - 1);

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const descricao = findFirstTextInRow(row);
    if (!descricao || descricao.length < 2) continue;

    const normalDesc = normalizeText(descricao);
    if (normalDesc.includes("DESCRICAO") || normalDesc === "CONTA") continue;

    const numericValues = findNumericValuesInRow(row);
    if (numericValues.length === 0) continue;

    const valor = parseSimpleBrazilianNumber(numericValues[0]);
    const valorAnterior = numericValues.length > 1 ? parseSimpleBrazilianNumber(numericValues[1]) : null;

    entries.push({
      descricao,
      valor,
      valor_anterior: valorAnterior,
      raw_row: row.map(String),
    });
  }

  return { entries, periodo, errors, parsed: true };
}

// ============= HELPER FUNCTIONS =============

function findFirstTextInRow(row: string[]): string {
  for (const cell of row) {
    const cleaned = String(cell || "").trim();
    if (isTextCell(cleaned)) {
      return cleaned;
    }
  }
  return "";
}

function findNumericValuesInRow(row: string[]): string[] {
  const values: string[] = [];
  for (const cell of row) {
    const cleaned = String(cell || "").trim();
    if (isNumericCell(cleaned)) {
      values.push(cleaned);
    }
  }
  return values;
}

function extractPeriodFromRows(rows: string[][], filename: string): string {
  const dateMatch = filename.match(/(\d{2}\/\d{2}\/\d{4}|\d{4})/);
  if (dateMatch) return dateMatch[1];

  for (const row of rows.slice(0, 15)) {
    const text = row.join(" ");
    const match = text.match(/(\d{2}\/\d{2}\/\d{4}|\d{4})/);
    if (match) return match[1];
  }

  return new Date().getFullYear().toString();
}

// ============= MAIN EXPORT FUNCTIONS =============

export async function parseFileToArray(file: File): Promise<string[][]> {
  const extension = getFileExtension(file.name);

  if (extension === "csv") {
    return parseCSVFile(file);
  } else if (extension === "xls" || extension === "xlsx") {
    const xlsRows = await parseXLSFile(file);
    return xlsRows.map((r) => r.cells);
  }

  throw new Error("Formato não suportado. Use CSV, XLS ou XLSX.");
}

export async function parseDREFileAuto(file: File): Promise<DREParseResult> {
  const extension = getFileExtension(file.name);
  debugLog("DRE - Tipo de arquivo:", extension);

  if (extension === "csv") {
    const rows = await parseCSVFile(file);
    return parseDREFromCSV(rows, file.name);
  } else if (extension === "xls" || extension === "xlsx") {
    const xlsRows = await parseXLSFile(file);
    return parseDREFromXLS(xlsRows, file.name);
  }

  throw new Error("Formato não suportado. Use CSV, XLS ou XLSX.");
}

export async function parseBalancoFileAuto(file: File): Promise<BalancoParseResult> {
  const extension = getFileExtension(file.name);
  debugLog("Balanço - Tipo de arquivo:", extension);

  if (extension === "csv") {
    const rows = await parseCSVFile(file);
    return parseBalancoFromCSV(rows, file.name);
  } else if (extension === "xls" || extension === "xlsx") {
    const xlsRows = await parseXLSFile(file);
    return parseBalancoFromXLS(xlsRows, file.name);
  }

  throw new Error("Formato não suportado. Use CSV, XLS ou XLSX.");
}

// Backward compatibility
export function parseDREFile(rows: string[][], filename: string): DREParseResult {
  return parseDREFromCSV(rows, filename);
}

export function parseBalancoFile(rows: string[][], filename: string): BalancoParseResult {
  return parseBalancoFromCSV(rows, filename);
}

/**
 * Calculate DRE metrics from entries
 * REGRA: Usar valores do arquivo, não recalcular
 */
export function calculateDREMetrics(entries: ParsedDREEntry[]): DREMetrics {
  const metrics: DREMetrics = {
    receitaOperacional: 0,
    despesasOperacionais: 0,
    lucroBruto: 0,
    lucroLiquido: 0,
  };

  for (const entry of entries) {
    const normalDesc = normalizeText(entry.descricao);
    const valor = Math.abs(entry.valor);

    // Usar valores diretos das linhas de total
    if (normalDesc.includes("RECEITA OPERACIONAL") || normalDesc === "RECEITA LIQUIDA") {
      metrics.receitaOperacional = valor;
    }
    else if (normalDesc === "LUCRO BRUTO" || normalDesc.includes("LUCRO BRUTO")) {
      metrics.lucroBruto = valor;
    }
    else if (normalDesc.includes("LUCRO LIQUIDO") || 
             normalDesc.includes("RESULTADO DO EXERCICIO") ||
             normalDesc.includes("LUCRO LIQUIDO DO EXERCICIO")) {
      metrics.lucroLiquido = valor;
    }
    else if (normalDesc.includes("DESPESAS OPERACIONAIS") || normalDesc === "TOTAL DESPESAS") {
      metrics.despesasOperacionais = valor;
    }
  }

  return metrics;
}

export function extractPeriod(filename: string, rows: string[][]): string {
  return extractPeriodFromRows(rows, filename);
}
