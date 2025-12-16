import * as XLSX from 'xlsx';
import Papa from 'papaparse';

// ============= DEBUG LOGGING =============
const DEBUG = true;

function debugLog(message: string, data?: unknown) {
  if (DEBUG) {
    console.log(`[PROCONT Parser] ${message}`, data !== undefined ? data : '');
  }
}

// ============= NUMBER PARSING =============

/**
 * Parse Brazilian number format with D/C (Debit/Credit) handling
 */
export function parseBrazilianNumber(
  value: string | number | undefined | null,
  context?: 'ATIVO' | 'PASSIVO' | 'PL'
): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  
  let cleaned = value.toString().trim();
  
  // Remove quotes
  cleaned = cleaned.replace(/^[\"']|[\"']$/g, '');
  
  // Remove R$ and currency symbols
  cleaned = cleaned.replace(/R\$\s*/gi, '');
  
  // Check for D/C suffix BEFORE removing it
  const hasDebitSuffix = /[dD]$/i.test(cleaned);
  const hasCreditSuffix = /[cC]$/i.test(cleaned);
  
  // Remove 'd' or 'c' suffix
  cleaned = cleaned.replace(/[dcDC]$/i, '');
  
  // Handle parentheses as negative: (6.593,46) -> -6593.46
  const isNegativeParens = cleaned.includes('(') && cleaned.includes(')');
  cleaned = cleaned.replace(/[()]/g, '');
  
  // Remove spaces
  cleaned = cleaned.replace(/\s/g, '');
  
  // Brazilian format: dots for thousands, comma for decimal
  // 1.234.567,89 -> 1234567.89
  cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  
  let num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  
  // Apply D/C accounting rules based on context
  if (context && (hasDebitSuffix || hasCreditSuffix)) {
    if (context === 'ATIVO') {
      // ATIVO: D = add (positive), C = subtract (negative)
      if (hasCreditSuffix) {
        num = -Math.abs(num);
      } else {
        num = Math.abs(num);
      }
    } else if (context === 'PASSIVO' || context === 'PL') {
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
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  
  let cleaned = value.toString().trim();
  cleaned = cleaned.replace(/^[\"']|[\"']$/g, '');
  cleaned = cleaned.replace(/R\$\s*/gi, '');
  cleaned = cleaned.replace(/[dcDC]$/i, '');
  
  const isNegativeParens = cleaned.includes('(') && cleaned.includes(')');
  cleaned = cleaned.replace(/[()]/g, '');
  cleaned = cleaned.replace(/\s/g, '');
  cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  
  let num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  
  return isNegativeParens ? -Math.abs(num) : num;
}

/**
 * Check if a cell value looks like a number (with Brazilian format)
 */
function isNumericCell(value: string): boolean {
  if (!value || value.trim() === '') return false;
  const cleaned = value.trim().replace(/^[\"']|[\"']$/g, '');
  // Match Brazilian number patterns: digits, dots, commas, optional D/C suffix
  // Examples: "1.234,56", "1234,56D", "(1.234,56)", "R$ 1.234,56"
  const hasDigits = /\d/.test(cleaned);
  const isNumericPattern = /^[R$\s]*[\d.,()R$\s-]+[dcDC]?$/.test(cleaned);
  return hasDigits && isNumericPattern;
}

/**
 * Check if a cell is a valid text account name
 */
function isTextCell(value: string): boolean {
  if (!value || value.trim() === '') return false;
  const cleaned = value.trim();
  // Must have at least 2 chars and contain letters
  return cleaned.length >= 2 && /[a-zA-ZÀ-ú]/.test(cleaned) && !isNumericCell(cleaned);
}

/**
 * Normalize text for comparison (remove accents, uppercase)
 */
function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// ============= INTERFACES =============

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

// ============= FILE TYPE DETECTION =============

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

// ============= CSV PARSING (Separate Flow) =============

async function parseCSVFile(file: File): Promise<string[][]> {
  debugLog('Usando fluxo CSV para:', file.name);
  
  return new Promise((resolve, reject) => {
    // First try with comma delimiter
    Papa.parse(file, {
      delimiter: ',',
      skipEmptyLines: false,
      complete: (results) => {
        const data = results.data as string[][];
        debugLog('CSV parsing - linhas lidas:', data.length);
        if (data.length > 0 && data[0].length > 1) {
          resolve(data);
        } else {
          // Try semicolon as fallback
          Papa.parse(file, {
            delimiter: ';',
            skipEmptyLines: false,
            complete: (results2) => {
              const data2 = results2.data as string[][];
              debugLog('CSV parsing (semicolon) - linhas lidas:', data2.length);
              resolve(data2);
            },
            error: reject
          });
        }
      },
      error: reject
    });
  });
}

// ============= XLS/XLSX PARSING (Completely Separate Flow) =============

interface XLSRow {
  cells: string[];
  firstTextCell: { text: string; index: number };
  numericValues: { value: number; raw: string }[];
}

/**
 * Parse XLS/XLSX file - reads cell by cell, NOT using CSV logic
 * ALWAYS returns a valid array, never undefined
 */
async function parseXLSFile(file: File): Promise<XLSRow[]> {
  const extension = getFileExtension(file.name);
  debugLog('Usando fluxo XLS/XLSX para:', file.name);
  debugLog('Extensão detectada:', extension);
  
  try {
    const buffer = await file.arrayBuffer();
    
    // Try multiple reading options for better compatibility with old XLS files
    let workbook: XLSX.WorkBook | null = null;
    const readOptions: XLSX.ParsingOptions[] = [
      { type: 'array', raw: false },
      { type: 'array', raw: false, codepage: 1252 }, // Windows Latin-1
      { type: 'array', raw: true },
      { type: 'array' }
    ];
    
    for (const opts of readOptions) {
      try {
        workbook = XLSX.read(buffer, opts);
        if (workbook && workbook.SheetNames && workbook.SheetNames.length > 0) {
          debugLog('Workbook lido com opções:', opts);
          break;
        }
      } catch (e) {
        debugLog('Tentativa falhou com opções: ' + JSON.stringify(opts));
      }
    }
    
    // Validate workbook has sheets
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      debugLog('ERRO: Workbook não contém abas');
      return [];
    }
    
    // Always start with first sheet name
    const desiredSheetName = workbook.SheetNames[0];
    debugLog('Primeira aba:', desiredSheetName);
    
    // Log all available sheet keys for debugging
    const sheetsObj = workbook.Sheets;
    const sheetKeys = sheetsObj ? Object.keys(sheetsObj) : [];
    debugLog('Chaves disponíveis em Sheets:', sheetKeys);

    // Defensive sheet access - try multiple approaches
    let sheet: XLSX.WorkSheet | undefined;
    
    // 1. Direct access
    if (sheetsObj && sheetsObj[desiredSheetName]) {
      sheet = sheetsObj[desiredSheetName];
      debugLog('Sheet encontrada por acesso direto');
    }
    
    // 2. Try with normalized text comparison
    if (!sheet && sheetsObj) {
      const desiredNorm = normalizeText(String(desiredSheetName || '')).replace(/\s+/g, '').trim();
      for (const key of sheetKeys) {
        const keyNorm = normalizeText(String(key || '')).replace(/\s+/g, '').trim();
        if (keyNorm === desiredNorm) {
          sheet = sheetsObj[key];
          debugLog('Sheet encontrada por match normalizado:', key);
          break;
        }
      }
    }
    
    // 3. Try first available sheet as last resort
    if (!sheet && sheetsObj && sheetKeys.length > 0) {
      sheet = sheetsObj[sheetKeys[0]];
      debugLog('Sheet encontrada usando primeira chave disponível:', sheetKeys[0]);
    }

    // Validate sheet exists
    if (!sheet) {
      debugLog('ERRO: Nenhuma sheet encontrada');
      
      // FALLBACK: Use sheet_to_json approach
      debugLog('Tentando fallback com sheet_to_json...');
      return parseXLSFallback(workbook);
    }
    
    // Validate sheet has ref property
    const sheetRef = sheet['!ref'];
    if (!sheetRef) {
      debugLog('Sheet sem !ref, tentando fallback...');
      return parseXLSFallback(workbook);
    }
    
    // Get sheet range
    const range = XLSX.utils.decode_range(sheetRef);
    debugLog('Range da planilha:', { 
      startRow: range.s.r, 
      endRow: range.e.r, 
      startCol: range.s.c, 
      endCol: range.e.c 
    });
    
    const rows: XLSRow[] = [];
    let totalNumericCells = 0;
    
    // Iterate row by row, then cell by cell
    for (let rowIdx = range.s.r; rowIdx <= range.e.r; rowIdx++) {
      const cells: string[] = [];
      let firstText: { text: string; index: number } = { text: '', index: -1 };
      const numericValues: { value: number; raw: string }[] = [];
      
      // Read each cell in the row
      for (let colIdx = range.s.c; colIdx <= range.e.c; colIdx++) {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
        const cell = sheet[cellAddress];
        
        // Convert cell to string - read as text initially
        let cellValue = '';
        if (cell) {
          // Use formatted value if available, otherwise raw value
          cellValue = cell.w !== undefined ? String(cell.w) : 
                      cell.v !== undefined ? String(cell.v) : '';
        }
        
        cells.push(cellValue);
        
        // Find first text cell (from left to right)
        if (firstText.index === -1 && isTextCell(cellValue)) {
          firstText = { text: cellValue.trim(), index: colIdx };
        }
        
        // Collect all numeric values
        if (isNumericCell(cellValue)) {
          const parsedValue = parseSimpleBrazilianNumber(cellValue);
          numericValues.push({ value: parsedValue, raw: cellValue });
          totalNumericCells++;
        }
      }
      
      rows.push({
        cells,
        firstTextCell: firstText,
        numericValues
      });
    }
    
    debugLog('Total de linhas lidas:', rows.length);
    debugLog('Total de células numéricas encontradas:', totalNumericCells);
    
    return rows;
  } catch (error) {
    debugLog('ERRO ao processar arquivo XLS:', error);
    // ALWAYS return array, never undefined
    return [];
  }
}

/**
 * Fallback parser using sheet_to_json when direct cell access fails
 */
function parseXLSFallback(workbook: XLSX.WorkBook): XLSRow[] {
  debugLog('=== Usando parseXLSFallback ===');
  
  try {
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[Object.keys(workbook.Sheets)[0]] || workbook.Sheets[sheetName];
    
    if (!sheet) {
      debugLog('Fallback: Nenhuma sheet disponível');
      return [];
    }
    
    // Use sheet_to_json with header: 1 to get 2D array
    const jsonData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { 
      header: 1, 
      defval: '',
      raw: false 
    }) as unknown[][];
    
    debugLog('Fallback: Linhas obtidas via sheet_to_json:', jsonData?.length || 0);
    
    if (!jsonData || jsonData.length === 0) {
      return [];
    }
    
    const rows: XLSRow[] = [];
    let totalNumericCells = 0;
    
    for (const rowData of jsonData) {
      const cells: string[] = [];
      let firstText: { text: string; index: number } = { text: '', index: -1 };
      const numericValues: { value: number; raw: string }[] = [];
      
      if (!Array.isArray(rowData)) continue;
      
      for (let colIdx = 0; colIdx < rowData.length; colIdx++) {
        const cellValue = String(rowData[colIdx] ?? '');
        cells.push(cellValue);
        
        if (firstText.index === -1 && isTextCell(cellValue)) {
          firstText = { text: cellValue.trim(), index: colIdx };
        }
        
        if (isNumericCell(cellValue)) {
          const parsedValue = parseSimpleBrazilianNumber(cellValue);
          numericValues.push({ value: parsedValue, raw: cellValue });
          totalNumericCells++;
        }
      }
      
      rows.push({
        cells,
        firstTextCell: firstText,
        numericValues
      });
    }
    
    debugLog('Fallback: Total de linhas processadas:', rows.length);
    debugLog('Fallback: Total de células numéricas:', totalNumericCells);
    
    return rows;
  } catch (error) {
    debugLog('Fallback ERRO:', error);
    return [];
  }
}

// ============= BALANÇO PATRIMONIAL PARSING =============

export interface BalancoParseResult {
  entries: ParsedBalancoEntry[];
  metrics: BalancoMetrics;
  periodo: string;
  errors: string[];
  /**
   * Indica se o parser conseguiu "tentar" interpretar a estrutura do arquivo.
   * (Não depende de entries > 0; útil para XLS tolerante.)
   */
  parsed: boolean;
}

// ============= SAFE XLS ROW ACCESS HELPERS =============

/**
 * Safely get first text from an XLS row - NEVER throws
 */
function safeGetFirstTextFromXLSRow(row: XLSRow | undefined | null): { text: string; index: number } {
  if (!row) {
    return { text: '', index: -1 };
  }
  
  // Try firstTextCell first
  if (row.firstTextCell && row.firstTextCell.text) {
    return row.firstTextCell;
  }
  
  // Fallback: scan cells manually
  if (row.cells && Array.isArray(row.cells)) {
    for (let i = 0; i < row.cells.length; i++) {
      const cell = row.cells[i];
      if (typeof cell === 'string' && cell.trim() !== '' && isTextCell(cell)) {
        return { text: cell.trim(), index: i };
      }
    }
  }
  
  return { text: '', index: -1 };
}

/**
 * Safely get numeric values from an XLS row - NEVER throws
 */
function safeGetNumericValuesFromXLSRow(row: XLSRow | undefined | null): { value: number; raw: string }[] {
  if (!row) {
    return [];
  }
  
  // Try numericValues first
  if (row.numericValues && Array.isArray(row.numericValues)) {
    return row.numericValues;
  }
  
  // Fallback: scan cells manually
  const values: { value: number; raw: string }[] = [];
  if (row.cells && Array.isArray(row.cells)) {
    for (const cell of row.cells) {
      if (typeof cell === 'string' && isNumericCell(cell)) {
        values.push({ value: parseSimpleBrazilianNumber(cell), raw: cell });
      }
    }
  }
  
  return values;
}

/**
 * Safely get cells array from an XLS row
 */
function safeGetCellsFromXLSRow(row: XLSRow | undefined | null): string[] {
  if (!row || !row.cells || !Array.isArray(row.cells)) {
    return [];
  }
  return row.cells;
}

// ============= BALANÇO PATRIMONIAL PARSING =============

export interface BalancoParseResult {
  entries: ParsedBalancoEntry[];
  metrics: BalancoMetrics;
  periodo: string;
  errors: string[];
  /**
   * Indica se o parser conseguiu "tentar" interpretar a estrutura do arquivo.
   * (Não depende de entries > 0; útil para XLS tolerante.)
   */
  parsed: boolean;
}

/**
 * Parse Balanço from XLS/XLSX - cell by cell approach with SAFE access
 */
function parseBalancoFromXLS(rows: XLSRow[], filename: string): BalancoParseResult {
  debugLog('=== Iniciando parseBalancoFromXLS ===');
  debugLog('Total de linhas recebidas:', rows?.length || 0);
  
  const entries: ParsedBalancoEntry[] = [];
  const errors: string[] = [];
  
  // Safe periodo extraction
  const safeRows = (rows || []).map(r => safeGetCellsFromXLSRow(r));
  const periodo = extractPeriodFromRows(safeRows, filename);
  
  const metrics: BalancoMetrics = {
    ativoTotal: 0,
    ativoCirculante: 0,
    ativoNaoCirculante: 0,
    passivoTotal: 0,
    passivoCirculante: 0,
    passivoNaoCirculante: 0,
    patrimonioLiquido: 0
  };
  
  // Validate rows array
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    debugLog('AVISO: Array de linhas vazio ou inválido');
    return { entries, metrics, periodo, errors, parsed: false };
  }
  
  // Find "ATIVO" to start - this marks valid Balanço
  let startRow = -1;
  let foundAtivo = false;
  
  for (let i = 0; i < rows.length; i++) {
    const { text } = safeGetFirstTextFromXLSRow(rows[i]);
    if (!text) continue; // Skip empty rows
    
    const normalText = normalizeText(text);
    if (normalText === 'ATIVO') {
      startRow = i;
      foundAtivo = true;
      debugLog('Encontrado ATIVO na linha:', i);
      break;
    }
  }
  
  // Fallback: if "ATIVO" not found, look for any numeric data
  if (!foundAtivo) {
    debugLog('ATIVO não encontrado, buscando dados numéricos...');
    for (let i = 0; i < rows.length && i < 30; i++) {
      const numericValues = safeGetNumericValuesFromXLSRow(rows[i]);
      if (numericValues.length > 0) {
        startRow = i;
        debugLog('Dados numéricos encontrados na linha:', i);
        break;
      }
    }
    if (startRow === -1) {
      startRow = Math.min(5, rows.length - 1);
    }
  }
  
  // Track section context
  let currentSection: 'ATIVO' | 'PASSIVO' | 'PL' = 'ATIVO';
  let currentTipo = 'ATIVO CIRCULANTE';
  let justSawAtivo = false;
  let justSawPassivo = false;
  let foundAtivoCirculante = false;
  let foundPassivoCirculante = false;
  const hierarchyStack: string[] = [];
  
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    
    // SAFE access - never assume row properties exist
    const { text: conta, index: textIndex } = safeGetFirstTextFromXLSRow(row);
    
    // Skip rows without text
    if (!conta || conta.length < 2) {
      debugLog('Linha ignorada (sem texto):', i);
      continue;
    }
    
    const normalConta = normalizeText(conta);
    
    // Skip header rows
    if (normalConta.includes('DESCRICAO') || normalConta === 'CONTA') continue;
    
    // Get values with D/C context - SAFE access
    const rawCells = safeGetNumericValuesFromXLSRow(row);
    const valor = rawCells.length > 0 
      ? parseBrazilianNumber(rawCells[0].raw, currentSection) 
      : 0;
    const valor_anterior = rawCells.length > 1 
      ? parseBrazilianNumber(rawCells[1].raw, currentSection) 
      : null;
    
    // === PROGRESSIVE METRICS EXTRACTION ===
    
    if (normalConta === 'ATIVO') {
      metrics.ativoTotal = Math.abs(valor);
      currentSection = 'ATIVO';
      currentTipo = 'ATIVO CIRCULANTE';
      justSawAtivo = true;
      justSawPassivo = false;
      debugLog('ATIVO Total:', metrics.ativoTotal);
    }
    else if (normalConta === 'CIRCULANTE' && justSawAtivo && !foundAtivoCirculante) {
      metrics.ativoCirculante = Math.abs(valor);
      foundAtivoCirculante = true;
      justSawAtivo = false;
      debugLog('Ativo Circulante:', metrics.ativoCirculante);
    }
    else if (normalConta === 'ATIVO NAO CIRCULANTE' || 
             (normalConta === 'NAO CIRCULANTE' && currentSection === 'ATIVO')) {
      metrics.ativoNaoCirculante = Math.abs(valor);
      currentTipo = 'ATIVO NAO CIRCULANTE';
      justSawAtivo = false;
      debugLog('Ativo Não Circulante:', metrics.ativoNaoCirculante);
    }
    else if (normalConta === 'PASSIVO') {
      metrics.passivoTotal = Math.abs(valor);
      currentSection = 'PASSIVO';
      currentTipo = 'PASSIVO CIRCULANTE';
      justSawPassivo = true;
      justSawAtivo = false;
      debugLog('PASSIVO Total:', metrics.passivoTotal);
    }
    else if (normalConta === 'CIRCULANTE' && justSawPassivo && !foundPassivoCirculante) {
      metrics.passivoCirculante = Math.abs(valor);
      foundPassivoCirculante = true;
      justSawPassivo = false;
      debugLog('Passivo Circulante:', metrics.passivoCirculante);
    }
    else if (normalConta === 'PASSIVO NAO CIRCULANTE' || 
             (normalConta === 'NAO CIRCULANTE' && currentSection === 'PASSIVO')) {
      metrics.passivoNaoCirculante = Math.abs(valor);
      currentTipo = 'PASSIVO NAO CIRCULANTE';
      justSawPassivo = false;
      debugLog('Passivo Não Circulante:', metrics.passivoNaoCirculante);
    }
    else if (normalConta === 'PATRIMONIO LIQUIDO' || normalConta.includes('PATRIMONIO LIQUIDO')) {
      metrics.patrimonioLiquido = Math.abs(valor);
      currentSection = 'PL';
      currentTipo = 'PATRIMONIO LIQUIDO';
      justSawAtivo = false;
      justSawPassivo = false;
      debugLog('Patrimônio Líquido:', metrics.patrimonioLiquido);
    }
    else {
      justSawAtivo = false;
      justSawPassivo = false;
    }
    
    // Add entry if has value
    if (valor !== 0 || (valor_anterior !== null && valor_anterior !== 0)) {
      const level = textIndex >= 0 ? textIndex : 0;
      while (hierarchyStack.length > level) {
        hierarchyStack.pop();
      }
      hierarchyStack[level] = conta;
      const hierarchy = hierarchyStack.filter(Boolean).join(' > ');
      
      entries.push({
        conta,
        tipo: currentTipo,
        valor: Math.abs(valor),
        valor_anterior: valor_anterior !== null ? Math.abs(valor_anterior) : null,
        hierarchy,
        raw_row: safeGetCellsFromXLSRow(row)
      });
    }
  }
  
  debugLog('Total de entries do Balanço:', entries.length);
  debugLog('Metrics extraídas:', metrics);

  // Para XLS, considere "parsed" true se:
  // - rows.length > 0 (arquivo foi lido)
  // - E (hasAnyNumeric OU entries.length > 0)
  // 📌 NÃO exigir "ATIVO", "PASSIVO", "RECEITA" como critério obrigatório para XLS
  const hasAnyNumeric = (rows || []).some((r) => safeGetNumericValuesFromXLSRow(r).length > 0);
  const parsed = rows.length > 0 && (hasAnyNumeric || entries.length > 0);

  return { entries, metrics, periodo, errors, parsed };
}

/**
 * Parse Balanço from CSV
 */
function parseBalancoFromCSV(rows: string[][], filename: string): BalancoParseResult {
  debugLog('=== Iniciando parseBalancoFromCSV ===');
  
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
    patrimonioLiquido: 0
  };
  
  // Find "ATIVO"
  let startRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const rowText = rows[i]?.join(' ') || '';
    if (normalizeText(rowText).includes('ATIVO') && !normalizeText(rowText).includes('NAO CIRCULANTE')) {
      const firstText = findFirstTextInRow(rows[i]);
      if (normalizeText(firstText) === 'ATIVO') {
        startRow = i;
        break;
      }
    }
  }
  
  if (startRow === -1) {
    // Fallback: start from line 9 (Domínio format)
    startRow = Math.min(8, rows.length - 1);
  }
  
  let currentSection: 'ATIVO' | 'PASSIVO' | 'PL' = 'ATIVO';
  let currentTipo = 'ATIVO CIRCULANTE';
  let justSawAtivo = false;
  let justSawPassivo = false;
  let foundAtivoCirculante = false;
  let foundPassivoCirculante = false;
  const hierarchyStack: string[] = [];
  
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    const conta = findFirstTextInRow(row);
    if (!conta || conta.length < 2) continue;
    
    const normalConta = normalizeText(conta);
    if (normalConta.includes('DESCRICAO') || normalConta === 'CONTA') continue;
    
    const numericValues = findNumericValuesInRow(row);
    const valor = numericValues.length > 0 
      ? parseBrazilianNumber(numericValues[0], currentSection) 
      : 0;
    const valor_anterior = numericValues.length > 1 
      ? parseBrazilianNumber(numericValues[1], currentSection) 
      : null;
    
    // Same metrics extraction logic as XLS
    if (normalConta === 'ATIVO') {
      metrics.ativoTotal = Math.abs(valor);
      currentSection = 'ATIVO';
      currentTipo = 'ATIVO CIRCULANTE';
      justSawAtivo = true;
      justSawPassivo = false;
    }
    else if (normalConta === 'CIRCULANTE' && justSawAtivo && !foundAtivoCirculante) {
      metrics.ativoCirculante = Math.abs(valor);
      foundAtivoCirculante = true;
      justSawAtivo = false;
    }
    else if (normalConta === 'ATIVO NAO CIRCULANTE' || 
             (normalConta === 'NAO CIRCULANTE' && currentSection === 'ATIVO')) {
      metrics.ativoNaoCirculante = Math.abs(valor);
      currentTipo = 'ATIVO NAO CIRCULANTE';
      justSawAtivo = false;
    }
    else if (normalConta === 'PASSIVO') {
      metrics.passivoTotal = Math.abs(valor);
      currentSection = 'PASSIVO';
      currentTipo = 'PASSIVO CIRCULANTE';
      justSawPassivo = true;
      justSawAtivo = false;
    }
    else if (normalConta === 'CIRCULANTE' && justSawPassivo && !foundPassivoCirculante) {
      metrics.passivoCirculante = Math.abs(valor);
      foundPassivoCirculante = true;
      justSawPassivo = false;
    }
    else if (normalConta === 'PASSIVO NAO CIRCULANTE' || 
             (normalConta === 'NAO CIRCULANTE' && currentSection === 'PASSIVO')) {
      metrics.passivoNaoCirculante = Math.abs(valor);
      currentTipo = 'PASSIVO NAO CIRCULANTE';
      justSawPassivo = false;
    }
    else if (normalConta === 'PATRIMONIO LIQUIDO' || normalConta.includes('PATRIMONIO LIQUIDO')) {
      metrics.patrimonioLiquido = Math.abs(valor);
      currentSection = 'PL';
      currentTipo = 'PATRIMONIO LIQUIDO';
      justSawAtivo = false;
      justSawPassivo = false;
    }
    else {
      justSawAtivo = false;
      justSawPassivo = false;
    }
    
    if (valor !== 0 || (valor_anterior !== null && valor_anterior !== 0)) {
      const textIndex = findTextIndexInRow(row);
      const level = textIndex >= 0 ? textIndex : 0;
      while (hierarchyStack.length > level) {
        hierarchyStack.pop();
      }
      hierarchyStack[level] = conta;
      const hierarchy = hierarchyStack.filter(Boolean).join(' > ');
      
      entries.push({
        conta,
        tipo: currentTipo,
        valor: Math.abs(valor),
        valor_anterior: valor_anterior !== null ? Math.abs(valor_anterior) : null,
        hierarchy,
        raw_row: row.map(String)
      });
    }
  }
  
  debugLog('Total de entries do Balanço (CSV):', entries.length);
  
  return { entries, metrics, periodo, errors, parsed: true };
}

