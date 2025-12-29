import * as XLSX from "xlsx";

/* =========================================================
   TIPOS – BALANÇO
========================================================= */

export interface ParsedBalancoEntry {
  conta: string;
  tipo:
    | "ATIVO_TOTAL"
    | "ATIVO_CIRCULANTE"
    | "ATIVO_NAO_CIRCULANTE"
    | "PASSIVO_TOTAL"
    | "PASSIVO_CIRCULANTE"
    | "PASSIVO_NAO_CIRCULANTE"
    | "PATRIMONIO_LIQUIDO";
  valor: number;
  valor_anterior?: number;
  hierarchy: number;
  raw_row: unknown;
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

/* =========================================================
   TIPOS – DRE
========================================================= */

export interface ParsedDREEntry {
  descricao: string;
  tipo: "RECEITA" | "CUSTO" | "DESPESA" | "RESULTADO_OPERACIONAL" | "RESULTADO_LIQUIDO";
  valor: number;
  hierarchy: number;
  raw_row: unknown;
}

/* =========================================================
   HELPERS NUMÉRICOS (FONTE ÚNICA)
========================================================= */

function isNumericCell(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return true;
  if (typeof value !== "string") return false;

  const cleaned = value.replace(/\./g, "").replace(",", ".").replace(/\s/g, "");

  return cleaned !== "" && !isNaN(Number(cleaned));
}

function parseBrazilianNumber(value: unknown): number {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/\./g, "").replace(",", ".").replace(/\s/g, "");
    const parsed = Number(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

/**
 * REGRA DE OURO:
 * 👉 O VALOR É SEMPRE O ÚLTIMO NÚMERO DA LINHA
 */
function extractLastNumericFromRow(row: unknown[]): number {
  for (let i = row.length - 1; i >= 0; i--) {
    if (isNumericCell(row[i])) {
      return Math.abs(parseBrazilianNumber(row[i]));
    }
  }
  return 0;
}

/* =========================================================
   PARSER – BALANÇO PATRIMONIAL (XLS)
========================================================= */

export async function parseBalancoFromXLS(file: File): Promise<{
  entries: ParsedBalancoEntry[];
  metrics: BalancoMetrics;
  periodo?: string;
  errors: string[];
}> {
  const errors: string[] = [];
  const entries: ParsedBalancoEntry[] = [];

  const metrics: BalancoMetrics = {
    ativoTotal: 0,
    ativoCirculante: 0,
    ativoNaoCirculante: 0,
    passivoTotal: 0,
    passivoCirculante: 0,
    passivoNaoCirculante: 0,
    patrimonioLiquido: 0,
  };

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
  });

  type Section = "ATIVO" | "PASSIVO" | "PL" | null;
  type Subsection = "CIRCULANTE" | "NAO_CIRCULANTE" | null;

  let currentSection: Section = null;
  let currentSubsection: Subsection = null;

