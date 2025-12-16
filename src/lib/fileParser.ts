import * as XLSX from "xlsx";
import Papa from "papaparse";

export interface DREData {
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  cmv: number;
  lucroBruto: number;
  despesasOperacionais: number;
  lucroOperacional: number;
  resultadoFinanceiro: number;
  lucroLiquido: number;
  margemBruta: number;
  margemOperacional: number;
  margemLiquida: number;
}

export interface BalancoData {
  ativoCirculante: number;
  ativoNaoCirculante: number;
  ativoTotal: number;
  passivoCirculante: number;
  passivoNaoCirculante: number;
  passivoTotal: number;
  patrimonioLiquido: number;
}

export interface FinancialAnalysis {
  dre: DREData;
  balanco: BalancoData;
  insights: string[];
}

// Parse number from Brazilian format
function parseNumber(value: string | number | undefined): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return value;

  // Remove spaces and handle Brazilian number format
  let cleaned = value.toString().trim();

  // Remove 'd' or 'c' suffix (debit/credit indicator)
  cleaned = cleaned.replace(/[dc]$/i, "");

  // Handle parentheses as negative
  const isNegative = cleaned.includes("(") || cleaned.includes(")");
  cleaned = cleaned.replace(/[()]/g, "");

  // Remove dots (thousands separator) and replace comma with dot (decimal)
  cleaned = cleaned.replace(/\./g, "").replace(",", ".");

  const num = parseFloat(cleaned) || 0;
  return isNegative ? -Math.abs(num) : num;
}

// Find value by keyword in rows
function findValueByKeyword(rows: string[][], keywords: string[], columnIndex: number = -1): number {
  for (const row of rows) {
    const rowText = row.join(" ").toLowerCase();
    for (const keyword of keywords) {
      if (rowText.includes(keyword.toLowerCase())) {
        // Find the value column - usually the one with numbers
        for (let i = row.length - 1; i >= 0; i--) {
          const val = parseNumber(row[i]);
          if (val !== 0) return val;
        }
      }
    }
  }
  return 0;
}

// Find subtotal value (usually in a specific column pattern)
function findSubtotalValue(rows: string[][], keywords: string[]): number {
  for (const row of rows) {
    const rowText = row.join(" ").toLowerCase();
    for (const keyword of keywords) {
      if (rowText.includes(keyword.toLowerCase())) {
        // Look for values in later columns (subtotal columns)
        for (let i = row.length - 1; i >= Math.max(0, row.length - 4); i--) {
          const val = parseNumber(row[i]);
          if (val !== 0) return val;
        }
      }
    }
  }
  return 0;
}

export function parseDRE(data: string[][]): DREData {
  // Filter out empty rows
  const rows = data.filter((row) => row.some((cell) => cell && cell.toString().trim()));

  // Find key values based on Brazilian accounting terminology
  const receitaBruta = Math.abs(
    findSubtotalValue(rows, ["receita operacional", "receita bruta", "vendas de mercadorias", "prestação de serviços"]),
  );

  // Get individual revenue components if main total not found
  let totalReceita = receitaBruta;
  if (totalReceita === 0) {
    const vendasMerc = Math.abs(findValueByKeyword(rows, ["vendas de mercadorias"]));
    const servicos = Math.abs(findValueByKeyword(rows, ["prestação de serviços"]));
    totalReceita = vendasMerc + servicos;
  }

  // Use the subtotal from "Receita Líquida" row if available
  const receitaLiquida = Math.abs(findSubtotalValue(rows, ["receita líquida"])) || totalReceita;

  const deducoes = Math.abs(findSubtotalValue(rows, ["impostos sobre vendas", "devoluções e abatimentos"]));

  const cmv = Math.abs(findSubtotalValue(rows, ["custos mercadorias vendidas", "custos dos produtos", "cmv", "cpv"]));

  const lucroBruto = Math.abs(findSubtotalValue(rows, ["lucro bruto", "resultado bruto"])) || receitaLiquida - cmv;

  const despesasOperacionais = Math.abs(
    findSubtotalValue(rows, ["despesas trabalhistas", "despesas gerais", "despesas operacionais"]),
  );

  // Calculate total operational expenses
  let totalDespesas = despesasOperacionais;
  if (totalDespesas === 0) {
    const despTrab = Math.abs(findSubtotalValue(rows, ["despesas trabalhistas administrativas"]));
    const despGerais = Math.abs(findSubtotalValue(rows, ["despesas gerais administrativas"]));
    totalDespesas = despTrab + despGerais;
  }

  const resultadoFinanceiro = findSubtotalValue(rows, [
    "resultado financeiro",
    "receitas financeiras",
    "despesas financeiras",
  ]);

  const lucroLiquido = findSubtotalValue(rows, [
    "lucro do exercício",
    "lucro líquido",
    "resultado do exercício",
    "lucro do período",
  ]);

  const lucroOperacional =
    findSubtotalValue(rows, ["lucro operacional", "resultado operacional"]) || lucroBruto - totalDespesas;

  // Calculate margins
  const margemBruta = receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0;
  const margemOperacional = receitaLiquida > 0 ? (lucroOperacional / receitaLiquida) * 100 : 0;
  const margemLiquida = receitaLiquida > 0 ? (Math.abs(lucroLiquido) / receitaLiquida) * 100 : 0;

  return {
    receitaBruta: totalReceita,
    deducoes,
    receitaLiquida,
    cmv,
    lucroBruto,
    despesasOperacionais: totalDespesas,
    lucroOperacional,
    resultadoFinanceiro,
    lucroLiquido: Math.abs(lucroLiquido),
    margemBruta,
    margemOperacional,
    margemLiquida,
  };
}

