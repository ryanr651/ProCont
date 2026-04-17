import * as XLSX from "xlsx";
import Papa from "papaparse";
import { BIFFCell, parseBIFF8CellsFromXls } from "./biff8Parser";
function extrairValorDaLinha(
  numerosDetectados: { value: number; raw: string }[],
  context?: BalancoSectionType,
): number | null {
  if (!numerosDetectados || numerosDetectados.length === 0) {
    return null;
  }

  // REGRA CONTÁBIL: valor do período = ÚLTIMO número à direita
  const last = numerosDetectados[numerosDetectados.length - 1];
  const parsed = parseBrazilianNumber(last.raw, context);

  if (typeof parsed !== "number" || isNaN(parsed)) {
    return null;
  }
  debugContabil("EXTRAÇÃO DE VALOR", {
    escolhido: last,
    parsed,
  });
  return roundTo2Decimals(parsed);
}
function debugContabil(label: string, payload: any) {
  console.log("%c[DEBUG CONTÁBIL]", "color:#0ea5e9;font-weight:bold", label, JSON.stringify(payload, null, 2));
}
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
  isBold?: boolean;
}

export interface ParsedDREEntry {
  descricao: string;
  grupo: string;
  valor: number;
  valor_anterior: number | null;
  raw_row: string[];
  isCMV?: boolean;
}

export interface ParsedBalancoEntry {
  conta: string;
  tipo: string;
  valor: number;
  valor_anterior: number | null;
  hierarchy: string;
  raw_row: string[];
  indent_level?: number;
  is_bold?: boolean;
  is_redutora?: boolean;
  /** Natureza contábil do saldo lido do arquivo: "D" (devedora) ou "C" (credora) */
  natureza?: "D" | "C" | null;
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
  receitaBruta: number;
  receitaBrutaOrigem: "linha_explicita" | "soma_contas";
  receitaLiquida: number;
  receitaLiquidaOrigem: "linha_explicita" | "soma_contas";
  cmv: number;
  cmvOrigem: "linha_explicita" | "soma_contas";
  lucroBruto: number;
  lucroBrutoOrigem: "linha_explicita" | "soma_contas";
  despesasOperacionais: number;
  despesasOperacionaisOrigem: "linha_explicita" | "soma_contas";
  lucroOperacional: number;
  lucroOperacionalOrigem: "linha_explicita" | "soma_contas";
  resultadoFinanceiro: number;
  resultadoFinanceiroOrigem: "linha_explicita" | "soma_contas";
  lucroLiquido: number;
  lucroLiquidoOrigem: "linha_explicita" | "soma_contas";
}

export interface BalancoParseResult {
  entries: ParsedBalancoEntry[];
  metrics: BalancoMetrics;
  periodo: string;
  errors: string[];
  parsed: boolean;
  validationRows?: ValidationRow[];
}

export interface DREParseResult {
  entries: ParsedDREEntry[];
  periodo: string;
  errors: string[];
  parsed: boolean;
}

// Validação linha a linha
export interface ValidationRow {
  rowIndex: number;
  textoConta: string;
  numerosDetectados: { value: number; raw: string }[];
  classificacao?: string;
  secaoAtual?: string;
  alerta?: string;
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
 * REGRA 1: Arredondar para exatamente 2 casas decimais
 * Nunca truncar, sempre arredondar
 */
function roundTo2Decimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Parse Brazilian number format with D/C (Debit/Credit) handling
 * REGRA CONTÁBIL:
 * - ATIVO: D = soma (positivo), C = subtrai (negativo)
 * - PASSIVO/PL: C = soma (positivo), D = subtrai (negativo)
 */
export function parseBrazilianNumber(value: string | number | undefined | null, context?: BalancoSectionType): number {
  if (value === undefined || value === null || value === "") return NaN;
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
    // Detectar formato: BR (1.234.567,89) vs US (1,234,567.89)
    // Heurística: se tem vírgula E ponto, o último separador é o decimal.
    // Se só tem vírgula => decimal BR. Se só tem ponto(s) com mais de um ponto => milhar BR sem decimal.
    const hasComma = cleaned.includes(",");
    const hasDot = cleaned.includes(".");
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");

    if (hasComma && hasDot) {
      if (lastComma > lastDot) {
        // BR: 1.234.567,89 -> remove pontos, vírgula vira ponto
        cleaned = cleaned.replace(/\./g, "").replace(",", ".");
      } else {
        // US: 1,234,567.89 -> remove vírgulas
        cleaned = cleaned.replace(/,/g, "");
      }
    } else if (hasComma) {
      // Só vírgula: assumir decimal BR (ex: "1234,56")
      // Mas se houver múltiplas vírgulas, são milhares US sem decimal: "1,234,567"
      const commaCount = (cleaned.match(/,/g) || []).length;
      if (commaCount > 1) {
        cleaned = cleaned.replace(/,/g, "");
      } else {
        cleaned = cleaned.replace(",", ".");
      }
    } else if (hasDot) {
      // Só pontos: se múltiplos, são milhares BR ("1.234.567"); se único, pode ser decimal
      const dotCount = (cleaned.match(/\./g) || []).length;
      if (dotCount > 1) {
        cleaned = cleaned.replace(/\./g, "");
      }
      // único ponto: já tratado por isPureNumeric acima
    }
  }

  let num = parseFloat(cleaned);
  if (isNaN(num)) return NaN;

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
  if (value === undefined || value === null || value === "") return NaN;
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
  if (isNaN(num)) return NaN;

  return isNegativeParens ? -Math.abs(num) : num;
}

/**
 * Check if a cell value looks like a number (with Brazilian format)
 */