  for (const row of rows) {
    if (!row || row.length === 0) continue;

    const descricao = typeof row[0] === "string" ? row[0].toUpperCase().trim() : "";
    if (!descricao) continue;

    /* ===== SEÇÕES ===== */

    if (descricao === "ATIVO") {
      currentSection = "ATIVO";
      currentSubsection = null;
      const valor = extractLastNumericFromRow(row);
      metrics.ativoTotal = valor;

      entries.push({
        conta: "ATIVO",
        tipo: "ATIVO_TOTAL",
        valor,
        hierarchy: 0,
        raw_row: row,
      });
      continue;
    }

    if (descricao === "PASSIVO") {
      currentSection = "PASSIVO";
      currentSubsection = null;
      const valor = extractLastNumericFromRow(row);
      metrics.passivoTotal = valor;

      entries.push({
        conta: "PASSIVO",
        tipo: "PASSIVO_TOTAL",
        valor,
        hierarchy: 0,
        raw_row: row,
      });
      continue;
    }

    if (descricao.includes("PATRIMÔNIO LÍQUIDO")) {
      currentSection = "PL";
      currentSubsection = null;
      const valor = extractLastNumericFromRow(row);
      metrics.patrimonioLiquido = valor;

      entries.push({
        conta: "PATRIMÔNIO LÍQUIDO",
        tipo: "PATRIMONIO_LIQUIDO",
        valor,
        hierarchy: 0,
        raw_row: row,
      });
      continue;
    }

    /* ===== SUBSEÇÕES ===== */

    if (descricao === "CIRCULANTE") {
      currentSubsection = "CIRCULANTE";
      const valor = extractLastNumericFromRow(row);

      if (currentSection === "ATIVO") metrics.ativoCirculante = valor;
      if (currentSection === "PASSIVO") metrics.passivoCirculante = valor;

      entries.push({
        conta: "CIRCULANTE",
        tipo: currentSection === "ATIVO" ? "ATIVO_CIRCULANTE" : "PASSIVO_CIRCULANTE",
        valor,
        hierarchy: 1,
        raw_row: row,
      });
      continue;
    }

    if (descricao.includes("NÃO CIRCULANTE")) {
      currentSubsection = "NAO_CIRCULANTE";
      const valor = extractLastNumericFromRow(row);

      if (currentSection === "ATIVO") metrics.ativoNaoCirculante = valor;
      if (currentSection === "PASSIVO") metrics.passivoNaoCirculante = valor;

      entries.push({
        conta: "NÃO CIRCULANTE",
        tipo: currentSection === "ATIVO" ? "ATIVO_NAO_CIRCULANTE" : "PASSIVO_NAO_CIRCULANTE",
        valor,
        hierarchy: 1,
        raw_row: row,
      });
      continue;
    }

    /* ===== CONTAS ANALÍTICAS ===== */

    const valor = extractLastNumericFromRow(row);
    if (valor === 0) continue;

    let tipo: ParsedBalancoEntry["tipo"] | null = null;

    if (currentSection === "ATIVO" && currentSubsection === "CIRCULANTE") tipo = "ATIVO_CIRCULANTE";
    if (currentSection === "ATIVO" && currentSubsection === "NAO_CIRCULANTE") tipo = "ATIVO_NAO_CIRCULANTE";
    if (currentSection === "PASSIVO" && currentSubsection === "CIRCULANTE") tipo = "PASSIVO_CIRCULANTE";
    if (currentSection === "PASSIVO" && currentSubsection === "NAO_CIRCULANTE") tipo = "PASSIVO_NAO_CIRCULANTE";

    if (!tipo) continue;

    entries.push({
      conta: descricao,
      tipo,
      valor,
      hierarchy: 2,
      raw_row: row,
    });
  }

  return { entries, metrics, errors };
}

/* =========================================================
   PARSER – DRE (XLS)
========================================================= */

export async function parseDREFromXLS(file: File): Promise<{
  entries: ParsedDREEntry[];
  errors: string[];
}> {
  const errors: string[] = [];
  const entries: ParsedDREEntry[] = [];

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
  });

  type DreSection = "RECEITA" | "CUSTO" | "DESPESA" | "RESULTADO_OPERACIONAL" | "RESULTADO_LIQUIDO" | null;

  let currentSection: DreSection = null;

  for (const row of rows) {
    if (!row || row.length === 0) continue;

    const descricao = typeof row[0] === "string" ? row[0].toUpperCase().trim() : "";
    if (!descricao) continue;

    /* ===== SEÇÕES PRINCIPAIS ===== */

    if (descricao.includes("RECEITA")) {
      currentSection = "RECEITA";
      continue;
    }

    if (descricao.includes("CUSTO")) {
      currentSection = "CUSTO";
      continue;
    }

    if (descricao.includes("DESPESA")) {
      currentSection = "DESPESA";
      continue;
    }

    if (descricao.includes("RESULTADO OPERACIONAL")) {
      currentSection = "RESULTADO_OPERACIONAL";
      const valor = extractLastNumericFromRow(row);

      entries.push({
        descricao: "RESULTADO OPERACIONAL",
        tipo: "RESULTADO_OPERACIONAL",
        valor,
        hierarchy: 0,
        raw_row: row,
      });
      continue;
    }

    if (descricao.includes("RESULTADO LÍQUIDO")) {
      currentSection = "RESULTADO_LIQUIDO";
      const valor = extractLastNumericFromRow(row);

      entries.push({
        descricao: "RESULTADO LÍQUIDO",
        tipo: "RESULTADO_LIQUIDO",
        valor,
        hierarchy: 0,
        raw_row: row,
      });
      continue;
    }

    /* ===== CONTAS ANALÍTICAS ===== */

    const valor = extractLastNumericFromRow(row);
    if (valor === 0 || !currentSection) continue;

    entries.push({
      descricao,
      tipo: currentSection,
      valor,
      hierarchy: 1,
      raw_row: row,
    });
  }

  return { entries, errors };
}
/* =========================================================
   AUTO DISPATCHER (COMPATIBILIDADE COM UPLOAD)
========================================================= */

export async function parseBalancoFileAuto(file: File) {
  const fileName = file.name.toLowerCase();

  if (fileName.includes("dre") || fileName.includes("resultado") || fileName.includes("d.r.e")) {
    return {
      type: "DRE",
      ...(await parseDREFromXLS(file)),
    };
  }

  return {
    type: "BALANCO",
    ...(await parseBalancoFromXLS(file)),
  };
}