export function parseBalanco(data: string[][]): BalancoData {
  const rows = data.filter((row) => row.some((cell) => cell && cell.toString().trim()));

  // Find main categories
  const ativoTotal = Math.abs(findSubtotalValue(rows, ["ativo"]));
  const ativoCirculante = Math.abs(findSubtotalValue(rows, ["circulante"]));

  // For non-current, look for the specific pattern
  let ativoNaoCirculante = Math.abs(findSubtotalValue(rows, ["não circulante", "nao circulante", "permanente"]));
  if (ativoNaoCirculante === 0 && ativoTotal > 0 && ativoCirculante > 0) {
    ativoNaoCirculante = ativoTotal - ativoCirculante;
  }

  // Find passive values
  const passivoRows = rows.filter((row) => row.join(" ").toLowerCase().includes("passivo"));
  let passivoCirculante = 0;
  let passivoNaoCirculante = 0;
  let passivoTotal = 0;

  for (const row of rows) {
    const rowText = row.join(" ").toLowerCase();
    if (rowText.includes("passivo") && !rowText.includes("não circulante") && !rowText.includes("nao circulante")) {
      if (rowText.includes("circulante")) {
        for (let i = row.length - 1; i >= 0; i--) {
          const val = parseNumber(row[i]);
          if (val !== 0) {
            passivoCirculante = Math.abs(val);
            break;
          }
        }
      }
    }
    if (rowText.includes("passivo") && (rowText.includes("não circulante") || rowText.includes("nao circulante"))) {
      for (let i = row.length - 1; i >= 0; i--) {
        const val = parseNumber(row[i]);
        if (val !== 0) {
          passivoNaoCirculante = Math.abs(val);
          break;
        }
      }
    }
  }

  // Find PL
  const patrimonioLiquido = Math.abs(
    findSubtotalValue(rows, ["patrimônio líquido", "patrimonio liquido", "capital social"]),
  );

  // Calculate passivo total if not found directly
  passivoTotal = passivoCirculante + passivoNaoCirculante;

  return {
    ativoCirculante,
    ativoNaoCirculante,
    ativoTotal: ativoTotal || ativoCirculante + ativoNaoCirculante,
    passivoCirculante,
    passivoNaoCirculante,
    passivoTotal,
    patrimonioLiquido,
  };
}

export function generateInsights(dre: DREData, balanco: BalancoData): string[] {
  const insights: string[] = [];

  // Margin analysis
  if (dre.margemLiquida > 20) {
    insights.push(
      "✅ Margem líquida excelente, acima de 20%. A empresa demonstra alta eficiência na conversão de receitas em lucro.",
    );
  } else if (dre.margemLiquida > 10) {
    insights.push("👍 Margem líquida saudável entre 10-20%. Há espaço para otimização de custos.");
  } else if (dre.margemLiquida > 0) {
    insights.push(
      "⚠️ Margem líquida abaixo de 10%. Recomenda-se revisão de custos operacionais e estratégia de preços.",
    );
  } else {
    insights.push("🚨 Empresa operando com prejuízo. Necessária reestruturação urgente de custos.");
  }

  // Revenue analysis
  if (dre.receitaLiquida > 10000000) {
    insights.push("📈 Receita líquida acima de R$ 10 milhões indica operação de grande porte.");
  } else if (dre.receitaLiquida > 1000000) {
    insights.push("📊 Receita líquida na faixa de R$ 1-10 milhões, característica de empresa de médio porte.");
  }

  // Balance sheet analysis
  if (balanco.ativoTotal > 0 && balanco.passivoTotal > 0) {
    const liquidezGeral = balanco.ativoCirculante / balanco.passivoCirculante;
    if (liquidezGeral > 2) {
      insights.push(
        "💰 Liquidez corrente excelente. A empresa tem folga financeira para honrar compromissos de curto prazo.",
      );
    } else if (liquidezGeral > 1) {
      insights.push("💵 Liquidez corrente adequada. Ativo circulante cobre as obrigações de curto prazo.");
    } else {
      insights.push(
        "⚠️ Liquidez corrente preocupante. Pode haver dificuldades no pagamento de obrigações de curto prazo.",
      );
    }
  }

  // Equity analysis
  if (balanco.patrimonioLiquido > 0) {
    const proporcaoPL = (balanco.patrimonioLiquido / (balanco.ativoTotal || 1)) * 100;
    if (proporcaoPL > 50) {
      insights.push("🏦 Estrutura de capital sólida com baixa dependência de terceiros.");
    } else if (proporcaoPL > 30) {
      insights.push("📋 Estrutura de capital equilibrada entre capital próprio e de terceiros.");
    } else {
      insights.push("⚡ Alta alavancagem financeira. Empresa depende significativamente de capital de terceiros.");
    }
  }

  return insights;
}

export async function parseFile(file: File): Promise<string[][]> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        complete: (results) => {
          resolve(results.data as string[][]);
        },
        error: (error) => {
          reject(error);
        },
      });
    });
  } else if (extension === "xls" || extension === "xlsx") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as string[][];
    return data;
  }

  throw new Error("Formato de arquivo não suportado. Use CSV, XLS ou XLSX.");
}

export async function analyzeFinancials(dreFile: File, balancoFile: File): Promise<FinancialAnalysis> {
  const dreData = await parseFile(dreFile);
  const balancoData = await parseFile(balancoFile);

  const dre = parseDRE(dreData);
  const balanco = parseBalanco(balancoData);
  const insights = generateInsights(dre, balanco);

  return { dre, balanco, insights };
}