function isNumericCell(value: string | number): boolean {
  if (typeof value === "number") return true;
  if (!value || value.toString().trim() === "") return false;

  const cleaned = value
    .toString()
    .trim()
    .replace(/^[\"']|[\"']$/g, "");

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

/**
 * Parser XLS/XLSX ESPECÍFICO PARA DRE
 * Regras:
 * 1. Usar XLSX.read com cellFormula: false, cellText: false
 * 2. Usar XLSX.utils.sheet_to_json com header: 1, defval: null
 * 3. Trabalhar com índices fixos de coluna
 * 4. O texto da conta é o primeiro campo string não vazio
 * 5. O valor do período é o primeiro valor numérico válido após o texto
 * 6. O valor anterior é o próximo valor numérico após o valor atual
 * 7. Normalizar números brasileiros corretamente
 */
/**
 * Parser DRE: Lê o arquivo e classifica as contas baseada no layout Procont/Excel
 */
// ============= PARSER DRE CORRIGIDO (CMV FUNCIONAL) =============

async function parseDREFromXLSFile(file: File): Promise<DREParseResult> {
  debugLog("=== Iniciando Processamento DRE (CMV Blindado) ===", file.name);

  try {
    const rows = await parseXLSFile(file);
    const entries: ParsedDREEntry[] = [];

    // VARIÁVEIS DE ESTADO
    let isInsideCMVBlock = false;
    let foundReceitaLiquida = false;
    let isInsideReceitaBrutaBlock = false;
    let isInsideResultadoFinanceiroBlock = false;
    let startRowIndex = 0;

    // 1. ENCONTRAR ÂNCORA DE INÍCIO (Ignora cabeçalho até encontrar DEMONSTRACAO ou RECEITA)
    for (let i = 0; i < rows.length; i++) {
      const { text } = safeGetFirstText(rows[i]);
      const norm = normalizeText(text);
      if (norm.includes("DEMONSTRACAO") || norm.includes("RECEITA OPERACIONAL")) {
        startRowIndex = i;
        debugLog("Âncora encontrada na linha:", i);
        break;
      }
    }

    // Se não achou âncora, começa da linha 5 por segurança
    if (startRowIndex === 0) startRowIndex = Math.min(5, rows.length - 1);

    // 2. PROCESSAR LINHAS A PARTIR DA ÂNCORA
    for (let i = startRowIndex; i < rows.length; i++) {
      const row = rows[i];
      const { text: conta } = safeGetFirstText(row);

      // Ignora linhas vazias ou muito curtas
      if (!conta || conta.length < 2) continue;

      const normalConta = normalizeText(conta);

      // === Detecções de seção ===
      const isReceitaOperacional = /RECEITA\s*OPERACIONAL/i.test(normalConta);
      const isReceitaLiquida = /RECEITA\s*LIQUIDA/i.test(normalConta);
      const isLucroBruto = /LUCRO\s*BRUTO|RESULTADO\s*BRUTO/i.test(normalConta);

      // Tenta extrair valores da linha (precisa antes para checar título sem valor)
      const valores = getNumericValuesRightOfText(row);
      const temValor = valores.length > 0;

      // === BLOCO RECEITA BRUTA ===
      if (isReceitaOperacional && !temValor) {
        isInsideReceitaBrutaBlock = true;
        debugLog("🟢 Bloco Receita Bruta Ativado (título Receita Operacional): " + conta);
      } else if (isInsideReceitaBrutaBlock && isReceitaLiquida) {
        isInsideReceitaBrutaBlock = false;
        debugLog("🔴 Bloco Receita Bruta Fechado (Receita Líquida detectada): " + conta);
      }

      // === BLOCO CMV ===

      // Fechar bloco CMV ANTES de processar Lucro Bruto
      if (isLucroBruto && isInsideCMVBlock) {
        isInsideCMVBlock = false;
        debugLog("🔴 Saiu do bloco CMV (Lucro Bruto detectado): " + conta);
      }

      // Marcar que passou pela Receita Líquida
      // Marcar que passou pela Receita Líquida
      if (isReceitaLiquida) {
        foundReceitaLiquida = true;
        debugLog("📌 Receita Líquida encontrada, CMV será ativado na próxima conta");
      }

      // Ativar bloco CMV: qualquer linha após Receita Líquida (e antes de Lucro Bruto)
      // Só ativa se a linha atual NÃO for Lucro Bruto E tiver valor (conta analítica de custo)
      if (foundReceitaLiquida && !isInsideCMVBlock && !isReceitaLiquida && !isLucroBruto && temValor) {
        isInsideCMVBlock = true;
        foundReceitaLiquida = false;
        debugLog("🟢 Bloco CMV Ativado (após Receita Líquida): " + conta);
      } else if (foundReceitaLiquida && isLucroBruto) {
        // Lucro Bruto imediatamente após Receita Líquida = sem CMV (empresa de serviços pura)
        foundReceitaLiquida = false;
        debugLog("⏭️ Lucro Bruto logo após Receita Líquida: sem CMV, bloco ignorado");
      }

      // === BLOCO RESULTADO FINANCEIRO ===
      const isFinanceiroHeader =
        /DESPESAS?\s*FINANCEIRA|RECEITAS?\s*FINANCEIRA|RESULTADO\s*FINANCEIRO|DESPESAS?\s*TRIBUTARIA/i.test(
          normalConta,
        );

      // Fechar bloco financeiro se encontrar outro título de seção (sem valor) OU subtotais principais (com valor)
      const isSubtotalPrincipal =
        /RESULTADO\s*(OPERACIONAL|ANTES|DO\s*EXERCICIO)|LUCRO\s*(OPERACIONAL|LIQUIDO|BRUTO)|CONTRIBUICAO\s*SOCIAL|CSLL|IRPJ|IMPOSTO\s*DE\s*RENDA/i.test(
          normalConta,
        );
      if (isInsideResultadoFinanceiroBlock && !isFinanceiroHeader) {
        if ((!temValor && conta.length >= 2) || isSubtotalPrincipal) {
          isInsideResultadoFinanceiroBlock = false;
          debugLog(
            "🔴 Bloco Resultado Financeiro Fechado (" +
              (isSubtotalPrincipal ? "subtotal principal" : "novo título") +
              "): " +
              conta,
          );
        }
      }

      // Abrir bloco financeiro
      if (isFinanceiroHeader && !temValor) {
        isInsideResultadoFinanceiroBlock = true;
        debugLog("🟢 Bloco Resultado Financeiro Ativado: " + conta);
      }

      if (temValor) {
        // REGRA: Pegar o PRIMEIRO valor numérico (valor do período atual)
        // O segundo valor (se existir) é o valor anterior
        const valorAtual = valores[0].value;
        const valorAnterior = valores.length > 1 ? valores[1].value : null;

        let grupo = "OUTROS";

        // 1. Se estamos dentro do bloco CMV, a prioridade é total
        if (isInsideCMVBlock) {
          grupo = "CMV";
        }
        // 2. Se estamos dentro do bloco Receita Bruta, forçar classificação
        // Apenas valores positivos são Receita Bruta; negativos são Despesas Operacionais
        // Valores positivos são Receita Bruta; negativos são Deduções (ex: Simples Nacional)
        else if (isInsideReceitaBrutaBlock) {
          grupo = valorAtual >= 0 ? "RECEITA_BRUTA" : "DEDUCOES";
        }
        // 3. Se estamos dentro do bloco Resultado Financeiro
        else if (isInsideResultadoFinanceiroBlock) {
          grupo = "RESULTADO_FINANCEIRO";
        }
        // 4. Se não, aplica as regras normais
        else {
          if (normalConta.includes("RECEITA LIQUIDA")) {
            grupo = "RECEITA_LIQUIDA";
          } else if (normalConta.includes("RECEITA BRUTA")) {
            grupo = "RECEITA_BRUTA";
          } else if (
            normalConta.includes("IMPOSTOS") ||
            normalConta.includes("DEVOLUCOES") ||
            normalConta.includes("SIMPLES NACIONAL")
          ) {
            grupo = "DEDUCOES";
          } else if (normalConta.includes("LUCRO BRUTO")) {
            grupo = "LUCRO_BRUTO";
          } else if (
            normalConta.includes("DESPESAS") ||
            normalConta.includes("SALARIOS") ||
            normalConta.includes("ALUGUEL")
          ) {
            grupo = "DESPESAS_OPERACIONAIS";
          } else if (normalConta.includes("NAO OPERACIONAL")) {
            grupo = "RESULTADO_FINANCEIRO";
          } else if (normalConta.includes("PROVISAO") || normalConta.includes("PROVISÃO")) {
            grupo = "PROVISOES";
          } else if (normalConta.startsWith("RESULTADO")) {
            // Contas que começam com "RESULTADO" → CONTAS_RESULTADO (antes de CSLL/IR)
            grupo = "CONTAS_RESULTADO";
          } else if (normalConta.includes("CONTRIBUICAO SOCIAL") || normalConta.includes("CSLL")) {
            grupo = "CONTRIBUICAO_SOCIAL";
          } else if (
            normalConta.includes("IRPJ") ||
            normalConta.includes("IMPOSTO DE RENDA") ||
            normalConta === "IR" ||
            normalConta.includes(" IR ") ||
            normalConta.endsWith(" IR")
          ) {
            grupo = "IR";
          } else if (normalConta.includes("LUCRO LIQUIDO") || normalConta.includes("RESULTADO DO EXERCICIO")) {
            grupo = "LUCRO_LIQUIDO";
          }
        }

        // Adiciona a linha processada
        entries.push({
          descricao: conta,
          grupo: grupo,
          valor: valorAtual,
          valor_anterior: valorAnterior,
          raw_row: row.cells,
          isCMV: isInsideCMVBlock, // Passa a flag para o debug/frontend
        });
      }

      // Bloco CMV é fechado ANTES do Lucro Bruto (já tratado acima)
    }

    return {
      entries,
      periodo: "Extraído do Arquivo",
      errors: [],
      parsed: entries.length > 0,
    };
  } catch (error) {
    debugLog("Erro crítico no parser DRE:", error);
    return { entries: [], periodo: "", errors: ["Falha ao processar arquivo"], parsed: false };
  }
}
async function parseXLSFile(file: File): Promise<XLSRow[]> {
  const extension = getFileExtension(file.name);
  debugLog("=== Usando fluxo XLS/XLSX UNIFICADO (matriz JSON) para:", file.name);

  try {
    const buffer = await file.arrayBuffer();

    // NOVA ABORDAGEM: Converter QUALQUER arquivo (XLS ou XLSX) para matriz JSON limpa primeiro
    // Isso evita problemas de formatação de XLS legados (Domínio, PROCONT, etc.)

    let workbook: XLSX.WorkBook | null = null;
    let sheet: XLSX.WorkSheet | null = null;

    // Tentar múltiplas estratégias de leitura
    const readStrategies: Array<{ type: "binary" | "array" | "buffer"; opts: Partial<XLSX.ParsingOptions> }> = [
      { type: "binary", opts: { cellFormula: false, cellText: false, raw: true, sheetStubs: true, cellStyles: true } },
      { type: "binary", opts: { codepage: 1252, raw: true, sheetStubs: true, cellStyles: true } },
      { type: "binary", opts: { WTF: true, sheetStubs: true, cellStyles: true } },
      { type: "array", opts: { raw: true, sheetStubs: true, cellStyles: true } },
      { type: "binary", opts: { cellStyles: true } },
      { type: "array", opts: { cellStyles: true } },
    ];

    for (const strategy of readStrategies) {
      try {
        let inputData: ArrayBuffer | Uint8Array | string;

        if (strategy.type === "binary") {
          // Converter para binary string
          const uint8Array = new Uint8Array(buffer);
          let binaryString = "";
          for (let i = 0; i < uint8Array.length; i++) {
            binaryString += String.fromCharCode(uint8Array[i]);
          }
          inputData = binaryString;
        } else {
          inputData = buffer;
        }

        workbook = XLSX.read(inputData, { type: strategy.type, ...strategy.opts });

        if (workbook?.SheetNames?.length > 0) {
          const sheetName = workbook.SheetNames[0];
          sheet = workbook.Sheets[sheetName];
          if (sheet) {
            debugLog(`Leitura bem-sucedida com estratégia: ${strategy.type}`, strategy.opts);
            break;
          }
        }
      } catch (e) {
        debugLog(`Estratégia ${strategy.type} falhou:`, e);
      }
    }

    if (!sheet) {
      debugLog("Nenhuma sheet encontrada após todas as tentativas");

      // FALLBACK: Tentar BIFF8 manual parser para XLS muito antigos
      if (extension === "xls" && workbook) {
        const strings = (workbook as any)?.Strings || [];
        const stringValues: string[] = strings.map((str: any) =>
          typeof str === "object" && str?.t ? str.t : String(str || ""),
        );

        const biffCells = parseBIFF8CellsFromXls(buffer, stringValues);
        if (biffCells.length > 0) {
          const biffRows = biffCellsToXLSRows(biffCells);
          if (biffRows.length > 0) {
            debugLog("BIFF8 manual parser SUCCESS: " + biffRows.length + " rows");
            return biffRows;
          }
        }
      }

      return [];
    }

    // ===== EXTRACT BOLD FORMATTING =====
    // Build a set of row indices that have bold cells (for synthetic detection)
    const boldRows = new Set<number>();
    try {
      const sheetRef = sheet["!ref"];
      if (sheetRef) {
        const range = XLSX.utils.decode_range(sheetRef);
        for (let r = range.s.r; r <= range.e.r; r++) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ r, c });
            const cell = sheet[addr];
            if (cell?.s?.font?.bold || cell?.s?.bold) {
              boldRows.add(r);
              break; // One bold cell in the row is enough
            }
          }
        }
      }
      debugLog(`Bold rows detected: ${boldRows.size}`);
    } catch (e) {
      debugLog("Bold detection failed (non-critical):", e);
    }

    // ===== ETAPA PRINCIPAL: Converter para matriz JSON limpa =====
    // Esta é a mudança central: usar sheet_to_json com header: 1 e defval: ''
    // Isso normaliza QUALQUER formato (XLS legado, XLSX, etc.) para uma matriz uniforme

    const jsonMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "", // Células vazias viram string vazia (não null/undefined)
      raw: true, // Preservar tipos numéricos quando possível
      blankrows: false,
    }) as unknown[][];

    // ===== Matriz formatada (texto exibido) — captura sufixos como "d"/"c" do número =====
    // Necessária porque com raw:true perdemos a formatação contábil (ex: "56.696.435,46d")
    const formattedMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    }) as unknown[][];

    debugLog(`Matriz JSON extraída: ${jsonMatrix.length} linhas`);

    if (!jsonMatrix || jsonMatrix.length === 0) {
      debugLog("Matriz JSON vazia, tentando extração célula por célula...");
      return extractCellByCell(sheet);
    }

    // ===== Converter matriz JSON para XLSRow[] =====
    const rows = convertMatrixToXLSRows(jsonMatrix, boldRows, formattedMatrix);
    const totalNumeric = rows.reduce((acc, r) => acc + (r.numericValues?.length || 0), 0);

    debugLog(`Conversão para XLSRow: ${rows.length} linhas, ${totalNumeric} valores numéricos`);

    // Se XLS retornou 0 números, tentar BIFF8 como fallback
    if (extension === "xls" && totalNumeric === 0 && workbook) {
      debugLog("XLS retornou 0 números via matriz JSON; tentando BIFF8 fallback...");

      const strings = (workbook as any)?.Strings || [];
      const stringValues: string[] = strings.map((str: any) =>
        typeof str === "object" && str?.t ? str.t : String(str || ""),
      );

      const biffCells = parseBIFF8CellsFromXls(buffer, stringValues);
      if (biffCells.length > 0) {
        const biffRows = biffCellsToXLSRows(biffCells);
        if (biffRows.length > 0) {
          debugLog("BIFF8 fallback SUCCESS: " + biffRows.length + " rows");
          return biffRows;
        }
      }
    }

    return rows;
  } catch (error) {
    debugLog("ERRO CRÍTICO ao processar XLS/XLSX:", error);
    return [];
  }
}

