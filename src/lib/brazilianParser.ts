import * as XLSX from 'xlsx';
import Papa from 'papaparse';

// Parse Brazilian number format: 1.234,56 -> 1234.56
// Handles:
// - (1.234,56) as negative
// - "1.234,56d" suffix (debit indicator)
// - "1.234,56c" suffix (credit indicator)
export function parseBrazilianNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  
  let cleaned = value.toString().trim();
  
  // Remove quotes
  cleaned = cleaned.replace(/^["']|["']$/g, '');
  
  // Remove R$ and currency symbols
  cleaned = cleaned.replace(/R\$\s*/gi, '');
  
  // Remove 'd' or 'c' suffix (debit/credit indicator from Domínio Sistemas)
  cleaned = cleaned.replace(/[dc]$/i, '');
  
  // Handle parentheses as negative: (6.593,46) -> -6593.46
  const isNegative = cleaned.includes('(') && cleaned.includes(')');
  cleaned = cleaned.replace(/[()]/g, '');
  
  // Remove spaces
  cleaned = cleaned.replace(/\s/g, '');
  
  // Brazilian format: dots for thousands, comma for decimal
  // 1.234.567,89 -> 1234567.89
  cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  
  return isNegative ? -Math.abs(num) : num;
}

// Find the first non-empty text cell in a row (skipping leading commas/empty cells)
function findFirstTextCell(row: string[]): { text: string; index: number } {
  for (let i = 0; i < row.length; i++) {
    const cell = String(row[i] || '').trim();
    if (cell && !cell.match(/^[\d.,()R$\s-]+[dc]?$/i)) {
      return { text: cell, index: i };
    }
  }
  return { text: '', index: -1 };
}

// Find all numeric values in a row (after the text cell)
function findNumericValues(row: string[], startIndex: number): number[] {
  const values: number[] = [];
  for (let i = startIndex + 1; i < row.length; i++) {
    const cell = String(row[i] || '').trim();
    if (cell) {
      const num = parseBrazilianNumber(cell);
      if (num !== 0 || cell.match(/^[\d.,()R$\s-]+[dc]?$/i)) {
        values.push(num);
      }
    }
  }
  return values;
}

// Parse file to 2D array
export async function parseFileToArray(file: File): Promise<string[][]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  if (extension === 'csv') {
    return new Promise((resolve, reject) => {
      // First try with comma delimiter (Domínio Sistemas standard)
      Papa.parse(file, {
        delimiter: ',',
        skipEmptyLines: false, // Keep empty lines to maintain row count
        complete: (results) => {
          const data = results.data as string[][];
          // Check if parsing worked well
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
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet, { 
      header: 1, 
      raw: false, 
      defval: '' 
    }) as string[][];
    return data;
  }
  
  throw new Error('Formato não suportado. Use CSV, XLS ou XLSX.');
}

// Extract period from filename or content
export function extractPeriod(filename: string, rows: string[][]): string {
  // Try filename first
  const dateMatch = filename.match(/(\d{2}\/\d{2}\/\d{4}|\d{4})/);
  if (dateMatch) return dateMatch[1];

  // Try content in first 10 rows
  for (const row of rows.slice(0, 10)) {
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
 * Parse DRE file following Domínio Sistemas format:
 * - Ignore lines 1-7 completely
 * - Start reading at line 8 (index 7)
 * - Format: ,nome_da_conta,,,,"valor_periodo_atual",,,,,"valor_total"
 * - Extract: nome_da_conta, valor_periodo_atual, valor_total
 */
export function parseDREFile(rows: string[][], filename: string): {
  entries: ParsedDREEntry[];
  periodo: string;
  errors: string[];
} {
  const periodo = extractPeriod(filename, rows);
  const entries: ParsedDREEntry[] = [];
  const errors: string[] = [];

  // Start at line 8 (index 7) - skip lines 1-7
  const startRow = 7;

  if (rows.length <= startRow) {
    errors.push('Arquivo DRE não contém dados suficientes. Esperado pelo menos 8 linhas.');
    return { entries, periodo, errors };
  }

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // Find the first non-empty text cell (nome_da_conta)
    const { text: descricao, index: textIndex } = findFirstTextCell(row);
    
    if (!descricao || descricao.length < 2) continue;

    // Skip header-like rows
    const lowerDesc = descricao.toLowerCase();
    if (lowerDesc.includes('descri') || 
        lowerDesc === 'conta' ||
        lowerDesc.includes('receita operacional') && i === startRow) continue;

    // Find numeric values after the text cell
    const numericValues = findNumericValues(row, textIndex);

    // Get valor_periodo_atual (first numeric) and valor_total (second numeric if exists)
    const valor = numericValues.length > 0 ? numericValues[0] : 0;
    const valor_anterior = numericValues.length > 1 ? numericValues[1] : null;

    entries.push({
      descricao,
      valor,
      valor_anterior,
      raw_row: row.map(String)
    });
  }

  if (entries.length === 0) {
    errors.push('Nenhuma entrada válida encontrada no DRE. Verifique se o arquivo segue o formato esperado.');
  }

  return { entries, periodo, errors };
}

// Detect account type for balance sheet
function detectAccountType(description: string): string {
  const upper = description.toUpperCase().trim();
  if (upper === 'ATIVO' || upper.startsWith('ATIVO ')) return 'ATIVO';
  if (upper === 'PASSIVO' || upper.startsWith('PASSIVO ')) return 'PASSIVO';
  if (upper.includes('PATRIMÔNIO') || upper.includes('PATRIMONIO') || upper === 'PL') return 'PATRIMONIO_LIQUIDO';
  return 'OUTRO';
}

// Detect hierarchy level based on leading empty cells
function detectHierarchyLevel(row: string[], textIndex: number): number {
  return textIndex;
}

/**
 * Parse Balanço Patrimonial file following Domínio Sistemas format:
 * - Ignore lines 1-8 completely
 * - Start reading at line 9 (index 8)
 * - Format: ,,CONTA_NAME,,,,,,,,,,"valor_atual",,,,"valor_anterior",,
 * - Lines have multiple leading commas
 * - Values have "d" suffix (e.g., "6.704.423,33d")
 * - Extract: nome_da_conta, valor_atual, valor_anterior
 */
export function parseBalancoFile(rows: string[][], filename: string): {
  entries: ParsedBalancoEntry[];
  periodo: string;
  errors: string[];
} {
  const periodo = extractPeriod(filename, rows);
  const entries: ParsedBalancoEntry[] = [];
  const errors: string[] = [];
  let currentType = 'OUTRO';
  const hierarchyStack: string[] = [];

  // Start at line 9 (index 8) - skip lines 1-8
  const startRow = 8;

  if (rows.length <= startRow) {
    errors.push('Arquivo Balanço não contém dados suficientes. Esperado pelo menos 9 linhas.');
    return { entries, periodo, errors };
  }

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // Find the first non-empty text cell (ignore all leading commas)
    const { text: conta, index: textIndex } = findFirstTextCell(row);
    
    if (!conta || conta.length < 2) continue;

    // Skip header-like rows
    const lowerConta = conta.toLowerCase();
    if (lowerConta.includes('descri') || lowerConta === 'conta') continue;

    // Update current type based on major sections
    const detectedType = detectAccountType(conta);
    if (detectedType !== 'OUTRO') {
      currentType = detectedType;
    }

    // Find numeric values after the text cell
    const numericValues = findNumericValues(row, textIndex);

    // Get valor_atual (first numeric) and valor_anterior (second numeric if exists)
    const valor = numericValues.length > 0 ? numericValues[0] : 0;
    const valor_anterior = numericValues.length > 1 ? numericValues[1] : null;

    // Build hierarchy based on indentation level (number of leading empty cells)
    const level = detectHierarchyLevel(row, textIndex);
    while (hierarchyStack.length > level) {
      hierarchyStack.pop();
    }
    hierarchyStack[level] = conta;
    const hierarchy = hierarchyStack.filter(Boolean).join(' > ');

    entries.push({
      conta,
      tipo: currentType,
      valor,
      valor_anterior,
      hierarchy,
      raw_row: row.map(String)
    });
  }

  if (entries.length === 0) {
    errors.push('Nenhuma entrada válida encontrada no Balanço. Verifique se o arquivo segue o formato esperado.');
  }

  return { entries, periodo, errors };
}