// ============= DRE PARSING =============

export interface DREParseResult {
  entries: ParsedDREEntry[];
  periodo: string;
  errors: string[];
  /**
   * Indica se o parser conseguiu "tentar" interpretar a estrutura do arquivo.
   * (Não depende de entries > 0; útil para XLS tolerante.)
   */
  parsed: boolean;
}

/**
 * Parse DRE from XLS/XLSX - with SAFE access
 */
function parseDREFromXLS(rows: XLSRow[], filename: string): DREParseResult {
  debugLog('=== Iniciando parseDREFromXLS ===');
  debugLog('Total de linhas recebidas:', rows?.length || 0);
  
  const entries: ParsedDREEntry[] = [];
  const errors: string[] = [];
  
  // Safe periodo extraction
  const safeRows = (rows || []).map(r => safeGetCellsFromXLSRow(r));
  const periodo = extractPeriodFromRows(safeRows, filename);
  
  // Validate rows array
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    debugLog('AVISO: Array de linhas vazio ou inválido');
    return { entries, periodo, errors, parsed: false };
  }
  
  // Find start - "DEMONSTRAÇÃO DO RESULTADO" or fallback to "RECEITA"
  let startRow = 0;
  let found = false;
  
  for (let i = 0; i < rows.length && i < 30; i++) {
    const cells = safeGetCellsFromXLSRow(rows[i]);
    const rowText = normalizeText(cells.join(' '));
    if (rowText.includes('DEMONSTRACAO DO RESULTADO') || 
        rowText.includes('DEMONSTRAÇÃO DO RESULTADO')) {
      startRow = i + 1;
      found = true;
      debugLog('Encontrado header DRE na linha:', i);
      break;
    }
  }
  
  // Fallback: look for "RECEITA"
  if (!found) {
    for (let i = 0; i < rows.length && i < 30; i++) {
      const { text } = safeGetFirstTextFromXLSRow(rows[i]);
      if (text && normalizeText(text).includes('RECEITA')) {
        startRow = i;
        found = true;
        debugLog('Fallback: encontrado RECEITA na linha:', i);
        break;
      }
    }
  }
  
  if (!found) {
    startRow = Math.min(5, rows.length - 1);
    debugLog('Usando linha padrão:', startRow);
  }
  
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    
    // SAFE access
    const { text: descricao } = safeGetFirstTextFromXLSRow(row);
    
    if (!descricao || descricao.length < 2) {
      debugLog('Linha ignorada (sem texto):', i);
      continue;
    }
    
    const normalDesc = normalizeText(descricao);
    if (normalDesc.includes('DESCRICAO') || normalDesc === 'CONTA') continue;
    
    // SAFE access for numeric values
    const numericValues = safeGetNumericValuesFromXLSRow(row);
    if (numericValues.length === 0) continue;
    
    const valor = numericValues[0]?.value || 0;
    const valor_anterior = numericValues.length > 1 ? numericValues[1].value : null;
    
    entries.push({
      descricao,
      valor,
      valor_anterior,
      raw_row: safeGetCellsFromXLSRow(row)
    });
  }
  
  debugLog('Total de entries DRE:', entries.length);

  // Para XLS, considere "parsed" true se:
  // - rows.length > 0 (arquivo foi lido)
  // - E (hasAnyNumeric OU entries.length > 0)
  // 📌 NÃO exigir "RECEITA" ou header como critério obrigatório para XLS
  const hasAnyNumeric = (rows || []).some((r) => safeGetNumericValuesFromXLSRow(r).length > 0);
  const parsed = rows.length > 0 && (hasAnyNumeric || entries.length > 0);

  return { entries, periodo, errors, parsed };
}