/**
 * Converte matriz JSON (de sheet_to_json) para XLSRow[]
 * Esta função processa a matriz limpa e extrai texto + valores numéricos
 */
function convertMatrixToXLSRows(
  matrix: unknown[][],
  boldRows?: Set<number>,
  formattedMatrix?: unknown[][],
): XLSRow[] {
  const rows: XLSRow[] = [];

  let matrixRowIdx = 0;
  for (const rowData of matrix) {
    const currentMatrixRow = matrixRowIdx++;
    if (!Array.isArray(rowData)) continue;

    const formattedRow = formattedMatrix?.[currentMatrixRow];
    const formattedRowArr = Array.isArray(formattedRow) ? formattedRow : null;

    // Verificar se a linha tem conteúdo
    const hasContent = rowData.some(
      (cell) =>
        (typeof cell === "string" && cell.trim().length > 0) || (typeof cell === "number" && Number.isFinite(cell)),
    );
    if (!hasContent) continue;

    const cells: string[] = [];
    let firstText: { text: string; index: number } = { text: "", index: -1 };
    const numericValues: { value: number; raw: string }[] = [];

    for (let colIdx = 0; colIdx < rowData.length; colIdx++) {
      const rawCell = rowData[colIdx];

      // Texto formatado da MESMA célula (preserva sufixo "d"/"c" se houver)
      const formattedCell = formattedRowArr ? formattedRowArr[colIdx] : undefined;
      const formattedStr =
        typeof formattedCell === "string"
          ? formattedCell.trim()
          : formattedCell != null
            ? String(formattedCell).trim()
            : "";

      // Número direto do Excel
      if (typeof rawCell === "number" && Number.isFinite(rawCell)) {
        // Preferir o texto formatado para preservar o sufixo D/C; fallback para o número
        const rawForParser =
          formattedStr && /[dcDC]\s*$/.test(formattedStr) ? formattedStr : String(rawCell);
        cells.push(rawForParser);
        numericValues.push({ value: rawCell, raw: rawForParser });
        continue;
      }

      // String (pode ser texto ou número formatado BR)
      const cellValue = typeof rawCell === "string" ? rawCell.trim() : String(rawCell ?? "");
      cells.push(cellValue);

      // Detectar primeiro texto válido
      if (firstText.index === -1 && isTextCell(cellValue)) {
        firstText = { text: cellValue.trim(), index: colIdx };
      }

      // Tentar parsear como número (formato brasileiro)
      if (cellValue && isNumericCell(cellValue)) {
        const parsed = parseSimpleBrazilianNumber(cellValue);
        if (Number.isFinite(parsed)) {
          numericValues.push({ value: parsed, raw: cellValue });
        }
      }
    }

    rows.push({
      cells,
      firstTextCell: firstText,
      numericValues,
      isBold: boldRows?.has(currentMatrixRow) || false,
    });
  }

  return rows;
}

/**
 * Extrai dados célula por célula da sheet, incluindo valores formatados
 */
