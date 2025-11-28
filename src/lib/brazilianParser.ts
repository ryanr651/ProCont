import * as XLSX from 'xlsx';
import Papa from 'papaparse';

// Parse Brazilian number format: 1.234,56 -> 1234.56
// Also handles (1.234,56) as negative
export function parseBrazilianNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  
  let cleaned = value.toString().trim();
  
  // Remove R$ and currency symbols
  cleaned = cleaned.replace(/R\$\s*/gi, '');
  
  // Remove 'd' or 'c' suffix (debit/credit indicator) and any trailing junk like ";59d"
  cleaned = cleaned.replace(/;.*$/, '');
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

// Normalize header names for matching
export function normalizeHeader(header: string): string {
  if (!header) return '';
  return header
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/\s+/g, '_');
}

// Map column variations to standard names
const DESCRIPTION_VARIATIONS = ['descricao', 'conta', 'titulo', 'historico', 'nome', 'classificacao'];
const VALUE_VARIATIONS = ['valor', 'valor_atual', 'saldo', 'valor1', 'valor2', 'total'];
const VALUE_ANTERIOR_VARIATIONS = ['valor_anterior', 'saldo_anterior', 'ano_anterior'];

export function findColumnIndex(headers: string[], variations: string[]): number {
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const variation of variations) {
    const index = normalizedHeaders.findIndex(h => h.includes(variation));
    if (index !== -1) return index;
  }
  return -1;
}

// Find the first text column (for description) and numeric columns (for values)
export function detectColumns(rows: string[][]): {
  descIndex: number;
  valueIndex: number;
  valueAnteriorIndex: number;
  dataStartRow: number;
} {
  let descIndex = -1;
  let valueIndex = -1;
  let valueAnteriorIndex = -1;
  let dataStartRow = 0;

  // Try to find header row first
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const headers = row.map(String);
    const tempDescIndex = findColumnIndex(headers, DESCRIPTION_VARIATIONS);
    const tempValueIndex = findColumnIndex(headers, VALUE_VARIATIONS);

    if (tempDescIndex !== -1 || tempValueIndex !== -1) {
      descIndex = tempDescIndex;
      valueIndex = tempValueIndex;
      valueAnteriorIndex = findColumnIndex(headers, VALUE_ANTERIOR_VARIATIONS);
      dataStartRow = i + 1;
      break;
    }
  }

  // If no headers found, detect based on content
  if (descIndex === -1 && valueIndex === -1) {
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;

      // Find first row with at least one text and one numeric value
      let hasText = false;
      let hasNumber = false;
      let textCol = -1;
      let numCol = -1;

      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || '').trim();
        if (!cell) continue;

        const num = parseBrazilianNumber(cell);
        if (num !== 0 || cell.match(/^[\d.,()R$\s-]+$/)) {
          if (!hasNumber) {
            hasNumber = true;
            numCol = j;
          }
        } else if (cell.length > 2) {
          if (!hasText) {
            hasText = true;
            textCol = j;
          }
        }
      }

      if (hasText && hasNumber) {
        descIndex = textCol;
        valueIndex = numCol;
        // Look for second numeric column for valor_anterior
        for (let j = numCol + 1; j < row.length; j++) {
          const cell = String(row[j] || '').trim();
          const num = parseBrazilianNumber(cell);
          if (num !== 0 || cell.match(/^[\d.,()R$\s-]+$/)) {
            valueAnteriorIndex = j;
            break;
          }
        }
        dataStartRow = i;
        break;
      }
    }
  }

  // Fallback: assume first column is description, look for value columns
  if (descIndex === -1) descIndex = 0;
  if (valueIndex === -1) {
    // Find first column with numbers
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const row = rows[i];
      if (!row) continue;
      for (let j = 1; j < row.length; j++) {
        const num = parseBrazilianNumber(row[j]);
        if (num !== 0) {
          valueIndex = j;
          if (j + 1 < row.length) {
            valueAnteriorIndex = j + 1;
          }
          break;
        }
      }
      if (valueIndex !== -1) break;
    }
  }

  return { descIndex, valueIndex, valueAnteriorIndex, dataStartRow };
}

// Detect hierarchy level based on leading empty cells or indentation
export function detectHierarchyLevel(row: string[], descIndex: number): number {
  let level = 0;
  for (let i = 0; i < descIndex; i++) {
    if (!row[i] || String(row[i]).trim() === '') {
      level++;
    }
  }
  return level;
}