/**
 * Parse DRE from CSV
 */
function parseDREFromCSV(rows: string[][], filename: string): DREParseResult {
  debugLog('=== Iniciando parseDREFromCSV ===');
  
  const entries: ParsedDREEntry[] = [];
  const errors: string[] = [];
  const periodo = extractPeriodFromRows(rows, filename);
  
  // Find start
  let startRow = 0;
  let found = false;
  
  for (let i = 0; i < rows.length && i < 30; i++) {
    const rowText = normalizeText(rows[i]?.join(' ') || '');
    if (rowText.includes('DEMONSTRACAO DO RESULTADO') || 
        rowText.includes('DEMONSTRAÇÃO DO RESULTADO')) {
      startRow = i + 1;
      found = true;
      break;
    }
  }
  
  if (!found) {
    for (let i = 0; i < rows.length && i < 30; i++) {
      const firstText = findFirstTextInRow(rows[i] || []);
      if (normalizeText(firstText).includes('RECEITA')) {
        startRow = i;
        found = true;
        break;
      }
    }
  }
  
  if (!found) {
    // Domínio format: skip first 7 lines
    startRow = Math.min(7, rows.length - 1);
  }
  
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    const descricao = findFirstTextInRow(row);
    if (!descricao || descricao.length < 2) continue;
    
    const normalDesc = normalizeText(descricao);
    if (normalDesc.includes('DESCRICAO') || normalDesc === 'CONTA') continue;
    
    const numericValues = findNumericValuesInRow(row);
    if (numericValues.length === 0) continue;
    
    const valor = parseSimpleBrazilianNumber(numericValues[0]);
    const valor_anterior = numericValues.length > 1 ? parseSimpleBrazilianNumber(numericValues[1]) : null;
    
    entries.push({
      descricao,
      valor,
      valor_anterior,
      raw_row: row.map(String)
    });
  }
  
  debugLog('Total de entries DRE (CSV):', entries.length);
  
  return { entries, periodo, errors, parsed: true };
}

