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

  // Try tabular rows first (XLS-like with tabs or multiple spaces)
  const tabulatedRows = lines.map(l => l.split(/\s{2,}|\t/));
  const tabResult = parseFaturamentoRows(tabulatedRows, []);
  if (tabResult.parsed) return tabResult;

  // Fallback: PDF vertical format where each field is on its own line
  // Pattern: ANO (2025) → MÊS (Janeiro) → Saídas → Serviços → Outros → Total
  return parseFaturamentoVerticalLines(lines);
}

function parseFaturamentoVerticalLines(lines: string[]): FaturamentoParseResult {
  const entries: FaturamentoEntry[] = [];
  const errors: string[] = [];
  let periodo = "";

  // Find periodo by scanning consecutive lines
  for (let i = 0; i < lines.length - 2; i++) {
    if (/per[íi]odo/i.test(lines[i])) {
      // Periodo might be split across lines: "Período:" "01/01/2025" "31/12/2025" with optional "a"
      const dateLines = lines.slice(i, i + 5).join(" ");
      const periodoMatch = dateLines.match(/(\d{2}\/\d{2}\/\d{4})\s*a?\s*(\d{2}\/\d{2}\/\d{4})/);
      if (periodoMatch) {
        periodo = `${periodoMatch[1]} a ${periodoMatch[2]}`;
      }
      break;
    }
  }

  // Scan for pattern: year line → month line → 4 numeric lines (saidas, servicos, outros, total)
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lineUpper = line.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Skip "Totais" row
    if (lineUpper === "TOTAIS" || lineUpper === "TOTAL") {
      i++;
      continue;
    }

    // Check if this line is a month name
    const mesMatch = MESES_VALIDOS.find(m => {
      const norm = m.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return lineUpper === norm || lineUpper.startsWith(norm);
    });

    if (mesMatch) {
      const mesNormalizado = MESES_NORMALIZADOS[mesMatch] || mesMatch;

      // Look backwards for year (the line before the month might be the year)
      let ano = 0;
      if (i > 0) {
        const prevVal = parseInt(lines[i - 1]);
        if (prevVal >= 2000 && prevVal <= 2100) {
          ano = prevVal;
        }
      }

      // Look forward for 4 numeric values: saidas, servicos, outros, total
      const numericValues: number[] = [];
      let j = i + 1;
      while (j < lines.length && numericValues.length < 4) {
        const val = parseBRNumber(lines[j]);
        const isNumericLine = /^[\d.,\-()R$\s]+$/.test(lines[j].trim());
        if (isNumericLine || val !== 0 || lines[j].trim() === "0,00" || lines[j].trim() === "0") {
          numericValues.push(val);
          j++;
        } else {
          break;
        }
      }

      if (numericValues.length >= 4) {
        const saidas = numericValues[0];
        const servicos = numericValues[1];
        const outros = numericValues[2];
        const total = numericValues[3];

        if (ano === 0) {
          const yearMatch = periodo.match(/(\d{4})/);
          if (yearMatch) ano = parseInt(yearMatch[1]);
          else ano = new Date().getFullYear();
        }

        entries.push({ mes: mesNormalizado, ano, saidas, servicos, outros, total });
        i = j; // Skip past the consumed numeric lines
        continue;
      }
    }

    i++;
  }

  if (entries.length === 0) {
    errors.push("Nenhum dado de faturamento encontrado no arquivo.");
  }

  return {
    entries,
    periodo: periodo || `${entries[0]?.ano || new Date().getFullYear()}`,
    errors,
    parsed: entries.length > 0,
  };
}

function parseFaturamentoRows(rows: string[][], errors: string[]): FaturamentoParseResult {
  const entries: FaturamentoEntry[] = [];
  let periodo = "";

  for (const row of rows) {
    const rowText = row.join(" ");
    const periodoMatch = rowText.match(/Per[íi]odo[:\s]+(\d{2}\/\d{2}\/\d{4})\s*a?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (periodoMatch) {
      periodo = `${periodoMatch[1]} a ${periodoMatch[2]}`;
      break;
    }
  }

  for (const row of rows) {
    const cells = row.map((c) => String(c).trim()).filter(Boolean);
    if (cells.length === 0) continue;

    const firstCell = cells[0].toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (firstCell === "TOTAIS" || firstCell === "TOTAL" || firstCell.startsWith("TOTAIS ")) continue;

    const mesMatch = MESES_VALIDOS.find((m) => {
      const norm = m.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return firstCell === norm || firstCell.startsWith(norm);
    });

    if (!mesMatch) continue;

    const mesNormalizado = MESES_NORMALIZADOS[mesMatch] || mesMatch;

    const rowText = cells.join(" ");
    const anoFromRow = rowText.match(/\b(20\d{2})\b/);
    let ano = anoFromRow ? parseInt(anoFromRow[1], 10) : 0;

    const numericSource = cells.length > 1 ? cells.slice(1).join(" ") : rowText.replace(cells[0], "").trim();
    const brNumberMatches = numericSource.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+(?:,\d{2})?/g) ?? [];
    const numericCells = brNumberMatches.map(parseBRNumber);

    let saidas = 0;
    let servicos = 0;
    let outros = 0;
    let total = 0;

    if (numericCells.length >= 5 && !ano && numericCells[0] >= 2000 && numericCells[0] <= 2100) {
      // First numeric is the year (e.g. "Janeiro 2025 525.614,08 4.880,00 0,00 530.494,08")
      ano = Math.round(numericCells[0]);
      saidas = numericCells[1];
      servicos = numericCells[2];
      outros = numericCells[3];
      total = numericCells[4];
    } else if (numericCells.length >= 4) {
      saidas = numericCells[0];
      servicos = numericCells[1];
      outros = numericCells[2];
      total = numericCells[3];
    } else {
      const legacyNumericCells = cells.slice(1).map(parseBRNumber);
      if (legacyNumericCells.length >= 5) {
        if (!ano && legacyNumericCells[0] >= 2000 && legacyNumericCells[0] <= 2100) {
          ano = Math.round(legacyNumericCells[0]);
        }
        saidas = legacyNumericCells[1];
        servicos = legacyNumericCells[2];
        outros = legacyNumericCells[3];
        total = legacyNumericCells[4];
      } else if (legacyNumericCells.length >= 4) {
        if (!ano && legacyNumericCells[0] >= 2000 && legacyNumericCells[0] <= 2100) {
          ano = Math.round(legacyNumericCells[0]);
          saidas = legacyNumericCells[1];
          servicos = legacyNumericCells[2];
          total = legacyNumericCells[3];
        } else {
          saidas = legacyNumericCells[0];
          servicos = legacyNumericCells[1];
          outros = legacyNumericCells[2];
          total = legacyNumericCells[3];
        }
      }
    }

    if (total === 0 && (saidas > 0 || servicos > 0 || outros > 0)) {
      total = saidas + servicos + outros;
    }

    if (ano === 0) {
      const yearMatch = periodo.match(/(\d{4})/);
      if (yearMatch) ano = parseInt(yearMatch[1], 10);
      else ano = new Date().getFullYear();
    }

    if (saidas === 0 && servicos === 0 && outros === 0 && total === 0) continue;

    entries.push({ mes: mesNormalizado, ano, saidas, servicos, outros, total });
  }

  if (entries.length === 0) {
    errors.push("Nenhum dado de faturamento encontrado no arquivo.");
  }

  return {
    entries,
    periodo: periodo || `${entries[0]?.ano || new Date().getFullYear()}`,
    errors,
    parsed: entries.length > 0,
  };
}