// Detect account type for balance sheet
export function detectAccountType(description: string): string {
  const upper = description.toUpperCase();
  if (upper.includes('ATIVO')) return 'ATIVO';
  if (upper.includes('PASSIVO')) return 'PASSIVO';
  if (upper.includes('PATRIMÔNIO') || upper.includes('PATRIMONIO') || upper.includes('PL')) return 'PATRIMONIO_LIQUIDO';
  return 'OUTRO';
}

// Parse file to 2D array
export async function parseFileToArray(file: File): Promise<string[][]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  if (extension === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        delimiter: ';', // Brazilian CSV standard
        skipEmptyLines: true,
        complete: (results) => {
          // If semicolon didn't work well, try comma
          const data = results.data as string[][];
          if (data.length > 0 && data[0].length === 1) {
            Papa.parse(file, {
              delimiter: ',',
              skipEmptyLines: true,
              complete: (results2) => {
                resolve(results2.data as string[][]);
              },
              error: reject
            });
          } else {
            resolve(data);
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

  // Try content
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

export function parseDREFile(rows: string[][], filename: string): {
  entries: ParsedDREEntry[];
  periodo: string;
  errors: string[];
} {
  const { descIndex, valueIndex, valueAnteriorIndex, dataStartRow } = detectColumns(rows);
  const periodo = extractPeriod(filename, rows);
  const entries: ParsedDREEntry[] = [];
  const errors: string[] = [];

  if (valueIndex === -1) {
    errors.push('Não foi possível identificar a coluna de valores no DRE.');
    return { entries, periodo, errors };
  }

  for (let i = dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const descricao = String(row[descIndex] || '').trim();
    if (!descricao || descricao.length < 2) continue;

    const valor = parseBrazilianNumber(row[valueIndex]);
    const valor_anterior = valueAnteriorIndex !== -1 
      ? parseBrazilianNumber(row[valueAnteriorIndex]) 
      : null;

    // Skip header-like rows
    if (descricao.toLowerCase().includes('descri') || 
        descricao.toLowerCase().includes('conta')) continue;

    entries.push({
      descricao,
      valor,
      valor_anterior: valor_anterior === 0 ? null : valor_anterior,
      raw_row: row.map(String)
    });
  }

  if (entries.length === 0) {
    errors.push('Nenhuma entrada válida encontrada no DRE.');
  }

  return { entries, periodo, errors };
}

export function parseBalancoFile(rows: string[][], filename: string): {
  entries: ParsedBalancoEntry[];
  periodo: string;
  errors: string[];
} {
  const { descIndex, valueIndex, valueAnteriorIndex, dataStartRow } = detectColumns(rows);
  const periodo = extractPeriod(filename, rows);
  const entries: ParsedBalancoEntry[] = [];
  const errors: string[] = [];
  let currentType = 'OUTRO';
  const hierarchyStack: string[] = [];

  if (valueIndex === -1) {
    errors.push('Não foi possível identificar a coluna de valores no Balanço.');
    return { entries, periodo, errors };
  }

  for (let i = dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const conta = String(row[descIndex] || '').trim();
    if (!conta || conta.length < 2) continue;

    // Skip header-like rows
    if (conta.toLowerCase().includes('descri') || 
        conta.toLowerCase() === 'conta') continue;

    // Update current type based on major sections
    const detectedType = detectAccountType(conta);
    if (detectedType !== 'OUTRO') {
      currentType = detectedType;
    }

    const valor = parseBrazilianNumber(row[valueIndex]);
    const valor_anterior = valueAnteriorIndex !== -1 
      ? parseBrazilianNumber(row[valueAnteriorIndex]) 
      : null;

    // Build hierarchy
    const level = detectHierarchyLevel(row, descIndex);
    while (hierarchyStack.length > level) {
      hierarchyStack.pop();
    }
    hierarchyStack[level] = conta;
    const hierarchy = hierarchyStack.filter(Boolean).join(' > ');

    entries.push({
      conta,
      tipo: currentType,
      valor,
      valor_anterior: valor_anterior === 0 ? null : valor_anterior,
      hierarchy,
      raw_row: row.map(String)
    });
  }

  if (entries.length === 0) {
    errors.push('Nenhuma entrada válida encontrada no Balanço.');
  }

  return { entries, periodo, errors };
}