// ============= HELPER FUNCTIONS =============

function findFirstTextInRow(row: string[]): string {
  for (const cell of row) {
    const cleaned = String(cell || '').trim();
    if (isTextCell(cleaned)) {
      return cleaned;
    }
  }
  return '';
}

function findTextIndexInRow(row: string[]): number {
  for (let i = 0; i < row.length; i++) {
    const cleaned = String(row[i] || '').trim();
    if (isTextCell(cleaned)) {
      return i;
    }
  }
  return -1;
}

function findNumericValuesInRow(row: string[]): string[] {
  const values: string[] = [];
  for (const cell of row) {
    const cleaned = String(cell || '').trim();
    if (isNumericCell(cleaned)) {
      values.push(cleaned);
    }
  }
  return values;
}

function extractPeriodFromRows(rows: string[][], filename: string): string {
  // Try filename first
  const dateMatch = filename.match(/(\d{2}\/\d{2}\/\d{4}|\d{4})/);
  if (dateMatch) return dateMatch[1];

  // Try content in first 15 rows
  for (const row of rows.slice(0, 15)) {
    const text = row.join(' ');
    const match = text.match(/(\d{2}\/\d{2}\/\d{4}|\d{4})/);
    if (match) return match[1];
  }

  return new Date().getFullYear().toString();
}

