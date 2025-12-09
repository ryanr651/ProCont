import * as XLSX from 'xlsx';
import Papa from 'papaparse';

// ============================================
// PARSING DE NÚMEROS BRASILEIROS
// ============================================

/**
 * Converte número brasileiro para float
 * - Remove aspas
 * - Remove "d" ou "c" do final
 * - Remove separador de milhar (.)
 * - Troca vírgula decimal por ponto
 */
export function parseBrazilianNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  
  let cleaned = value.toString().trim();
  
  // Remove aspas
  cleaned = cleaned.replace(/"/g, '');
  
  // Remove "d" ou "c" do final (indicador débito/crédito)
  cleaned = cleaned.replace(/[dc]$/i, '');
  
  // Remove R$ e símbolos de moeda
  cleaned = cleaned.replace(/R\$\s*/gi, '');
  
  // Remove espaços
  cleaned = cleaned.replace(/\s/g, '');
  
  // Handle parentheses as negative: (6.593,46) -> -6593.46
  const isNegative = cleaned.includes('(') && cleaned.includes(')');
  cleaned = cleaned.replace(/[()]/g, '');
  
  // Remove separador de milhar (.) e troca vírgula decimal por ponto
  // Formato brasileiro: 1.234.567,89 -> 1234567.89
  cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  
  return isNegative ? -Math.abs(num) : num;
}

// ============================================
// LEITURA DE ARQUIVOS (CSV, XLS, XLSX)
// ============================================

export async function parseFileToArray(file: File): Promise<string[][]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  if (extension === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        delimiter: ';', // CSV brasileiro usa ponto-e-vírgula
        skipEmptyLines: false, // Não pular linhas - precisamos contar
        complete: (results) => {
          const data = results.data as string[][];
          console.log(`[Parser] CSV carregado: ${data.length} linhas`);
          resolve(data);
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
    console.log(`[Parser] Excel carregado: ${data.length} linhas`);
    return data;
  }
  
  throw new Error('Formato não suportado. Use CSV, XLS ou XLSX.');
}

// ============================================
// TIPOS DE RETORNO
// ============================================

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

// ============================================
// PARSER DE DRE (REGRAS FIXAS)
// ============================================

/**
 * REGRAS OBRIGATÓRIAS DO DRE:
 * - Ignorar linhas 1 a 7 (índices 0 a 6)
 * - Linha 8 (índice 7) contém "Receita Operacional" - ignorar
 * - A partir da linha 9 (índice 8), dados no formato:
 *   ,nome_da_conta,,,, "valor_per" ,,,,, "valor_total"
 * 
 * Extrai: nome_conta, valor_periodo, valor_total
 */
