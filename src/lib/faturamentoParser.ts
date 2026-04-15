import * as XLSX from "xlsx";
import Papa from "papaparse";

export interface FaturamentoEntry {
  mes: string;
  ano: number;
  saidas: number;
  servicos: number;
  outros: number;
  total: number;
}

export interface FaturamentoParseResult {
  entries: FaturamentoEntry[];
  periodo: string;
  errors: string[];
  parsed: boolean;
}

const MESES_VALIDOS = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "MARCO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];

const MESES_NORMALIZADOS: Record<string, string> = {
  JANEIRO: "Janeiro", FEVEREIRO: "Fevereiro", MARÇO: "Março", MARCO: "Março",
  ABRIL: "Abril", MAIO: "Maio", JUNHO: "Junho", JULHO: "Julho",
  AGOSTO: "Agosto", SETEMBRO: "Setembro", OUTUBRO: "Outubro",
  NOVEMBRO: "Novembro", DEZEMBRO: "Dezembro",
};

function parseBRNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return value;
  let cleaned = value.toString().trim();
  cleaned = cleaned.replace(/[()]/g, "");
  cleaned = cleaned.replace(/R\$\s*/gi, "");
  cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

export async function parseFaturamentoFile(file: File): Promise<FaturamentoParseResult> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const errors: string[] = [];

  let rows: string[][] = [];

  try {
    if (ext === "csv") {
      rows = await new Promise((resolve, reject) => {
        Papa.parse(file, {
          complete: (r) => resolve(r.data as string[][]),
          error: reject,
        });
      });
    } else if (ext === "xls" || ext === "xlsx") {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as string[][];
    } else if (ext === "pdf") {
      // PDF text should be pre-extracted and passed as text rows
      errors.push("PDF de faturamento deve ser processado via extração de texto.");
      return { entries: [], periodo: "", errors, parsed: false };
    } else {
      errors.push("Formato não suportado para faturamento.");
      return { entries: [], periodo: "", errors, parsed: false };
    }
  } catch (e) {
    errors.push(`Erro ao ler arquivo: ${e instanceof Error ? e.message : "desconhecido"}`);
    return { entries: [], periodo: "", errors, parsed: false };
  }

  return parseFaturamentoRows(rows, errors);
}

export function parseFaturamentoFromText(text: string): FaturamentoParseResult {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const rows = lines.map(l => l.split(/\s{2,}|\t/));
  return parseFaturamentoRows(rows, []);
}

function parseFaturamentoRows(rows: string[][], errors: string[]): FaturamentoParseResult {
  const entries: FaturamentoEntry[] = [];
  let periodo = "";

  // Find periodo
  for (const row of rows) {
    const rowText = row.join(" ");
    const periodoMatch = rowText.match(/Per[íi]odo[:\s]+(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (periodoMatch) {
      periodo = `${periodoMatch[1]} a ${periodoMatch[2]}`;
      break;
    }
  }

  // Parse data rows
  for (const row of rows) {
    const cells = row.map(c => String(c).trim());
    if (cells.length < 4) continue;

    // Find month name in first meaningful cell
    const firstCell = cells[0].toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    if (firstCell === "TOTAIS" || firstCell === "TOTAL") continue;

    const mesMatch = MESES_VALIDOS.find(m => {
      const norm = m.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return firstCell === norm || firstCell.startsWith(norm);
    });

    if (!mesMatch) continue;

    const mesNormalizado = MESES_NORMALIZADOS[mesMatch] || mesMatch;

    // Find numeric cells
    const numericCells = cells.slice(1).map(parseBRNumber);
    
    // Expected: ano, saidas, servicos, outros, total
    // Or just: saidas, servicos, outros, total (without year column)
    let ano = 0;
    let saidas = 0, servicos = 0, outros = 0, total = 0;

    if (numericCells.length >= 5) {
      // ano, saidas, servicos, outros, total
      ano = Math.round(numericCells[0]);
      saidas = numericCells[1];
      servicos = numericCells[2];
      outros = numericCells[3];
      total = numericCells[4];
    } else if (numericCells.length >= 4) {
      // Check if first numeric is a year
      if (numericCells[0] >= 2000 && numericCells[0] <= 2100) {
        ano = Math.round(numericCells[0]);
        saidas = numericCells[1];
        servicos = numericCells[2];
        total = numericCells[3];
      } else {
        saidas = numericCells[0];
        servicos = numericCells[1];
        outros = numericCells[2];
        total = numericCells[3];
      }
    }

    if (total === 0 && saidas > 0) {
      total = saidas + servicos + outros;
    }

    if (ano === 0) {
      // Try to extract year from periodo
      const yearMatch = periodo.match(/(\d{4})/);
      if (yearMatch) ano = parseInt(yearMatch[1]);
      else ano = new Date().getFullYear();
    }

    entries.push({ mes: mesNormalizado, ano, saidas, servicos, outros, total });
  }

  if (entries.length === 0) {
    errors.push("Nenhum dado de faturamento encontrado no arquivo.");
  }

  return { entries, periodo: periodo || `${entries[0]?.ano || new Date().getFullYear()}`, errors, parsed: entries.length > 0 };
}