// ============= MAIN EXPORT FUNCTIONS =============

/**
 * Parse file to array - ONLY for backward compatibility
 * New code should use parseBalancoFile and parseDREFile directly
 */
export async function parseFileToArray(file: File): Promise<string[][]> {
  const extension = getFileExtension(file.name);
  
  if (extension === 'csv') {
    return parseCSVFile(file);
  } else if (extension === 'xls' || extension === 'xlsx') {
    const xlsRows = await parseXLSFile(file);
    return xlsRows.map(r => r.cells);
  }
  
  throw new Error('Formato não suportado. Use CSV, XLS ou XLSX.');
}

/**
 * Parse DRE file - main entry point
 * Automatically detects file type and uses appropriate parser
 */
export async function parseDREFileAuto(file: File): Promise<DREParseResult> {
  const extension = getFileExtension(file.name);
  debugLog('Tipo de arquivo detectado para DRE:', extension);
  debugLog('Fluxo utilizado:', extension === 'csv' ? 'CSV' : 'XLS/XLSX');
  
  if (extension === 'csv') {
    const rows = await parseCSVFile(file);
    return parseDREFromCSV(rows, file.name);
  } else if (extension === 'xls' || extension === 'xlsx') {
    const xlsRows = await parseXLSFile(file);
    // O parsed é definido exclusivamente pelo parser interno, não revalidar aqui
    return parseDREFromXLS(xlsRows, file.name);
  }
  
  throw new Error('Formato não suportado. Use CSV, XLS ou XLSX.');
}