function extractCellByCell(sheet: XLSX.WorkSheet): XLSRow[] {
  const sheetRef = sheet["!ref"];
  if (!sheetRef) return [];

  const range = XLSX.utils.decode_range(sheetRef);
  const rows: XLSRow[] = [];

  debugLog(`Cell-by-cell range: R${range.s.r}-${range.e.r}, C${range.s.c}-${range.e.c}`);

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
        // Tentar obter valor numérico direto
        if (typeof cell.v === "number") {
          numericValue = cell.v;
          cellValue = String(cell.v);
        }
        // Se tiver valor formatado (w), usar também
        else if (cell.w !== undefined) {
          cellValue = String(cell.w).trim();
          // Tentar parsear como número
          if (isNumericCell(cellValue)) {
            numericValue = parseSimpleBrazilianNumber(cellValue);
          }
        }
        // Fallback para valor raw
        else if (cell.v !== undefined && cell.v !== null) {
          cellValue = String(cell.v).trim();
          if (isNumericCell(cellValue)) {
            numericValue = parseSimpleBrazilianNumber(cellValue);
          }
        }
      }

      cells.push(cellValue);

      if (firstText.index === -1 && isTextCell(cellValue)) {
        firstText = { text: cellValue.trim(), index: colIdx };
      }

      if (numericValue !== null && Number.isFinite(numericValue) && numericValue !== 0) {
        numericValues.push({ value: numericValue, raw: cellValue });
      }
    }

    if (cells.some((c) => c.trim() !== "") || numericValues.length > 0) {
      rows.push({ cells, firstTextCell: firstText, numericValues });
    }
  }

  return rows;
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

    const hasContent = rowData.some(
      (cell) => (typeof cell === "string" && cell.trim().length > 0) || typeof cell === "number",
    );
    if (!hasContent) continue;

    const cells: string[] = [];
    let firstText = { text: "", index: -1 };
    const numericValues: { value: number; raw: string }[] = [];

    for (let colIdx = 0; colIdx < rowData.length; colIdx++) {
      const rawCell = rowData[colIdx];

      if (typeof rawCell === "number") {
        const cellValue = String(rawCell);
        cells.push(cellValue);
        numericValues.push({ value: rawCell, raw: cellValue });
        continue;
      }

      const cellValue = typeof rawCell === "string" ? rawCell.trim() : String(rawCell ?? "");
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

function getNumericValuesRightOfText(row: XLSRow): { value: number; raw: string; col: number }[] {
  const textCell = safeGetFirstText(row);
  if (!row.cells || textCell.index === -1) return [];

  const values: { value: number; raw: string; col: number }[] = [];

  for (let col = textCell.index + 1; col < row.cells.length; col++) {
    const cell = row.cells[col];
    if (typeof cell === "string" && isNumericCell(cell)) {
      values.push({
        value: parseSimpleBrazilianNumber(cell),
        raw: cell,
        col,
      });
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
  const validationRows: ValidationRow[] = [];
  const periodo = extractPeriodFromRows(rows?.map((r) => safeGetCells(r)) || [], filename);

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
    return { entries, metrics, periodo, errors, parsed: false, validationRows };
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

  // Flag para garantir que só o PRIMEIRO CIRCULANTE na seção ATIVO seja usado
  let foundAtivoCirculante = false;
  let foundPassivoCirculante = false;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const { text: conta, index: textIndex } = safeGetFirstText(row);

    if (!conta || conta.length < 2) continue;

    const normalConta = normalizeText(conta);

    // Skip headers
    if (
      normalConta.includes("DESCRICAO") ||
      normalConta === "CONTA" ||
      normalConta.includes("EMPRESA") ||
      normalConta.includes("CNPJ")
    ) {
      continue;
    }

    // Get numeric values WITHIN THIS ROW ONLY
    // Regra: usar o valor mais à direita (último) como valor do período corrente
    // e o anterior (penúltimo) como valor_anterior.
    const numericRight = getNumericValuesRightOfText(row);

    debugContabil("NUMÉRICOS À DIREITA DO TEXTO", {
      rowIndex: i,
      conta,
      secaoAtual: currentSection,
      numerosDetectados: numericRight.map((v) => ({
        col: v.col,
        raw: v.raw,
        parsed: parseBrazilianNumber(v.raw, currentSection),
      })),
    });
    // último valor à direita = período atual
    const valorLinha = extrairValorDaLinha(
      numericRight.map((v) => ({ value: v.value, raw: v.raw })),
      currentSection,
    );

    const valorAnterior =
      numericRight.length > 1
        ? roundTo2Decimals(parseBrazilianNumber(numericRight[numericRight.length - 2].raw, currentSection))
        : null;

    // Se não existe valor NA LINHA, não inventar
    const validationRow: ValidationRow = {
      rowIndex: i,
      textoConta: conta,
      numerosDetectados: numericRight.map((v) => ({
        value: v.value,
        raw: v.raw,
      })),
      secaoAtual: currentSection,
    };

    // Se não existe valor NA LINHA, não inventar
    if (valorLinha === null || Number.isNaN(valorLinha)) {
      validationRow.alerta = "Sem valor na linha";
      validationRows.push(validationRow);
      continue;
    }

    const valor = valorLinha;

    let tipoEntry: BalancoTipoCompleto = currentTipo;

    // === DETECÇÃO DE SEÇÃO E CLASSIFICAÇÃO ===

    if (normalConta === "ATIVO") {
      console.log("=== ATIVO DETECTADO ===");
      console.log("Linha:", i, "| valor:", valor);
      currentSection = "ATIVO";
      currentTipo = "ATIVO_CIRCULANTE";
      tipoEntry = "ATIVO_TOTAL";
      foundAtivoCirculante = false; // Reset para nova seção ATIVO

      if (valor !== 0) {
        metrics.ativoTotal = roundTo2Decimals(Math.abs(valor));
        console.log("→ metrics.ativoTotal =", metrics.ativoTotal);
      }
    } else if (normalConta === "PASSIVO") {
      console.log("=== PASSIVO DETECTADO ===");
      console.log("Linha:", i, "| valor:", valor);
      console.log("foundAtivoCirculante neste momento:", foundAtivoCirculante);
      currentSection = "PASSIVO";
      currentTipo = "PASSIVO_CIRCULANTE";
      tipoEntry = "PASSIVO_TOTAL";
      foundPassivoCirculante = false; // Reset para nova seção PASSIVO

      if (valor !== 0) {
        metrics.passivoTotal = roundTo2Decimals(Math.abs(valor));
        console.log("→ metrics.passivoTotal =", metrics.passivoTotal);
      }
    } else if (normalConta === "CIRCULANTE" || normalConta.startsWith("CIRCULANTE")) {
      // LOG DETALHADO PARA DEBUG
      debugContabil("CIRCULANTE DETECTADO", {
        rowIndex: i,
        conta,
        currentSection,
        currentTipoAntes: currentTipo,
        foundAtivoCirculante,
        foundPassivoCirculante,
        numeros: numericRight.map((v) => v.raw),
        valorCalculado: valor,
      });

      // CIRCULANTE genérico - usar currentSection para determinar
      if (currentSection === "ATIVO" && !foundAtivoCirculante) {
        // PRIMEIRO CIRCULANTE na seção ATIVO = ATIVO_CIRCULANTE
        currentTipo = "ATIVO_CIRCULANTE";
        tipoEntry = "ATIVO_CIRCULANTE";
        foundAtivoCirculante = true;
        console.log("→ Classificado como ATIVO_CIRCULANTE");

        if (valor !== 0) {
          metrics.ativoCirculante = roundTo2Decimals(Math.abs(valor));
          console.log("→ metrics.ativoCirculante =", metrics.ativoCirculante);
        }
      } else if (currentSection === "PASSIVO" && !foundPassivoCirculante) {
        // PRIMEIRO CIRCULANTE na seção PASSIVO = PASSIVO_CIRCULANTE
        currentTipo = "PASSIVO_CIRCULANTE";
        tipoEntry = "PASSIVO_CIRCULANTE";
        foundPassivoCirculante = true;
        console.log("→ Classificado como PASSIVO_CIRCULANTE");

        if (valor !== 0) {
          metrics.passivoCirculante = roundTo2Decimals(Math.abs(valor));
          console.log("→ metrics.passivoCirculante =", metrics.passivoCirculante);
        }
      } else {
        // Já encontrou o CIRCULANTE desta seção, herda tipo atual
        tipoEntry = currentTipo;
        console.log("→ Já encontrou circulante desta seção, herdando tipo:", currentTipo);
      }
    } else if (normalConta === "ATIVO CIRCULANTE") {
      currentTipo = "ATIVO_CIRCULANTE";
      tipoEntry = "ATIVO_CIRCULANTE";
      foundAtivoCirculante = true;

      if (valor !== 0) {
        metrics.ativoCirculante = roundTo2Decimals(Math.abs(valor));
        debugLog("ATIVO CIRCULANTE (explícito):", metrics.ativoCirculante);
      }
    } else if (normalConta === "PASSIVO CIRCULANTE") {
      currentTipo = "PASSIVO_CIRCULANTE";
      tipoEntry = "PASSIVO_CIRCULANTE";
      foundPassivoCirculante = true;

      if (valor !== 0) {
        metrics.passivoCirculante = roundTo2Decimals(Math.abs(valor));
        debugLog("PASSIVO CIRCULANTE (explícito):", metrics.passivoCirculante);
      }
    } else if (
      normalConta === "ATIVO NAO CIRCULANTE" ||
      (normalConta === "NAO CIRCULANTE" && currentSection === "ATIVO")
    ) {
      currentTipo = "ATIVO_NAO_CIRCULANTE";
      tipoEntry = "ATIVO_NAO_CIRCULANTE";

      if (valor !== 0) {
        metrics.ativoNaoCirculante = roundTo2Decimals(Math.abs(valor));
        debugLog("ATIVO NAO CIRCULANTE (do arquivo):", metrics.ativoNaoCirculante);
      }
    } else if (
      normalConta === "PASSIVO NAO CIRCULANTE" ||
      (normalConta === "NAO CIRCULANTE" && currentSection === "PASSIVO")
    ) {
      currentTipo = "PASSIVO_NAO_CIRCULANTE";
      tipoEntry = "PASSIVO_NAO_CIRCULANTE";

      if (valor !== 0) {
        metrics.passivoNaoCirculante = roundTo2Decimals(Math.abs(valor));
        debugLog("PASSIVO NAO CIRCULANTE (do arquivo):", metrics.passivoNaoCirculante);
      }
    } else if (normalConta === "PATRIMONIO LIQUIDO" || normalConta.includes("PATRIMONIO LIQUIDO")) {
      currentSection = "PL";
      currentTipo = "PATRIMONIO_LIQUIDO";
      tipoEntry = "PATRIMONIO_LIQUIDO";

      if (valor !== 0) {
        metrics.patrimonioLiquido = roundTo2Decimals(Math.abs(valor));
        debugLog("PATRIMONIO LIQUIDO (do arquivo):", metrics.patrimonioLiquido);
      }
    } else {
      tipoEntry = currentTipo;
    }

    // Atualizar validação com classificação
    validationRow.classificacao = tipoEntry;
    validationRow.secaoAtual = currentSection;

    // Detectar alertas
    const hasNumeric = numericRight.length > 0;

    if (!hasNumeric && !validationRow.alerta) {
      validationRow.alerta = "Sem valor na linha";
    }

    validationRows.push(validationRow);

    // Criar entry se tiver valor
    if (valor !== 0 || (valorAnterior !== null && valorAnterior !== 0)) {
      const level = textIndex >= 0 ? textIndex : 0;

      // Detect contra accounts (redutoras): depreciação, amortização, exaustão, PDD
      const isRedutora =
        /DEPRECIA[CÇ]/i.test(normalConta) ||
        /AMORTIZA[CÇ]/i.test(normalConta) ||
        /EXAUSTAO/i.test(normalConta) ||
        /PROVISAO.*DEVED/i.test(normalConta) ||
        /PDD/i.test(normalConta) ||
        normalConta.startsWith("(-)") ||
        conta.trim().startsWith("(-)");

      debugContabil("GRAVAÇÃO ENTRY", {
        rowIndex: i,
        conta,
        tipoEntry,
        secaoFinal: currentSection,
        valor,
        valorAnterior,
        isRedutora,
      });

      // Detectar natureza (D/C) a partir do sufixo da raw cell do valor atual (último à direita)
      // Prioridade: sufixo "d"/"c" explícito > sinal bruto da string original > inferência por seção
      let natureza: "D" | "C" | null = null;
      const rawAtual =
        numericRight.length > 0 ? String(numericRight[numericRight.length - 1].raw || "").trim() : "";
      if (/[dD]\s*$/.test(rawAtual)) natureza = "D";
      else if (/[cC]\s*$/.test(rawAtual)) natureza = "C";

      if (!natureza && rawAtual) {
        // Olhar o sinal BRUTO da string original (antes de qualquer inversão por seção)
        const cleanedRaw = rawAtual.replace(/R\$\s*/gi, "").replace(/\s/g, "");
        const isRawNegative = cleanedRaw.startsWith("-") || /^\(.*\)$/.test(cleanedRaw);
        if (currentSection === "ATIVO") natureza = isRawNegative ? "C" : "D";
        else if (currentSection === "PASSIVO" || currentSection === "PL")
          natureza = isRawNegative ? "D" : "C";
      }

      entries.push({
        conta,
        tipo: tipoEntry,
        valor: roundTo2Decimals(Math.abs(valor)),
        valor_anterior: valorAnterior !== null ? roundTo2Decimals(Math.abs(valorAnterior)) : null,
        hierarchy: conta,
        raw_row: safeGetCells(row),
        indent_level: level,
        is_bold: row.isBold || false,
        is_redutora: isRedutora,
        natureza,
      });

      debugLog(`Entry: ${conta} | Tipo: ${tipoEntry} | Valor: ${Math.abs(valor)}${isRedutora ? " [REDUTORA]" : ""}`);
    }
  }

  // LOG FINAL DOS METRICS
  console.log("=== RESULTADO FINAL DO PARSING ===");
  console.log("ativoTotal:", metrics.ativoTotal);
  console.log("ativoCirculante:", metrics.ativoCirculante);
  console.log("ativoNaoCirculante:", metrics.ativoNaoCirculante);
  console.log("passivoTotal:", metrics.passivoTotal);
  console.log("passivoCirculante:", metrics.passivoCirculante);
  console.log("passivoNaoCirculante:", metrics.passivoNaoCirculante);
  console.log("patrimonioLiquido:", metrics.patrimonioLiquido);
  console.log("Total entries:", entries.length);

  const hasAnyNumeric = rows.some((r) => safeGetNumericValues(r).length > 0);
  const parsed = rows.length > 0 && (hasAnyNumeric || entries.length > 0);

  return { entries, metrics, periodo, errors, parsed, validationRows };
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

  // Flag para garantir que só o PRIMEIRO CIRCULANTE na seção seja usado
  let foundAtivoCirculante = false;
  let foundPassivoCirculante = false;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const conta = findFirstTextInRow(row);
    if (!conta || conta.length < 2) continue;

    const normalConta = normalizeText(conta);
    if (normalConta.includes("DESCRICAO") || normalConta === "CONTA") continue;

    const numericValues = findNumericValuesInRow(row);
    const valor =
      numericValues.length > 0 ? roundTo2Decimals(parseBrazilianNumber(numericValues[0], currentSection)) : 0;
    const valorAnterior =
      numericValues.length > 1 ? roundTo2Decimals(parseBrazilianNumber(numericValues[1], currentSection)) : null;

    let tipoEntry: BalancoTipoCompleto = currentTipo;

    if (normalConta === "ATIVO") {
      currentSection = "ATIVO";
      currentTipo = "ATIVO_CIRCULANTE";
      tipoEntry = "ATIVO_TOTAL";
      foundAtivoCirculante = false;
      if (valor !== 0) metrics.ativoTotal = roundTo2Decimals(Math.abs(valor));
    } else if (normalConta === "PASSIVO") {
      currentSection = "PASSIVO";
      currentTipo = "PASSIVO_CIRCULANTE";
      tipoEntry = "PASSIVO_TOTAL";
      foundPassivoCirculante = false;
      if (valor !== 0) metrics.passivoTotal = roundTo2Decimals(Math.abs(valor));
    } else if (normalConta === "CIRCULANTE" || normalConta.startsWith("CIRCULANTE")) {
      if (currentSection === "ATIVO" && !foundAtivoCirculante) {
        currentTipo = "ATIVO_CIRCULANTE";
        tipoEntry = "ATIVO_CIRCULANTE";
        foundAtivoCirculante = true;
        if (valor !== 0) metrics.ativoCirculante = roundTo2Decimals(Math.abs(valor));
      } else if (currentSection === "PASSIVO" && !foundPassivoCirculante) {
        currentTipo = "PASSIVO_CIRCULANTE";
        tipoEntry = "PASSIVO_CIRCULANTE";
        foundPassivoCirculante = true;
        if (valor !== 0) metrics.passivoCirculante = roundTo2Decimals(Math.abs(valor));
      } else {
        tipoEntry = currentTipo;
      }
    } else if (normalConta === "ATIVO CIRCULANTE") {
      currentTipo = "ATIVO_CIRCULANTE";
      tipoEntry = "ATIVO_CIRCULANTE";
      foundAtivoCirculante = true;
      if (valor !== 0) metrics.ativoCirculante = roundTo2Decimals(Math.abs(valor));
    } else if (normalConta === "PASSIVO CIRCULANTE") {
      currentTipo = "PASSIVO_CIRCULANTE";
      tipoEntry = "PASSIVO_CIRCULANTE";
      foundPassivoCirculante = true;
      if (valor !== 0) metrics.passivoCirculante = roundTo2Decimals(Math.abs(valor));
    } else if (
      normalConta === "ATIVO NAO CIRCULANTE" ||
      (normalConta === "NAO CIRCULANTE" && currentSection === "ATIVO")
    ) {
      currentTipo = "ATIVO_NAO_CIRCULANTE";
      tipoEntry = "ATIVO_NAO_CIRCULANTE";
      if (valor !== 0) metrics.ativoNaoCirculante = roundTo2Decimals(Math.abs(valor));
    } else if (
      normalConta === "PASSIVO NAO CIRCULANTE" ||
      (normalConta === "NAO CIRCULANTE" && currentSection === "PASSIVO")
    ) {
      currentTipo = "PASSIVO_NAO_CIRCULANTE";
      tipoEntry = "PASSIVO_NAO_CIRCULANTE";
      if (valor !== 0) metrics.passivoNaoCirculante = roundTo2Decimals(Math.abs(valor));
    } else if (normalConta.includes("PATRIMONIO LIQUIDO")) {
      currentSection = "PL";
      currentTipo = "PATRIMONIO_LIQUIDO";
      tipoEntry = "PATRIMONIO_LIQUIDO";
      if (valor !== 0) metrics.patrimonioLiquido = roundTo2Decimals(Math.abs(valor));
    } else {
      tipoEntry = currentTipo;
    }

    if (valor !== 0 || (valorAnterior !== null && valorAnterior !== 0)) {
      entries.push({
        conta,
        tipo: tipoEntry,
        valor: roundTo2Decimals(Math.abs(valor)),
        valor_anterior: valorAnterior !== null ? roundTo2Decimals(Math.abs(valorAnterior)) : null,
        hierarchy: conta,
        raw_row: row.map(String),
      });
    }
  }

  return { entries, metrics, periodo, errors, parsed: true };
}

// ============= DRE PARSING - REGRAS CONTÁBEIS v2 =============

// Tipo de grupo DRE (padrão brasileiro)
type DREGrupo =
  | "RECEITA_BRUTA"
  | "RECEITA_LIQUIDA"
  | "CMV"
  | "LUCRO_BRUTO"
  | "DESPESAS_OPERACIONAIS"
  | "LUCRO_OPERACIONAL"
  | "RESULTADO_FINANCEIRO"
  | "LUCRO_LIQUIDO"
  | "DEDUCOES"
  | "PROVISOES"
  | "OUTROS";

// Tipo de linha DRE
type DRELineTipo = "normal" | "subtotal" | "total_final";

interface DREClassificationResult {
  grupo: DREGrupo;
  tipo: DRELineTipo;
  isGroupChange: boolean;
}

/**
 * Classifica uma linha da DRE baseado no texto
 * REGRAS:
 * 1. Classificação sempre pelo texto, nunca pela posição
 * 2. Ignora maiúsculas/minúsculas, acentuação, espaços extras
 * 3. Linhas de subtotal contêm TOTAL, RESULTADO, LUCRO
 */
function classificarLinhaDRE(descricao: string, currentGrupo: DREGrupo): DREClassificationResult {
  const normalDesc = normalizeText(descricao);

  // REGRA ABSOLUTA: "NÃO OPERACIONAL" → RESULTADO_FINANCEIRO
  // Aplica para qualquer linha que contenha "não operacional", independente de ser receita ou despesa
  if (normalDesc.includes("NAO OPERACIONAL") || normalDesc.includes("NAO OPERACIONAIS")) {
    // Verifica se é uma linha de total/subtotal
    if (normalDesc.startsWith("TOTAL") || normalDesc.includes("SUBTOTAL")) {
      return { grupo: "RESULTADO_FINANCEIRO", tipo: "subtotal", isGroupChange: true };
    }
    return { grupo: "RESULTADO_FINANCEIRO", tipo: "normal", isGroupChange: true };
  }

  // LUCRO LÍQUIDO (total final)
  if (
    normalDesc.includes("LUCRO LIQUIDO") ||
    normalDesc.includes("RESULTADO LIQUIDO DO EXERCICIO") ||
    normalDesc.includes("RESULTADO LIQUIDO") ||
    normalDesc === "LUCRO DO EXERCICIO"
  ) {
    return { grupo: "LUCRO_LIQUIDO", tipo: "total_final", isGroupChange: true };
  }

  // LUCRO OPERACIONAL (subtotal)
  if (normalDesc.includes("LUCRO OPERACIONAL") || normalDesc.includes("RESULTADO OPERACIONAL")) {
    return { grupo: "LUCRO_OPERACIONAL", tipo: "subtotal", isGroupChange: true };
  }

  // LUCRO BRUTO (subtotal)
  if (normalDesc.includes("LUCRO BRUTO") || normalDesc.includes("RESULTADO BRUTO")) {
    return { grupo: "LUCRO_BRUTO", tipo: "subtotal", isGroupChange: true };
  }

  // RECEITA LÍQUIDA (subtotal)
  if (normalDesc.includes("RECEITA LIQUIDA") && !normalDesc.includes("BRUTA")) {
    return { grupo: "RECEITA_LIQUIDA", tipo: "subtotal", isGroupChange: true };
  }

  // RECEITA BRUTA
  if (
    normalDesc.includes("RECEITA BRUTA") ||
    normalDesc.includes("RECEITA DE VENDAS") ||
    normalDesc.includes("FATURAMENTO BRUTO") ||
    normalDesc.includes("VENDAS DE PRODUTOS") ||
    normalDesc.includes("PRESTACAO DE SERVICOS") ||
    normalDesc.includes("RECEITA OPERACIONAL BRUTA")
  ) {
    return { grupo: "RECEITA_BRUTA", tipo: "normal", isGroupChange: true };
  }

  // CMV / CUSTOS
  if (
    normalDesc.includes("CMV") ||
    normalDesc.includes("CUSTO DA MERCADORIA VENDIDA") ||
    normalDesc.includes("CUSTO DAS MERCADORIAS VENDIDAS") ||
    normalDesc.includes("CUSTO DOS PRODUTOS VENDIDOS") ||
    normalDesc.includes("CUSTO DOS SERVICOS PRESTADOS") ||
    normalDesc.includes("CUSTO DAS VENDAS") ||
    normalDesc.includes("CUSTO OPERACIONAL")
  ) {
    return { grupo: "CMV", tipo: "normal", isGroupChange: true };
  }

  // DESPESAS OPERACIONAIS
  if (
    normalDesc.includes("DESPESAS OPERACIONAIS") ||
    normalDesc.includes("DESPESAS ADMINISTRATIVAS") ||
    normalDesc.includes("DESPESAS COM VENDAS") ||
    normalDesc.includes("DESPESAS GERAIS") ||
    normalDesc.includes("DESPESA OPERACIONAL") ||
    normalDesc.includes("DESPESAS COMERCIAIS")
  ) {
    return { grupo: "DESPESAS_OPERACIONAIS", tipo: "normal", isGroupChange: true };
  }

  // RESULTADO FINANCEIRO (após verificar não operacional)
  if (
    normalDesc.includes("RESULTADO FINANCEIRO") ||
    normalDesc.includes("RECEITAS FINANCEIRAS") ||
    normalDesc.includes("DESPESAS FINANCEIRAS") ||
    normalDesc.includes("JUROS SOBRE") ||
    normalDesc.includes("VARIACAO MONETARIA") ||
    normalDesc.includes("RECEITA FINANCEIRA") ||
    normalDesc.includes("DESPESA FINANCEIRA")
  ) {
    return { grupo: "RESULTADO_FINANCEIRO", tipo: "normal", isGroupChange: true };
  }

  // Detectar subtotais genéricos (palavras que indicam fechamento de grupo)
  if (normalDesc.startsWith("TOTAL") || normalDesc.includes("TOTAL DE") || normalDesc.includes("SUBTOTAL")) {
    return { grupo: currentGrupo, tipo: "subtotal", isGroupChange: false };
  }

  // Deduções da receita (ficam no grupo RECEITA_BRUTA até aparecer RECEITA_LIQUIDA)
  if (
    currentGrupo === "RECEITA_BRUTA" &&
    (normalDesc.includes("IMPOSTO") ||
      normalDesc.includes("DEDUCAO") ||
      normalDesc.includes("DEDUCOES") ||
      normalDesc.includes("DEVOLUCAO") ||
      normalDesc.includes("DEVOLUCOES") ||
      normalDesc.includes("ABATIMENTO") ||
      normalDesc.includes("SIMPLES NACIONAL") ||
      normalDesc.includes("ISS") ||
      normalDesc.includes("ICMS") ||
      normalDesc.includes("PIS") ||
      normalDesc.includes("COFINS") ||
      normalDesc.startsWith("(-)"))
  ) {
    // Continua no grupo RECEITA_BRUTA até o subtotal RECEITA_LIQUIDA
    return { grupo: "RECEITA_BRUTA", tipo: "normal", isGroupChange: false };
  }

  // Fallback: mantém grupo atual, linha normal
  return { grupo: currentGrupo, tipo: "normal", isGroupChange: false };
}

/**
 * Parse DRE com regras contábeis:
 * 1. Início após "DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO EM"
 * 2. Não recalcular totais - usar valores do arquivo
 * 3. Preservar estrutura hierárquica
 * 4. Aplicar arredondamento 2 casas decimais
 * 5. Classificar grupo automaticamente
 *
 * REGRAS ESPECÍFICAS PARA XLS/XLSX:
 * - O texto da conta é o primeiro campo string não vazio
 * - O valor do período é o PRIMEIRO valor numérico válido APÓS o texto
 * - O valor anterior é o PRÓXIMO valor numérico após o valor atual
 * - Valores numéricos já vêm normalizados do parser XLS
 */
function parseDREFromXLS(rows: XLSRow[], filename: string): DREParseResult {
  debugLog("=== Iniciando parseDREFromXLS (REGRAS CONTÁBEIS) ===");
  debugLog("Total de linhas:", rows?.length || 0);

  const entries: ParsedDREEntry[] = [];
  const errors: string[] = [];
  const periodo = extractPeriodFromRows(rows?.map((r) => safeGetCells(r)) || [], filename);

  if (!rows || rows.length === 0) {
    return { entries, periodo, errors, parsed: false };
  }

  // ÂNCORA DE INÍCIO
  let startRow = 0;
  let found = false;

  for (let i = 0; i < rows.length; i++) {
    const cells = safeGetCells(rows[i]);
    const rowText = normalizeText(cells.join(" "));
    if (rowText.includes("DEMONSTRACAO")) {
      startRow = i + 1;
      found = true;
      debugLog(`Âncora DRE encontrada na linha: ${i}`);
      break;
    }
  }

  if (!found) {
    for (let i = 0; i < rows.length && i < 30; i++) {
      const { text } = safeGetFirstText(rows[i]);
      if (text && normalizeText(text).includes("RECEITA")) {
        startRow = i;
        found = true;
        break;
      }
    }
  }

  if (!found) startRow = Math.min(5, rows.length - 1);

  let currentGrupo: DREGrupo = "RECEITA_BRUTA";
  let isInsideCMVBlock = false;
  let cmvBlockStarted = false;
  let foundReceitaLiquida = false;
  let isInsideReceitaBrutaBlock = false;

  // Processar linhas DRE
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const { text: descricao } = safeGetFirstText(row);

    if (!descricao || descricao.length < 2) continue;
    const normalDesc = normalizeText(descricao);

    // Skip headers
    if (normalDesc.includes("DESCRICAO") || normalDesc === "CONTA" || normalDesc.includes("________")) continue;

    const numericValues = row.numericValues || [];
    const temValor = numericValues.length > 0 && Number.isFinite(numericValues[0]?.value);

    // === BLOCO RECEITA BRUTA ===
    const isReceitaOperacional = normalDesc.includes("RECEITA OPERACIONAL");
    if (isReceitaOperacional && !temValor) {
      isInsideReceitaBrutaBlock = true;
    } else if (isInsideReceitaBrutaBlock && normalDesc.includes("RECEITA LIQUIDA")) {
      isInsideReceitaBrutaBlock = false;
    }

    // Detectar Receita Líquida
    if (normalDesc.includes("RECEITA LIQUIDA")) {
      foundReceitaLiquida = true;
      isInsideReceitaBrutaBlock = false; // Receita Líquida fecha bloco Receita Bruta
    }

    // Fechar bloco CMV ANTES de processar Lucro Bruto
    if (isInsideCMVBlock && (normalDesc.includes("LUCRO BRUTO") || normalDesc.includes("RESULTADO BRUTO"))) {
      isInsideCMVBlock = false;
      cmvBlockStarted = false;
    }

    // Ativar bloco CMV: primeira conta após Receita Líquida
    if (
      foundReceitaLiquida &&
      !isInsideCMVBlock &&
      !normalDesc.includes("RECEITA LIQUIDA") &&
      !(normalDesc.includes("LUCRO BRUTO") || normalDesc.includes("RESULTADO BRUTO"))
    ) {
      if (temValor) {
        isInsideCMVBlock = true;
        cmvBlockStarted = true;
      }
      foundReceitaLiquida = false;
    } else if (foundReceitaLiquida && (normalDesc.includes("LUCRO BRUTO") || normalDesc.includes("RESULTADO BRUTO"))) {
      // Lucro Bruto imediatamente após Receita Líquida = sem CMV
      foundReceitaLiquida = false;
    }

    if (!temValor) continue;

    let classification: DREClassificationResult;
    if (isInsideCMVBlock) {
      classification = { grupo: "CMV", tipo: "normal", isGroupChange: false };
    } else if (isInsideReceitaBrutaBlock) {
      const valorPeriodo = numericValues[0]?.value;
      classification = {
        grupo: valorPeriodo >= 0 ? "RECEITA_BRUTA" : "DESPESAS_OPERACIONAIS",
        tipo: "normal",
        isGroupChange: false,
      };
    } else {
      classification = classificarLinhaDRE(descricao, currentGrupo);
    }

    currentGrupo = classification.grupo;

    const valorPeriodo = numericValues[0]?.value;
    if (valorPeriodo === undefined || valorPeriodo === null || !Number.isFinite(valorPeriodo)) continue;

    const valor = roundTo2Decimals(valorPeriodo);
    const valorAnterior =
      numericValues.length > 1 && Number.isFinite(numericValues[1]?.value)
        ? roundTo2Decimals(numericValues[1].value)
        : null;

    entries.push({
      descricao,
      grupo: currentGrupo,
      valor,
      valor_anterior: valorAnterior,
      raw_row: safeGetCells(row),
      isCMV: isInsideCMVBlock, // Campo importante para o seu Debug
    });

    // Bloco CMV é fechado ANTES do Lucro Bruto (já tratado acima)
  }

  return { entries, periodo, errors, parsed: entries.length > 0 };
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

  // Estado de grupo atual
  let currentGrupo: DREGrupo = "RECEITA_BRUTA";

  // ESTADO PARA CAPTURA POR INTERVALO DO CMV (igual ao parser XLS)
  let isInsideCMVBlock = false;
  let cmvBlockStarted = false;
  let foundReceitaLiquida = false;
  let isInsideReceitaBrutaBlock = false;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const descricao = findFirstTextInRow(row);
    if (!descricao || descricao.length < 2) continue;

    const normalDesc = normalizeText(descricao);
    if (normalDesc.includes("DESCRICAO") || normalDesc === "CONTA") continue;

    const numericValues = findNumericValuesInRow(row);
    const temValor = numericValues.length > 0;

    // === BLOCO RECEITA BRUTA ===
    const isReceitaOperacional = normalDesc.includes("RECEITA OPERACIONAL");
    if (isReceitaOperacional && !temValor) {
      isInsideReceitaBrutaBlock = true;
    } else if (isInsideReceitaBrutaBlock && normalDesc.includes("RECEITA LIQUIDA")) {
      isInsideReceitaBrutaBlock = false;
    }

    // Detectar Receita Líquida
    if (normalDesc.includes("RECEITA LIQUIDA")) {
      foundReceitaLiquida = true;
      isInsideReceitaBrutaBlock = false;
      debugLog(`CMV CSV: Receita Líquida encontrada na linha ${i}`);
    }

    // Fechar bloco CMV ANTES de processar Lucro Bruto
    if (isInsideCMVBlock && (normalDesc.includes("LUCRO BRUTO") || normalDesc.includes("RESULTADO BRUTO"))) {
      isInsideCMVBlock = false;
      cmvBlockStarted = false;
      debugLog(`CMV BLOCK CLOSED CSV: Bloco CMV fechado antes de LUCRO BRUTO`);
    }

    // Ativar bloco CMV: primeira conta após Receita Líquida
    if (
      foundReceitaLiquida &&
      !isInsideCMVBlock &&
      !normalDesc.includes("RECEITA LIQUIDA") &&
      !(normalDesc.includes("LUCRO BRUTO") || normalDesc.includes("RESULTADO BRUTO"))
    ) {
      if (temValor) {
        isInsideCMVBlock = true;
        cmvBlockStarted = true;
      }
      foundReceitaLiquida = false;
    } else if (foundReceitaLiquida && (normalDesc.includes("LUCRO BRUTO") || normalDesc.includes("RESULTADO BRUTO"))) {
      // Lucro Bruto imediatamente após Receita Líquida = sem CMV
      foundReceitaLiquida = false;
    }

    if (!temValor) continue;

    // Classificar linha usando nova lógica OU forçar CMV se estamos dentro do bloco
    let classification: DREClassificationResult;

    if (isInsideCMVBlock) {
      classification = { grupo: "CMV", tipo: "normal", isGroupChange: false };
      debugLog(`CMV BLOCK CSV: Linha ${i} forçada como CMV: ${descricao}`);
    } else if (isInsideReceitaBrutaBlock) {
      const valorBloco = numericValues.length > 0 ? parseBrazilianNumber(numericValues[0]) : 0;
      classification = { grupo: valorBloco >= 0 ? "RECEITA_BRUTA" : "DEDUCOES", tipo: "normal", isGroupChange: false };
    } else {
      classification = classificarLinhaDRE(descricao, currentGrupo);
    }

    currentGrupo = classification.grupo;

    // REGRA: Primeiro número = valor do período atual, segundo = valor anterior
    const valor = roundTo2Decimals(parseSimpleBrazilianNumber(numericValues[0]));
    const valorAnterior =
      numericValues.length > 1 ? roundTo2Decimals(parseSimpleBrazilianNumber(numericValues[1])) : null;

    entries.push({
      descricao,
      grupo: currentGrupo,
      valor,
      valor_anterior: valorAnterior,
      raw_row: row.map(String),
    });

    // Bloco CMV é fechado ANTES do Lucro Bruto (já tratado acima)
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
    // parseDREFromXLSFile já retorna DREParseResult completo
    return await parseDREFromXLSFile(file);
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
 *
 * REGRAS DE AGREGAÇÃO (ORDEM DE PRIORIDADE):
 * 1. Linha explícita de subtotal/total → usar esse valor (fonte da verdade)
 * 2. Soma das linhas do grupo → fallback se não existir linha explícita
 * 3. NUNCA recalcular valores já informados
 */
export function calculateDREMetrics(entries: ParsedDREEntry[]): DREMetrics {
  const metrics: DREMetrics = {
    receitaBruta: 0,
    receitaBrutaOrigem: "soma_contas",
    receitaLiquida: 0,
    receitaLiquidaOrigem: "soma_contas",
    cmv: 0,
    cmvOrigem: "soma_contas",
    lucroBruto: 0,
    lucroBrutoOrigem: "soma_contas",
    despesasOperacionais: 0,
    despesasOperacionaisOrigem: "soma_contas",
    lucroOperacional: 0,
    lucroOperacionalOrigem: "soma_contas",
    resultadoFinanceiro: 0,
    resultadoFinanceiroOrigem: "soma_contas",
    lucroLiquido: 0,
    lucroLiquidoOrigem: "soma_contas",
  };

  // Acumuladores para soma de contas (fallback)
  let somaReceitaBruta = 0;
  let somaReceitaLiquida = 0;
  let somaCMV = 0;
  let somaDespesasOperacionais = 0;
  let somaResultadoFinanceiro = 0;

  // Flags para linhas explícitas encontradas
  let foundReceitaBrutaExplicita = false;
  let foundReceitaLiquidaExplicita = false;
  let foundCMVExplicita = false;
  let foundLucroBrutoExplicita = false;
  let foundDespesasOperacionaisExplicita = false;
  let foundLucroOperacionalExplicita = false;
  let foundResultadoFinanceiroExplicita = false;
  let foundLucroLiquidoExplicita = false;

  for (const entry of entries) {
    const normalDesc = normalizeText(entry.descricao);
    const valor = entry.valor; // Manter sinal original
    const valorAbs = Math.abs(valor);

    // ===== RECEITA BRUTA =====
    if (entry.grupo === "RECEITA_BRUTA") {
      // Linha explícita "RECEITA BRUTA" ou "TOTAL RECEITA BRUTA"
      if (
        normalDesc === "RECEITA BRUTA" ||
        normalDesc === "RECEITA OPERACIONAL BRUTA" ||
        (normalDesc.includes("TOTAL") && normalDesc.includes("RECEITA BRUTA"))
      ) {
        if (!foundReceitaBrutaExplicita) {
          metrics.receitaBruta = valorAbs;
          metrics.receitaBrutaOrigem = "linha_explicita";
          foundReceitaBrutaExplicita = true;
        }
      } else {
        // Somar contas normais do grupo
        somaReceitaBruta += valorAbs;
      }
    }

    // ===== RECEITA LÍQUIDA =====
    if (entry.grupo === "RECEITA_LIQUIDA") {
      // Linha explícita "RECEITA LÍQUIDA"
      if (
        normalDesc === "RECEITA LIQUIDA" ||
        normalDesc === "RECEITA OPERACIONAL LIQUIDA" ||
        (normalDesc.includes("TOTAL") && normalDesc.includes("RECEITA LIQUIDA"))
      ) {
        if (!foundReceitaLiquidaExplicita) {
          metrics.receitaLiquida = valorAbs;
          metrics.receitaLiquidaOrigem = "linha_explicita";
          foundReceitaLiquidaExplicita = true;
        }
      } else {
        somaReceitaLiquida += valorAbs;
      }
    }

    // ===== CMV =====
    if (entry.grupo === "CMV") {
      // Linha explícita de CMV/CPV total
      // Dentro do loop de entries em calculateDREMetrics
      if (
        normalDesc === "CMV" ||
        normalDesc === "CPV" ||
        /TOTAL.*CUSTO/i.test(normalDesc) ||
        /CUSTO.*VENDIDAS?/i.test(normalDesc)
      ) {
        if (!foundCMVExplicita) {
          metrics.cmv = Math.abs(valor); // Garante valor positivo para métrica de custo
          metrics.cmvOrigem = "linha_explicita";
          foundCMVExplicita = true;
        }
      } else {
        somaCMV += valor;
      }
    }

    // ===== LUCRO BRUTO =====
    if (entry.grupo === "LUCRO_BRUTO") {
      if (normalDesc === "LUCRO BRUTO" || normalDesc === "RESULTADO BRUTO") {
        if (!foundLucroBrutoExplicita) {
          metrics.lucroBruto = valorAbs;
          metrics.lucroBrutoOrigem = "linha_explicita";
          foundLucroBrutoExplicita = true;
        }
      }
    }

    // ===== DESPESAS OPERACIONAIS =====
    if (entry.grupo === "DESPESAS_OPERACIONAIS") {
      // Linha explícita de total
      if (
        normalDesc === "DESPESAS OPERACIONAIS" ||
        normalDesc === "TOTAL DESPESAS OPERACIONAIS" ||
        normalDesc === "TOTAL DAS DESPESAS OPERACIONAIS" ||
        (normalDesc.includes("TOTAL") && normalDesc.includes("DESPESAS"))
      ) {
        if (!foundDespesasOperacionaisExplicita) {
          metrics.despesasOperacionais = valorAbs;
          metrics.despesasOperacionaisOrigem = "linha_explicita";
          foundDespesasOperacionaisExplicita = true;
        }
      } else {
        somaDespesasOperacionais += valorAbs;
      }
    }

    // ===== LUCRO OPERACIONAL =====
    if (entry.grupo === "LUCRO_OPERACIONAL") {
      if (normalDesc === "LUCRO OPERACIONAL" || normalDesc === "RESULTADO OPERACIONAL") {
        if (!foundLucroOperacionalExplicita) {
          metrics.lucroOperacional = valorAbs;
          metrics.lucroOperacionalOrigem = "linha_explicita";
          foundLucroOperacionalExplicita = true;
        }
      }
    }

    // ===== RESULTADO FINANCEIRO =====
    if (entry.grupo === "RESULTADO_FINANCEIRO") {
      // Linha explícita de resultado financeiro líquido
      if (
        normalDesc === "RESULTADO FINANCEIRO" ||
        normalDesc === "RESULTADO FINANCEIRO LIQUIDO" ||
        (normalDesc.includes("TOTAL") && normalDesc.includes("FINANCEIRO"))
      ) {
        if (!foundResultadoFinanceiroExplicita) {
          metrics.resultadoFinanceiro = valor; // Manter sinal
          metrics.resultadoFinanceiroOrigem = "linha_explicita";
          foundResultadoFinanceiroExplicita = true;
        }
      } else {
        somaResultadoFinanceiro += valor;
      }
    }

    // ===== LUCRO LÍQUIDO =====
    if (entry.grupo === "LUCRO_LIQUIDO") {
      if (
        normalDesc === "LUCRO LIQUIDO" ||
        normalDesc === "LUCRO LIQUIDO DO EXERCICIO" ||
        normalDesc === "RESULTADO LIQUIDO" ||
        normalDesc === "RESULTADO LIQUIDO DO EXERCICIO" ||
        normalDesc === "RESULTADO DO EXERCICIO" ||
        normalDesc === "LUCRO DO EXERCICIO" ||
        normalDesc === "LUCRO DO PERIODO"
      ) {
        if (!foundLucroLiquidoExplicita) {
          metrics.lucroLiquido = valorAbs;
          metrics.lucroLiquidoOrigem = "linha_explicita";
          foundLucroLiquidoExplicita = true;
        }
      }
    }
  }

  // ===== FALLBACKS: Usar soma das contas se não encontrou linha explícita =====

  if (!foundReceitaBrutaExplicita && somaReceitaBruta > 0) {
    metrics.receitaBruta = somaReceitaBruta;
    metrics.receitaBrutaOrigem = "soma_contas";
  }

  if (!foundReceitaLiquidaExplicita) {
    if (somaReceitaLiquida > 0) {
      metrics.receitaLiquida = somaReceitaLiquida;
      metrics.receitaLiquidaOrigem = "soma_contas";
    } else if (metrics.receitaBruta > 0) {
      // Se não tem receita líquida, usar receita bruta
      metrics.receitaLiquida = metrics.receitaBruta;
      metrics.receitaLiquidaOrigem = metrics.receitaBrutaOrigem;
    }
  }

  if (!foundCMVExplicita && somaCMV !== 0) {
    metrics.cmv = somaCMV;
    metrics.cmvOrigem = "soma_contas";
  }

  if (!foundLucroBrutoExplicita && metrics.receitaLiquida > 0) {
    // NÃO recalcular - só usar soma se houver
    // Lucro bruto DEVE vir de linha explícita
  }

  if (!foundDespesasOperacionaisExplicita && somaDespesasOperacionais > 0) {
    metrics.despesasOperacionais = somaDespesasOperacionais;
    metrics.despesasOperacionaisOrigem = "soma_contas";
  }

  if (!foundResultadoFinanceiroExplicita && somaResultadoFinanceiro !== 0) {
    metrics.resultadoFinanceiro = somaResultadoFinanceiro;
    metrics.resultadoFinanceiroOrigem = "soma_contas";
  }

  // Lucro Operacional e Lucro Líquido NUNCA são recalculados
  // Devem vir de linhas explícitas

  return metrics;
}

// ============= BALANCETE (TRIAL BALANCE) PARSING =============

export interface ParsedBalanceteEntry {
  conta: string;
  grupo: string;
  saldo_anterior: number;
  debitos: number;
  creditos: number;
  saldo_atual: number;
  natureza: "devedora" | "credora";
  raw_row: string[];
  indent_level?: number;
  is_bold?: boolean;
  contexto_pai?: string; // Section anchor detected by position (e.g. "ATIVO CIRCULANTE")
}

export interface BalanceteParseResult {
  entries: ParsedBalanceteEntry[];
  periodo: string;
  errors: string[];
  parsed: boolean;
}

/**
 * Detect if a file has balancete structure (4 numeric columns: Saldo Anterior, Débitos, Créditos, Saldo Atual)
 */
function isBalanceteStructure(rows: XLSRow[]): boolean {
  // Check header row for balancete-specific keywords
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const rowText = rows[i].cells.join(" ").toUpperCase();
    const norm = normalizeText(rowText);
    if (
      (norm.includes("SALDO ANTERIOR") || norm.includes("SALDO INICIAL")) &&
      (norm.includes("DEBITO") || norm.includes("DEBITOS")) &&
      (norm.includes("CREDITO") || norm.includes("CREDITOS"))
    ) {
      return true;
    }
    if (norm.includes("BALANCETE")) return true;
  }

  // Check if majority of data rows have 4+ numeric columns
  let fourColCount = 0;
  const dataRows = rows.slice(Math.min(5, rows.length));
  for (const row of dataRows.slice(0, 20)) {
    if (row.numericValues.length >= 4) fourColCount++;
  }
  return fourColCount >= 5;
}

