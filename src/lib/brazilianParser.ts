import * as XLSX from 'xlsx';
import Papa from 'papaparse';

/**
 * Parse Brazilian number format with D/C (Debit/Credit) handling
 * 
 * Examples:
 * - "1.234,56" → 1234.56
 * - "1.234,56D" → +1234.56 (for ATIVO) or -1234.56 (for PASSIVO/PL)
 * - "1.234,56C" → -1234.56 (for ATIVO) or +1234.56 (for PASSIVO/PL)
 * - "(1.234,56)" → -1234.56
 */
export function parseBrazilianNumber(
  value: string | number | undefined | null,
  context?: 'ATIVO' | 'PASSIVO' | 'PL'
): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  
  let cleaned = value.toString().trim();
  
  // Remove quotes
  cleaned = cleaned.replace(/^["']|["']$/g, '');
  
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
 * Simple number parser without D/C context (for basic extraction)
 */
export function parseSimpleBrazilianNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  
  let cleaned = value.toString().trim();
  cleaned = cleaned.replace(/^["']|["']$/g, '');
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
  const cleaned = value.trim().replace(/^["']|["']$/g, '');
  // Match Brazilian number patterns with optional D/C suffix
  return /^[\d.,()R$\s-]+[dcDC]?$/.test(cleaned);
}

/**
 * Check if a cell is a valid text account name
 */
function isTextCell(value: string): boolean {
  if (!value || value.trim() === '') return false;
  const cleaned = value.trim();
  // Not a numeric cell
  return !isNumericCell(cleaned) && cleaned.length >= 2;
}

/**
 * Find the first non-empty text cell in a row
 */
function findFirstTextCell(row: string[]): { text: string; index: number } {
  for (let i = 0; i < row.length; i++) {
    const cell = String(row[i] || '').trim();
    if (isTextCell(cell)) {
      return { text: cell, index: i };
    }
  }
  return { text: '', index: -1 };
}

/**
 * Find all numeric values in a row (from all cells)
 */
function findAllNumericValues(row: string[]): number[] {
  const values: number[] = [];
  for (let i = 0; i < row.length; i++) {
    const cell = String(row[i] || '').trim();
    if (isNumericCell(cell)) {
      values.push(parseSimpleBrazilianNumber(cell));
    }
  }
  return values;
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

/**
 * Parse file to 2D array - always use first sheet for XLS/XLSX
 */
export async function parseFileToArray(file: File): Promise<string[][]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  if (extension === 'csv') {
    return new Promise((resolve, reject) => {
      // First try with comma delimiter
      Papa.parse(file, {
        delimiter: ',',
        skipEmptyLines: false,
        complete: (results) => {
          const data = results.data as string[][];
          if (data.length > 0 && data[0].length > 1) {
            resolve(data);
          } else {
            // Try semicolon as fallback
            Papa.parse(file, {
              delimiter: ';',
              skipEmptyLines: false,
              complete: (results2) => {
                resolve(results2.data as string[][]);
              },
              error: reject
            });
          }
        },
        error: reject
      });
    });
  } else if (extension === 'xls' || extension === 'xlsx') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', raw: false });
    // Always use first sheet (sheet[0])
    const firstSheetName = workbook.SheetNames[0];
    const firstSheet = workbook.Sheets[firstSheetName];
    // Read all cells as text initially
    const data = XLSX.utils.sheet_to_json(firstSheet, { 
      header: 1, 
      raw: false,  // Read as text
      defval: '' 
    }) as string[][];
    return data;
  }
  
  throw new Error('Formato não suportado. Use CSV, XLS ou XLSX.');
}

/**
 * Extract period from filename or content
 */
export function extractPeriod(filename: string, rows: string[][]): string {
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

/**
 * Extracted metrics from Balanço Patrimonial
 * These are read directly from summary lines, NOT calculated
 */
export interface BalancoMetrics {
  ativoTotal: number;
  ativoCirculante: number;
  ativoNaoCirculante: number;
  passivoTotal: number;
  passivoCirculante: number;
  passivoNaoCirculante: number;
  patrimonioLiquido: number;
}

/**
 * Parse DRE file following Domínio Sistemas format
 * 
 * TOLERANT RULES:
 * 1. Try to find "DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO" to start
 * 2. Fallback: look for "RECEITA" if main header not found
 * 3. DRE is valid if at least one monetary value was processed
 * 4. Never abort - process whatever data is found
 */
export function parseDREFile(rows: string[][], filename: string): {
  entries: ParsedDREEntry[];
  periodo: string;
  errors: string[];
} {
  const periodo = extractPeriod(filename, rows);
  const entries: ParsedDREEntry[] = [];
  const errors: string[] = [];

  // Find start of DRE data with multiple fallback strategies
  let startRow = 0;
  let foundDREHeader = false;

  // Strategy 1: Look for "DEMONSTRAÇÃO DO RESULTADO"
  for (let i = 0; i < rows.length && i < 30; i++) {
    const rowText = normalizeText(rows[i]?.join(' ') || '');
    if (rowText.includes('DEMONSTRACAO DO RESULTADO') || 
        rowText.includes('DEMONSTRAÇÃO DO RESULTADO')) {
      startRow = i + 1;
      foundDREHeader = true;
      break;
    }
  }

  // Strategy 2: Fallback - look for "RECEITA" if main header not found
  if (!foundDREHeader) {
    for (let i = 0; i < rows.length && i < 30; i++) {
      const { text } = findFirstTextCell(rows[i] || []);
      const normalText = normalizeText(text);
      if (normalText.includes('RECEITA')) {
        startRow = i;
        foundDREHeader = true;
        break;
      }
    }
  }

  // Strategy 3: Last fallback - start from line 5
  if (!foundDREHeader) {
    startRow = Math.min(5, rows.length - 1);
  }

  // Process all rows from startRow
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const { text: descricao } = findFirstTextCell(row);
    if (!descricao || descricao.length < 2) continue;

    // Skip header-like rows
    const normalDesc = normalizeText(descricao);
    if (normalDesc.includes('DESCRICAO') || normalDesc === 'CONTA') continue;

    // Find numeric values
    const numericValues = findAllNumericValues(row);

    // Skip if no values - but don't abort the entire process
    if (numericValues.length === 0) continue;

    // First value = current, second value = previous (if exists)
    const valor = numericValues[0] || 0;
    const valor_anterior = numericValues.length > 1 ? numericValues[1] : null;

    entries.push({
      descricao,
      valor,
      valor_anterior,
      raw_row: row.map(String)
    });
  }

  // Only show warning, never block - DRE is valid if at least one entry was found
  // Even if no entries, we don't block - maybe only Balanço has data
  
  return { entries, periodo, errors };
}

/**
 * Parse Balanço Patrimonial file
 * 
 * TOLERANT RULES (CRITICAL):
 * 1. Balanço is VALID if "ATIVO" is found - don't require all blocks
 * 2. Read totals from key lines progressively (what's found, not what's missing)
 * 3. Missing fields = null/0, NOT errors
 * 4. Never abort - process whatever data is found
 * 5. Only error if NO numeric values at all
 */
export function parseBalancoFile(rows: string[][], filename: string): {
  entries: ParsedBalancoEntry[];
  metrics: BalancoMetrics;
  periodo: string;
  errors: string[];
} {
  const periodo = extractPeriod(filename, rows);
  const entries: ParsedBalancoEntry[] = [];
  const errors: string[] = [];
  const hierarchyStack: string[] = [];

  // Metrics extracted from key lines - default to 0, not error
  const metrics: BalancoMetrics = {
    ativoTotal: 0,
    ativoCirculante: 0,
    ativoNaoCirculante: 0,
    passivoTotal: 0,
    passivoCirculante: 0,
    passivoNaoCirculante: 0,
    patrimonioLiquido: 0
  };

  // Find first occurrence of "ATIVO" - this marks a valid Balanço
  let startRow = -1;
  let foundAtivo = false;
  
  for (let i = 0; i < rows.length; i++) {
    const { text } = findFirstTextCell(rows[i] || []);
    const normalText = normalizeText(text);
    if (normalText === 'ATIVO') {
      startRow = i;
      foundAtivo = true;
      break;
    }
  }

  // Fallback: if "ATIVO" not found, try to find any accounting data
  if (!foundAtivo) {
    // Look for any line that might be accounting data
    for (let i = 0; i < rows.length && i < 20; i++) {
      const numericValues = findAllNumericValues(rows[i] || []);
      if (numericValues.length > 0) {
        startRow = i;
        break;
      }
    }
    // Last resort: start from line 5
    if (startRow === -1) {
      startRow = Math.min(5, rows.length - 1);
    }
  }

  // Track current section for D/C handling and tipo classification
  let currentSection: 'ATIVO' | 'PASSIVO' | 'PL' = 'ATIVO';
  let currentTipo = 'ATIVO CIRCULANTE';
  
  // Track context for identifying "CIRCULANTE" correctly
  let justSawAtivo = false;
  let justSawPassivo = false;
  let foundAtivoCirculante = false;
  let foundPassivoCirculante = false;
  let totalNumericValuesFound = 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const { text: conta, index: textIndex } = findFirstTextCell(row);
    if (!conta || conta.length < 2) continue;

    const normalConta = normalizeText(conta);

    // Skip header-like rows
    if (normalConta.includes('DESCRICAO') || normalConta === 'CONTA') continue;

    // Find raw cell values to preserve D/C suffixes
    const rawCells: string[] = [];
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || '').trim();
      if (isNumericCell(cell)) {
        rawCells.push(cell);
      }
    }

    // Parse values with D/C context
    const valor = rawCells.length > 0 
      ? parseBrazilianNumber(rawCells[0], currentSection) 
      : 0;
    const valor_anterior = rawCells.length > 1 
      ? parseBrazilianNumber(rawCells[1], currentSection) 
      : null;

    // Count numeric values found
    if (rawCells.length > 0) {
      totalNumericValuesFound++;
    }

    // ===== PROGRESSIVE SECTION DETECTION AND METRICS EXTRACTION =====
    // Each block is optional - we extract what we find
    
    // 1. ATIVO line → Ativo Total
    if (normalConta === 'ATIVO') {
      metrics.ativoTotal = Math.abs(valor);
      currentSection = 'ATIVO';
      currentTipo = 'ATIVO CIRCULANTE';
      justSawAtivo = true;
      justSawPassivo = false;
    }
    // 2. CIRCULANTE immediately after ATIVO → Ativo Circulante
    else if (normalConta === 'CIRCULANTE' && justSawAtivo && !foundAtivoCirculante) {
      metrics.ativoCirculante = Math.abs(valor);
      foundAtivoCirculante = true;
      justSawAtivo = false;
    }
    // 3. ATIVO NÃO CIRCULANTE or NÃO CIRCULANTE in ATIVO section
    else if (normalConta === 'ATIVO NAO CIRCULANTE' || 
             (normalConta === 'NAO CIRCULANTE' && currentSection === 'ATIVO')) {
      metrics.ativoNaoCirculante = Math.abs(valor);
      currentTipo = 'ATIVO NAO CIRCULANTE';
      justSawAtivo = false;
    }
    // 4. PASSIVO line → Passivo Total (optional - don't fail if not found)
    else if (normalConta === 'PASSIVO') {
      metrics.passivoTotal = Math.abs(valor);
      currentSection = 'PASSIVO';
      currentTipo = 'PASSIVO CIRCULANTE';
      justSawPassivo = true;
      justSawAtivo = false;
    }
    // 5. CIRCULANTE immediately after PASSIVO → Passivo Circulante
    else if (normalConta === 'CIRCULANTE' && justSawPassivo && !foundPassivoCirculante) {
      metrics.passivoCirculante = Math.abs(valor);
      foundPassivoCirculante = true;
      justSawPassivo = false;
    }
    // 6. PASSIVO NÃO CIRCULANTE (optional)
    else if (normalConta === 'PASSIVO NAO CIRCULANTE' || 
             (normalConta === 'NAO CIRCULANTE' && currentSection === 'PASSIVO')) {
      metrics.passivoNaoCirculante = Math.abs(valor);
      currentTipo = 'PASSIVO NAO CIRCULANTE';
      justSawPassivo = false;
    }
    // 7. PATRIMÔNIO LÍQUIDO (optional)
    else if (normalConta === 'PATRIMONIO LIQUIDO' || 
             normalConta.includes('PATRIMONIO LIQUIDO')) {
      metrics.patrimonioLiquido = Math.abs(valor);
      currentSection = 'PL';
      currentTipo = 'PATRIMONIO LIQUIDO';
      justSawAtivo = false;
      justSawPassivo = false;
    }
    else {
      // Reset "just saw" flags for any other line
      justSawAtivo = false;
      justSawPassivo = false;
    }

    // Include all rows with values (don't skip)
    if (valor !== 0 || (valor_anterior !== null && valor_anterior !== 0)) {
      // Build hierarchy based on indentation level
      const level = textIndex;
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

  // TOLERANT VALIDATION: Only error if absolutely NO data was found
  // Having "ATIVO" found OR having any numeric values = valid Balanço
  // We DON'T fail just because some sections are missing

  return { entries, metrics, periodo, errors };
}

/**
 * Extracted metrics from DRE
 */
export interface DREMetrics {
  receitaOperacional: number;
  despesasOperacionais: number;
  lucroBruto: number;
  lucroLiquido: number;
}

/**
 * Calculate DRE metrics from entries
 * 
 * Rules:
 * - Receita Operacional: sum lines below "Receita Operacional" until "Impostos sobre Vendas"
 * - Despesas Operacionais: sum after "Lucro Bruto" until "Despesas Financeiras"
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

    // Detect section markers
    if (normalDesc.includes('RECEITA OPERACIONAL') || 
        normalDesc.includes('RECEITA BRUTA') ||
        normalDesc.includes('RECEITA LIQUIDA')) {
      // If this line has a value, it's the total, not just a header
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

    // Accumulate values based on section
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