/**
 * Parse Balanço file - main entry point
 * Automatically detects file type and uses appropriate parser
 */
export async function parseBalancoFileAuto(file: File): Promise<BalancoParseResult> {
  const extension = getFileExtension(file.name);
  debugLog('Tipo de arquivo detectado para Balanço:', extension);
  debugLog('Fluxo utilizado:', extension === 'csv' ? 'CSV' : 'XLS/XLSX');
  
  if (extension === 'csv') {
    const rows = await parseCSVFile(file);
    return parseBalancoFromCSV(rows, file.name);
  } else if (extension === 'xls' || extension === 'xlsx') {
    const xlsRows = await parseXLSFile(file);
    // O parsed é definido exclusivamente pelo parser interno, não revalidar aqui
    return parseBalancoFromXLS(xlsRows, file.name);
  }
  
  throw new Error('Formato não suportado. Use CSV, XLS ou XLSX.');
}

// Keep old functions for backward compatibility
export function parseDREFile(rows: string[][], filename: string): DREParseResult {
  return parseDREFromCSV(rows, filename);
}

export function parseBalancoFile(rows: string[][], filename: string): BalancoParseResult {
  return parseBalancoFromCSV(rows, filename);
}

/**
 * Calculate DRE metrics from entries
 */
export function calculateDREMetrics(entries: ParsedDREEntry[]): DREMetrics {
  const metrics: DREMetrics = {
    receitaOperacional: 0,
    despesasOperacionais: 0,
    lucroBruto: 0,
    lucroLiquido: 0
  };

  let inReceitaSection = false;
  let inDespesasSection = false;

  for (const entry of entries) {
    const normalDesc = normalizeText(entry.descricao);
    const valor = Math.abs(entry.valor);

    if (normalDesc.includes('RECEITA OPERACIONAL') || 
        normalDesc.includes('RECEITA BRUTA') ||
        normalDesc.includes('RECEITA LIQUIDA')) {
      if (valor > 0) {
        metrics.receitaOperacional = valor;
      } else {
        inReceitaSection = true;
      }
      continue;
    }

    if (normalDesc.includes('IMPOSTOS SOBRE VENDAS') ||
        normalDesc.includes('DEDUCOES DA RECEITA')) {
      inReceitaSection = false;
      continue;
    }

    if (normalDesc.includes('LUCRO BRUTO') || normalDesc === 'LUCRO BRUTO') {
      metrics.lucroBruto = valor;
      inDespesasSection = true;
      continue;
    }

    if (normalDesc.includes('DESPESAS FINANCEIRAS') ||
        normalDesc.includes('RESULTADO FINANCEIRO')) {
      inDespesasSection = false;
      continue;
    }

    if (normalDesc.includes('LUCRO LIQUIDO') || 
        normalDesc.includes('RESULTADO DO EXERCICIO') ||
        normalDesc.includes('RESULTADO LIQUIDO')) {
      metrics.lucroLiquido = valor;
      continue;
    }

    if (inReceitaSection && valor > 0) {
      metrics.receitaOperacional += valor;
    }

    if (inDespesasSection && valor > 0 && 
        (normalDesc.includes('DESPESA') || normalDesc.includes('CUSTO'))) {
      metrics.despesasOperacionais += valor;
    }
  }

  return metrics;
}

// For backward compatibility
export function extractPeriod(filename: string, rows: string[][]): string {
  return extractPeriodFromRows(rows, filename);
}