export function parseDREFile(rows: string[][], filename: string): {
  entries: ParsedDREEntry[];
  periodo: string;
  errors: string[];
} {
  const entries: ParsedDREEntry[] = [];
  const errors: string[] = [];
  const periodo = extractPeriod(filename, rows);

  console.log(`[DRE Parser] Iniciando parse de ${rows.length} linhas`);

  // Começa na linha 9 (índice 8)
  const DATA_START_INDEX = 8;

  for (let i = DATA_START_INDEX; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    try {
      // Encontra o nome da conta (primeiro texto não vazio)
      let nomeConta = '';
      let foundText = false;
      
      for (const cell of row) {
        const cellStr = String(cell || '').trim().replace(/"/g, '');
        if (cellStr && !foundText) {
          // Verifica se é texto (não é número)
          const isNumber = /^[\d.,()R$\s-]+d?$/.test(cellStr);
          if (!isNumber) {
            nomeConta = cellStr;
            foundText = true;
            break;
          }
        }
      }

      if (!nomeConta) continue;

      // Encontra os valores numéricos
      const numericValues: number[] = [];
      for (const cell of row) {
        const cellStr = String(cell || '').trim();
        if (!cellStr) continue;
        
        // Verifica se parece um número brasileiro
        const cleanedForCheck = cellStr.replace(/"/g, '').replace(/[dc]$/i, '');
        if (/^[\d.,()R$\s-]+$/.test(cleanedForCheck) && cleanedForCheck.length > 0) {
          const num = parseBrazilianNumber(cellStr);
          // Só adiciona se for um número válido (não 0 de conversão falha)
          if (num !== 0 || cellStr.includes('0')) {
            numericValues.push(num);
          }
        }
      }

      // Precisa ter pelo menos um valor
      if (numericValues.length === 0) continue;

      const valorPeriodo = numericValues[0] || 0;
      const valorTotal = numericValues.length > 1 ? numericValues[1] : null;

      console.log(`[DRE Parser] Linha ${i + 1}: "${nomeConta}" -> periodo: ${valorPeriodo}, total: ${valorTotal}`);

      entries.push({
        descricao: nomeConta,
        valor: valorPeriodo,
        valor_anterior: valorTotal,
        raw_row: row.map(String)
      });

    } catch (err) {
      const errorMsg = `Linha ${i + 1}: ${err instanceof Error ? err.message : 'Erro desconhecido'}`;
      errors.push(errorMsg);
      console.error(`[DRE Parser] ${errorMsg}`);
    }
  }

  console.log(`[DRE Parser] Total de entradas válidas: ${entries.length}`);
  
  if (entries.length === 0) {
    errors.push('Nenhuma entrada válida encontrada no DRE.');
  }

  return { entries, periodo, errors };
}

// ============================================
// PARSER DE BALANÇO PATRIMONIAL (REGRAS FIXAS)
// ============================================

/**
 * REGRAS OBRIGATÓRIAS DO BALANÇO:
 * - Leitura começa na linha 9 (índice 8)
 * - Linha começa com múltiplas vírgulas - ignorar todas
 * - Primeiro texto encontrado após vírgulas = nome da conta
 * - Primeiro número = valor atual
 * - Segundo número = valor anterior
 * 
 * Exemplo:
 * ,,ATIVO,,,,,,,,,,,,,"6.704.423,33d",,,,"5.481.704,59d",,
 */
export function parseBalancoFile(rows: string[][], filename: string): {
  entries: ParsedBalancoEntry[];
  periodo: string;
  errors: string[];
} {
  const entries: ParsedBalancoEntry[] = [];
  const errors: string[] = [];
  const periodo = extractPeriod(filename, rows);
  let currentType = 'OUTRO';
  const hierarchyStack: string[] = [];

  console.log(`[Balanço Parser] Iniciando parse de ${rows.length} linhas`);

  // Começa na linha 9 (índice 8)
  const DATA_START_INDEX = 8;

  for (let i = DATA_START_INDEX; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    try {
      // Conta quantas colunas vazias no início (para hierarquia)
      let emptyCount = 0;
      for (const cell of row) {
        const cellStr = String(cell || '').trim();
        if (cellStr === '' || cellStr === '""') {
          emptyCount++;
        } else {
          break;
        }
      }

      // Encontra o nome da conta (primeiro texto não vazio após as vírgulas)
      let nomeConta = '';
      
      for (const cell of row) {
        const cellStr = String(cell || '').trim().replace(/"/g, '');
        if (!cellStr) continue;
        
        // Verifica se é texto (não é número)
        const isNumber = /^[\d.,()R$\s-]+d?$/.test(cellStr);
        if (!isNumber && cellStr.length > 0) {
          nomeConta = cellStr;
          break;
        }
      }

      if (!nomeConta) continue;

      // Encontra os valores numéricos
      const numericValues: number[] = [];
      for (const cell of row) {
        const cellStr = String(cell || '').trim();
        if (!cellStr) continue;
        
        // Verifica se parece um número brasileiro (com possível "d" no final)
        const cleanedForCheck = cellStr.replace(/"/g, '').replace(/[dc]$/i, '');
        if (/^[\d.,()R$\s-]+$/.test(cleanedForCheck) && cleanedForCheck.length > 0) {
          const num = parseBrazilianNumber(cellStr);
          // Só adiciona se for um número válido
          if (num !== 0 || cellStr.includes('0')) {
            numericValues.push(num);
          }
        }
      }

      // Precisa ter pelo menos um valor
      if (numericValues.length === 0) continue;

      const valorAtual = numericValues[0] || 0;
      const valorAnterior = numericValues.length > 1 ? numericValues[1] : null;

      // Detecta tipo de conta (ATIVO, PASSIVO, PATRIMÔNIO)
      const detectedType = detectAccountType(nomeConta);
      if (detectedType !== 'OUTRO') {
        currentType = detectedType;
      }

      // Constrói hierarquia baseada na indentação
      const level = Math.floor(emptyCount / 2); // Aproximação do nível
      while (hierarchyStack.length > level) {
        hierarchyStack.pop();
      }
      hierarchyStack[level] = nomeConta;
      const hierarchy = hierarchyStack.filter(Boolean).join(' > ');

      console.log(`[Balanço Parser] Linha ${i + 1}: "${nomeConta}" (${currentType}) -> atual: ${valorAtual}, anterior: ${valorAnterior}`);

      entries.push({
        conta: nomeConta,
        tipo: currentType,
        valor: valorAtual,
        valor_anterior: valorAnterior,
        hierarchy,
        raw_row: row.map(String)
      });

    } catch (err) {
      const errorMsg = `Linha ${i + 1}: ${err instanceof Error ? err.message : 'Erro desconhecido'}`;
      errors.push(errorMsg);
      console.error(`[Balanço Parser] ${errorMsg}`);
    }
  }

  console.log(`[Balanço Parser] Total de entradas válidas: ${entries.length}`);

  if (entries.length === 0) {
    errors.push('Nenhuma entrada válida encontrada no Balanço.');
  }

  return { entries, periodo, errors };
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

/**
 * Detecta tipo de conta baseado no nome
 */
function detectAccountType(description: string): string {
  const upper = description.toUpperCase();
  if (upper.startsWith('ATIVO') || upper === 'ATIVO') return 'ATIVO';
  if (upper.startsWith('PASSIVO') || upper === 'PASSIVO') return 'PASSIVO';
  if (upper.includes('PATRIMÔNIO') || upper.includes('PATRIMONIO') || upper === 'PL') return 'PATRIMONIO_LIQUIDO';
  return 'OUTRO';
}

/**
 * Extrai período do nome do arquivo ou conteúdo
 */
function extractPeriod(filename: string, rows: string[][]): string {
  // Tenta extrair do nome do arquivo
  const dateMatch = filename.match(/(\d{2}\/\d{2}\/\d{4}|\d{4})/);
  if (dateMatch) return dateMatch[1];

  // Tenta extrair do conteúdo
  for (const row of rows.slice(0, 10)) {
    const text = row.join(' ');
    const match = text.match(/(\d{2}\/\d{2}\/\d{4}|\d{4})/);
    if (match) return match[1];
  }

  return new Date().getFullYear().toString();
}
