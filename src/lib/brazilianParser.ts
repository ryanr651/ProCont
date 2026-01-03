import * as XLSX from "xlsx";

/* =========================
   TIPOS
========================= */

export interface ParsedDREEntry {
  descricao: string;
  valor: number;
  valor_anterior: number | null;
  raw_row: string;
}

export interface ParsedBalancoEntry {
  conta: string;
  tipo: string | null;
  valor: number;
  valor_anterior: number | null;
  hierarchy: string;
  raw_row: string;
}

export interface BalancoMetrics {
  ativoTotal: number;
  ativoCirculante: number;
  ativoNaoCirculante: number;
  passivoTotal: number;
  passivoCirculante: number;
  passivoNaoCirculante: number;
}

export interface ValidationRow {
  rowIndex: number;
  textoConta: string;
  numerosDetectados: { value: number; raw: string }[];
  classificacao?: string;
  secaoAtual?: string;
  alerta?: string;
}

interface ParseResult<T> {
  parsed: boolean;
  periodo: string | null;
  entries: T[];
  errors: string[];
  metrics?: BalancoMetrics;
  validationRows?: ValidationRow[];
}

/* =========================
   HELPERS
========================= */

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isTotalLine(text: string): boolean {
  const t = normalizeText(text);
  return t.includes("TOTAL") || t.includes("SOMA") || t.includes("RESULTADO");
}

/* =========================
   LEITURA XLS GENÉRICA
========================= */

function readXLS(file: File): XLSX.WorkSheet {
  return XLSX.read(file, { type: "array" }).Sheets[XLSX.read(file, { type: "array" }).SheetNames[0]];
}

/* =========================
   PARSER BALANÇO
========================= */

export async function parseBalancoFileAuto(file: File): Promise<ParseResult<ParsedBalancoEntry>> {
  const entries: ParsedBalancoEntry[] = [];
  const validationRows: ValidationRow[] = [];
  const errors: string[] = [];

  const metrics: BalancoMetrics = {
    ativoTotal: 0,
    ativoCirculante: 0,
    ativoNaoCirculante: 0,
    passivoTotal: 0,
    passivoCirculante: 0,
    passivoNaoCirculante: 0,
  };

  try {
    const sheet = readXLS(file);
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
      defval: null,
    });

    let currentSection: "ATIVO" | "PASSIVO" | null = null;
    let currentTipo: string | null = null;
    let hierarchyStack: string[] = [];
    let rowIndex = 0;

    for (const row of rows) {
      rowIndex++;
      const cells = Object.values(row)
        .map((v) => (typeof v === "string" ? v.trim() : v))
        .filter((v) => v !== null && v !== "");

      if (cells.length === 0) continue;

      const contaCell = cells.find((v) => typeof v === "string") as string | undefined;
      if (!contaCell) continue;

      const conta = contaCell;
      const normalConta = normalizeText(conta);

      // ===== SEÇÕES =====
      if (normalConta === "ATIVO") {
        currentSection = "ATIVO";
        currentTipo = "ATIVO_CIRCULANTE";
        hierarchyStack = ["ATIVO"];
        continue;
      }

      if (normalConta === "PASSIVO") {
        currentSection = "PASSIVO";
        currentTipo = "PASSIVO_CIRCULANTE";
        hierarchyStack = ["PASSIVO"];
        continue;
      }

      if (!currentSection) continue;

      // ===== NUMÉRICOS =====
      const numericValues = cells.filter((v) => typeof v === "number" && !isNaN(v)) as number[];

      if (numericValues.length === 0) continue;

      const valorAtual = numericValues[0];
      const valorAnterior = numericValues.length > 1 ? numericValues[1] : null;

      const totalLine = isTotalLine(conta);

      // ===== MÉTRICAS =====
      if (!totalLine) {
        if (currentSection === "ATIVO") {
          metrics.ativoTotal += Math.abs(valorAtual);
          if (currentTipo === "ATIVO_CIRCULANTE") {
            metrics.ativoCirculante += Math.abs(valorAtual);
          } else {
            metrics.ativoNaoCirculante += Math.abs(valorAtual);
          }
        }

        if (currentSection === "PASSIVO") {
          metrics.passivoTotal += Math.abs(valorAtual);
          if (currentTipo === "PASSIVO_CIRCULANTE") {
            metrics.passivoCirculante += Math.abs(valorAtual);
          } else {
            metrics.passivoNaoCirculante += Math.abs(valorAtual);
          }
        }
      }

      hierarchyStack = [currentSection, conta];

      entries.push({
        conta,
        tipo: currentTipo,
        valor: valorAtual,
        valor_anterior: valorAnterior,
        hierarchy: hierarchyStack.join("."),
        raw_row: JSON.stringify(row),
      });

      validationRows.push({
        rowIndex,
        textoConta: conta,
        numerosDetectados: numericValues.map(v => ({ value: v, raw: String(v) })),
        classificacao: currentTipo || undefined,
        secaoAtual: currentSection || undefined,
      });
    }

    return {
      parsed: true,
      periodo: null,
      entries,
      metrics,
      validationRows,
      errors,
    };
  } catch (err) {
    return {
      parsed: false,
      periodo: null,
      entries: [],
      errors: [err instanceof Error ? err.message : "Erro desconhecido no parser do Balanço"],
    };
  }
}

/* =========================
   PARSER DRE
========================= */

export async function parseDREFileAuto(file: File): Promise<ParseResult<ParsedDREEntry>> {
  const entries: ParsedDREEntry[] = [];
  const errors: string[] = [];

  try {
    const sheet = readXLS(file);
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
      defval: null,
    });

    for (const row of rows) {
      const cells = Object.values(row)
        .map((v) => (typeof v === "string" ? v.trim() : v))
        .filter((v) => v !== null && v !== "");

      if (cells.length === 0) continue;

      const descricaoCell = cells.find((v) => typeof v === "string") as string | undefined;
      if (!descricaoCell) continue;

      const descricao = descricaoCell;

      const numericValues = cells.filter((v) => typeof v === "number" && !isNaN(v)) as number[];

      if (numericValues.length === 0) continue;

      const valorAtual = numericValues[0];
      const valorAnterior = numericValues.length > 1 ? numericValues[1] : null;

      entries.push({
        descricao,
        valor: valorAtual,
        valor_anterior: valorAnterior,
        raw_row: JSON.stringify(row),
      });
    }

    return {
      parsed: true,
      periodo: null,
      entries,
      errors,
    };
  } catch (err) {
    return {
      parsed: false,
      periodo: null,
      entries: [],
      errors: [err instanceof Error ? err.message : "Erro desconhecido no parser da DRE"],
    };
  }
}