/**
 * Normalize column header for matching
 */
function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s]+/g, " ")
    .trim();
}

/**
 * Find column index by possible names with multi-tier matching
 */
function findColumnIndex(headers: string[], possibleNames: string[]): number {
  const normalizedHeaders = headers.map((h) => (h ? normalizeColumnName(String(h)) : ""));
  const normalizedNames = possibleNames.map(normalizeColumnName);

  // Priority 1: Exact match
  for (const name of normalizedNames) {
    const idx = normalizedHeaders.indexOf(name);
    if (idx !== -1) return idx;
  }
  // Priority 2: Starts with
  for (const name of normalizedNames) {
    const idx = normalizedHeaders.findIndex((h) => h.startsWith(name));
    if (idx !== -1) return idx;
  }
  // Priority 3: Contains
  for (const name of normalizedNames) {
    const idx = normalizedHeaders.findIndex((h) => h.includes(name));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Detect column positions for balancete using dynamic header detection.
 * Returns actual cell indices (column positions in the spreadsheet row).
 */
function detectBalanceteColumns(rows: XLSRow[]): {
  saldoAnteriorCol: number;
  debitosCol: number;
  creditosCol: number;
  saldoAtualCol: number;
  headerRow: number;
} | null {
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const cells = rows[i].cells;

    const saCol = findColumnIndex(cells, ["saldo anterior", "saldo inicial"]);
    const debCol = findColumnIndex(cells, ["debitos", "debito"]);
    const credCol = findColumnIndex(cells, ["creditos", "credito"]);
    const sfCol = findColumnIndex(cells, ["saldo atual", "saldo final", "saldo"]);

    if (debCol >= 0 && credCol >= 0) {
      // We found at least débitos and créditos columns — good enough
      // If saldo atual not found explicitly, assume it's the LAST numeric column (rightmost)
      let actualSfCol = sfCol;
      if (actualSfCol < 0) {
        // Find the rightmost column that has a header or is after credCol
        actualSfCol = credCol + 1; // best guess: next column after créditos
        // Or look for the last column in the header row that has content
        for (let c = cells.length - 1; c > credCol; c--) {
          if (cells[c] && cells[c].trim().length > 0) {
            actualSfCol = c;
            break;
          }
        }
      }

      debugLog("Balancete columns detected:", {
        saldoAnterior: saCol,
        debitos: debCol,
        creditos: credCol,
        saldoAtual: actualSfCol,
        headerRow: i,
      });

      return {
        saldoAnteriorCol: saCol >= 0 ? saCol : -1,
        debitosCol: debCol,
        creditosCol: credCol,
        saldoAtualCol: actualSfCol,
        headerRow: i,
      };
    }
  }

  return null;
}

function parseBalanceteFromXLS(rows: XLSRow[], filename: string): BalanceteParseResult {
  debugLog("=== Iniciando parseBalanceteFromXLS ===");

  const entries: ParsedBalanceteEntry[] = [];
  const errors: string[] = [];
  const periodo = extractPeriodFromRows(
    rows.map((r) => r.cells),
    filename,
  );

  // Detect column positions dynamically from headers
  const colInfo = detectBalanceteColumns(rows);

  let startRow = 0;

  if (colInfo) {
    startRow = colInfo.headerRow + 1;
    debugLog("Using dynamic column detection. Start row:", startRow);
  } else {
    // Fallback: find header row manually
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const rowText = normalizeText(rows[i].cells.join(" "));
      if (
        (rowText.includes("SALDO ANTERIOR") || rowText.includes("SALDO INICIAL")) &&
        (rowText.includes("DEBITO") || rowText.includes("DEBITOS"))
      ) {
        startRow = i + 1;
        break;
      }
      if (rowText.includes("BALANCETE") && !rowText.includes("SALDO")) {
        continue;
      }
    }
    if (startRow === 0) startRow = Math.min(5, rows.length);
  }

  /**
   * Extract numeric value from a specific cell column index.
   * Parses Brazilian number format from the raw cell string.
   */
  function getCellNumericValue(row: XLSRow, colIdx: number): number {
    if (colIdx < 0 || colIdx >= row.cells.length) return 0;
    const cellStr = row.cells[colIdx];
    if (!cellStr || cellStr.trim() === "") return 0;

    // Try direct number first
    if (typeof cellStr === "number") return cellStr as unknown as number;

    const parsed = parseSimpleBrazilianNumber(cellStr);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  // Section anchor state machine for balancete
  let currentBalanceteSection = "";

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const { text: conta } = safeGetFirstText(row);
    if (!conta || conta.length < 2) continue;

    const normalConta = normalizeText(conta);

    // Skip total/summary lines
    if (normalConta === "TOTAL" || normalConta === "TOTAIS" || normalConta.includes("TOTAL GERAL")) continue;

    // === SECTION ANCHOR DETECTION ===
    if (normalConta === "ATIVO") {
      currentBalanceteSection = "ATIVO";
    } else if (
      normalConta === "ATIVO CIRCULANTE" ||
      (normalConta === "CIRCULANTE" && currentBalanceteSection === "ATIVO")
    ) {
      currentBalanceteSection = "ATIVO CIRCULANTE";
    } else if (
      normalConta === "ATIVO NAO CIRCULANTE" ||
      (normalConta === "NAO CIRCULANTE" && currentBalanceteSection.startsWith("ATIVO"))
    ) {
      currentBalanceteSection = "ATIVO NAO CIRCULANTE";
    } else if (normalConta === "PASSIVO") {
      currentBalanceteSection = "PASSIVO";
    } else if (
      normalConta === "PASSIVO CIRCULANTE" ||
      (normalConta === "CIRCULANTE" && currentBalanceteSection === "PASSIVO")
    ) {
      currentBalanceteSection = "PASSIVO CIRCULANTE";
    } else if (
      normalConta === "PASSIVO NAO CIRCULANTE" ||
      (normalConta === "NAO CIRCULANTE" && currentBalanceteSection.startsWith("PASSIVO"))
    ) {
      currentBalanceteSection = "PASSIVO NAO CIRCULANTE";
    } else if (normalConta === "PATRIMONIO LIQUIDO" || normalConta.includes("PATRIMONIO LIQUIDO")) {
      currentBalanceteSection = "PATRIMONIO LIQUIDO";
    } else if (normalConta.includes("RECEITA") && !currentBalanceteSection.includes("RECEITA")) {
      // Only switch to RECEITA if it looks like a section header (short name)
      if (normalConta === "RECEITAS" || normalConta === "RECEITA" || normalConta === "RECEITAS OPERACIONAIS") {
        currentBalanceteSection = "RECEITAS";
      }
    } else if (
      normalConta === "CUSTOS" ||
      normalConta === "CUSTO" ||
      normalConta === "DESPESAS" ||
      normalConta === "DESPESA"
    ) {
      currentBalanceteSection = "CUSTOS/DESPESAS";
    }

    let saldoAnterior = 0;
    let debitos = 0;
    let creditos = 0;
    let saldoAtual = 0;

    if (colInfo) {
      // === USE ACTUAL COLUMN POSITIONS from header detection ===
      saldoAnterior = colInfo.saldoAnteriorCol >= 0 ? getCellNumericValue(row, colInfo.saldoAnteriorCol) : 0;
      debitos = Math.abs(getCellNumericValue(row, colInfo.debitosCol));
      creditos = Math.abs(getCellNumericValue(row, colInfo.creditosCol));
      saldoAtual = getCellNumericValue(row, colInfo.saldoAtualCol);

      // If saldoAtual is 0 but we have other values, it might genuinely be 0
      // Don't fallback to numericValues — trust the column position
    } else {
      // Fallback: use numericValues array (old behavior)
      const numericVals = row.numericValues;
      if (numericVals.length < 2) continue;

      if (numericVals.length >= 4) {
        saldoAnterior = numericVals[0].value;
        debitos = Math.abs(numericVals[1].value);
        creditos = Math.abs(numericVals[2].value);
        saldoAtual = numericVals[3].value;
      } else if (numericVals.length === 3) {
        debitos = Math.abs(numericVals[0].value);
        creditos = Math.abs(numericVals[1].value);
        saldoAtual = numericVals[2].value;
      } else if (numericVals.length === 2) {
        saldoAtual = numericVals[numericVals.length - 1].value;
      }
    }

    // Determine nature based on account description or saldo sign
    const isCredora =
      normalConta.includes("RECEITA") ||
      normalConta.includes("PASSIVO") ||
      normalConta.includes("PATRIMONIO") ||
      normalConta.includes("CAPITAL") ||
      normalConta.includes("FORNECEDOR") ||
      normalConta.includes("OBRIGAC");
    const natureza: "devedora" | "credora" = isCredora ? "credora" : "devedora";

    const { index: textIdx } = safeGetFirstText(row);
    entries.push({
      conta,
      grupo: "OUTROS",
      saldo_anterior: saldoAnterior,
      debitos,
      creditos,
      saldo_atual: saldoAtual,
      natureza,
      raw_row: row.cells,
      indent_level: textIdx >= 0 ? textIdx : 0,
      is_bold: row.isBold || false,
      contexto_pai: currentBalanceteSection,
    });
  }

  debugLog(`Balancete parsed: ${entries.length} entries`);

  return {
    entries,
    periodo,
    errors,
    parsed: entries.length > 0,
  };
}

export async function parseBalanceteFileAuto(file: File): Promise<BalanceteParseResult> {
  const extension = getFileExtension(file.name);
  debugLog("Balancete - Tipo de arquivo:", extension);

  if (extension === "csv") {
    const rows = await parseCSVFile(file);
    const xlsRows = processXLSRawRows(rows);
    return parseBalanceteFromXLS(xlsRows, file.name);
  } else if (extension === "xls" || extension === "xlsx") {
    const xlsRows = await parseXLSFile(file);
    return parseBalanceteFromXLS(xlsRows, file.name);
  }

  throw new Error("Formato não suportado. Use CSV, XLS ou XLSX.");
}

export function extractPeriod(filename: string, rows: string[][]): string {
  return extractPeriodFromRows(rows, filename);
}
