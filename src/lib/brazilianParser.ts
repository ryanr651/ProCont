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
  numerosDetectados: number[];
  mensagem: string;
}

export interface ParseResult<T> {
  parsed: boolean;
  periodo: string | null;
  entries: T[];
  metrics?: BalancoMetrics;
  validationRows?: ValidationRow[];
  errors: string[];
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
   LEITURA XLS
========================= */

function readXLS(file: File): XLSX.WorkSheet {
  const workbook = XLSX.read(file, { type: "array" });
  return workbook.Sheets[workbook.SheetNames[0]];
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

    rows.forEach((row, index) => {
      const cells = Object.values(row)
        .map((v) => (typeof v === "string" ? v.trim() : v))
        .filter((v) => v !== null && v !== "");

      if (!cells.length) return;

      const contaCell = cells.find((v) => typeof v === "string") as string | undefined;
      if (!contaCell) return;

      const conta = contaCell;
      const normalConta = normalizeText(conta);

      if (normalConta === "ATIVO") {
        currentSection = "ATIVO";
        currentTipo = "ATIVO_CIRCULANTE";
        return;
      }

      if (normalConta === "PASSIVO") {
        currentSection = "PASSIVO";
        currentTipo = "PASSIVO_CIRCULANTE";
        return;
      }

      if (!currentSection) return;

      const numericValues = cells.filter((v) => typeof v === "number" && !isNaN(v)) as number[];

      if (!numericValues.length) {
        validationRows.push({
          rowIndex: index + 1,
          textoConta: conta,
          numerosDetectados: [],
          mensagem: "Linha sem valores numéricos detectáveis",
        });
        return;
      }

      const valorAtual = numericValues[0];
      const valorAnterior = numericValues.length > 1 ? numericValues[1] : null;
      const totalLine = isTotalLine(conta);

      if (!totalLine) {
        if (currentSection === "ATIVO") {
          metrics.ativoTotal += Math.abs(valorAtual);
          currentTipo === "ATIVO_CIRCULANTE"
            ? (metrics.ativoCirculante += Math.abs(valorAtual))
            : (metrics.ativoNaoCirculante += Math.abs(valorAtual));
        }

        if (currentSection === "PASSIVO") {
          metrics.passivoTotal += Math.abs(valorAtual);
          currentTipo === "PASSIVO_CIRCULANTE"
            ? (metrics.passivoCirculante += Math.abs(valorAtual))
            : (metrics.passivoNaoCirculante += Math.abs(valorAtual));
        }
      }

      entries.push({
        conta,
        tipo: currentTipo,
        valor: valorAtual,
        valor_anterior: valorAnterior,
        hierarchy: `${currentSection}.${conta}`,
        raw_row: JSON.stringify(row),
      });
    });

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
      metrics,
      validationRows,
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

    rows.forEach((row) => {
      const cells = Object.values(row)
        .map((v) => (typeof v === "string" ? v.trim() : v))
        .filter((v) => v !== null && v !== "");

      if (!cells.length) return;

      const descricao = cells.find((v) => typeof v === "string") as string | undefined;
      if (!descricao) return;

      const numericValues = cells.filter((v) => typeof v === "number" && !isNaN(v)) as number[];

      if (!numericValues.length) return;

      entries.push({
        descricao,
        valor: numericValues[0],
        valor_anterior: numericValues[1] ?? null,
        raw_row: JSON.stringify(row),
      });
    });

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
