/**
 * Synthetic vs Analytic Account Detector
 * 
 * Identifies which accounting entries are "synthetic" (group totals) vs "analytic" (leaf/detail accounts).
 * Only analytic (leaf) accounts should be summed in dashboard indicators to avoid double-counting.
 */

function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Known group names that are always synthetic (totals)
const KNOWN_SYNTHETIC_EXACT = new Set([
  "ATIVO",
  "PASSIVO",
  "CIRCULANTE",
  "NAO CIRCULANTE",
  "ATIVO CIRCULANTE",
  "ATIVO NAO CIRCULANTE",
  "PASSIVO CIRCULANTE",
  "PASSIVO NAO CIRCULANTE",
  "PATRIMONIO LIQUIDO",
  "ATIVO TOTAL",
  "PASSIVO TOTAL",
  "TOTAL DO ATIVO",
  "TOTAL DO PASSIVO",
  "TOTAL DO PATRIMONIO LIQUIDO",
  "TOTAL GERAL",
]);

// Generic group names that are synthetic when followed by specific sub-items
const GENERIC_GROUP_PATTERNS = [
  "DISPONIBILIDADES",
  "IMPOSTOS A RECUPERAR",
  "TRIBUTOS A RECUPERAR",
  "ESTOQUES",
  "IMOBILIZADO",
  "INTANGIVEL",
  "INVESTIMENTOS",
  "OBRIGACOES TRABALHISTAS",
  "OBRIGACOES FISCAIS",
  "OBRIGACOES SOCIAIS",
  "FORNECEDORES",
  "EMPRESTIMOS E FINANCIAMENTOS",
  "CAPITAL SOCIAL",
  "RESERVAS",
  "RESERVAS DE LUCROS",
  "CONTAS A RECEBER",
  "CONTAS A PAGAR",
  "DESPESAS ANTECIPADAS",
  "CREDITOS",
  "APLICACOES FINANCEIRAS",
];

export interface SyntheticDetectionInput {
  conta: string;
  valor: number;
  indent_level?: number;
  is_bold?: boolean;
}

export interface SyntheticDetectionResult {
  natureza_conta: "sintetica" | "analitica";
  detection_motivo: string;
}

/**
 * Detect synthetic (totals) vs analytic (leaf) accounts in an ordered list.
 * 
 * Rules (priority order):
 * 1. Known exact synthetic names → synthetic
 * 2. Sum-of-children: if value ≈ sum of immediately following deeper-indented entries → synthetic
 * 3. Bold + generic group name → synthetic
 * 4. Generic group name followed by more-indented entries → synthetic
 * 5. Everything else → analytic
 */
export function detectSyntheticEntries<T extends SyntheticDetectionInput>(
  entries: T[],
  tolerance: number = 0.02
): (T & SyntheticDetectionResult)[] {
  if (!entries || entries.length === 0) return [];

  const results: (T & SyntheticDetectionResult)[] = entries.map((e) => ({
    ...e,
    natureza_conta: "analitica" as const,
    detection_motivo: "Conta analítica (folha)",
  }));

  // Pre-compute indent levels: use provided indent_level, or infer from name patterns
  const levels = results.map((e) => e.indent_level ?? inferIndentLevel(e.conta));

  for (let i = 0; i < results.length; i++) {
    const entry = results[i];
    const norm = normalizeText(entry.conta);
    const val = Math.abs(entry.valor);
    const currentLevel = levels[i];

    // Rule 1: Known exact synthetic names
    if (KNOWN_SYNTHETIC_EXACT.has(norm)) {
      results[i].natureza_conta = "sintetica";
      results[i].detection_motivo = "Totalizador de Grupo";
      continue;
    }

    // Rule 2: Sum-of-children check
    if (val > 0) {
      const childResult = checkSumOfChildren(results, levels, i, val, tolerance);
      if (childResult) {
        results[i].natureza_conta = "sintetica";
        results[i].detection_motivo = childResult;
        continue;
      }
    }

    // Rule 3: Bold + generic group name
    if (entry.is_bold && isGenericGroupName(norm)) {
      results[i].natureza_conta = "sintetica";
      results[i].detection_motivo = "Conta em negrito com nome genérico de grupo";
      continue;
    }

    // Rule 4: Generic group name followed by deeper-indented entries
    if (isGenericGroupName(norm) && hasChildrenBelow(levels, i)) {
      // Verify via sum check with higher tolerance
      const childResult = checkSumOfChildren(results, levels, i, val, 0.05);
      if (childResult) {
        results[i].natureza_conta = "sintetica";
        results[i].detection_motivo = childResult;
        continue;
      }
    }
  }

  return results;
}

/**
 * Check if an entry's value equals the sum of its children (deeper-indented entries following it).
 * Returns a description string if synthetic, null if not.
 */
function checkSumOfChildren<T extends SyntheticDetectionInput>(
  entries: (T & SyntheticDetectionResult)[],
  levels: number[],
  parentIndex: number,
  parentVal: number,
  tolerance: number
): string | null {
  if (parentVal === 0) return null;

  const parentLevel = levels[parentIndex];
  let sum = 0;
  let childCount = 0;
  let foundDeeperEntries = false;

  for (let j = parentIndex + 1; j < entries.length; j++) {
    const childLevel = levels[j];

    // If we hit an entry at same or lower level, this group is done
    if (childLevel <= parentLevel) break;

    foundDeeperEntries = true;

    // Only count direct children (one level deeper) or any deeper entries
    // that aren't already marked as synthetic
    if (childLevel === parentLevel + 1) {
      sum += Math.abs(entries[j].valor);
      childCount++;
    }
  }

  // If no direct children found, try summing ALL deeper entries (flat structure)
  if (!foundDeeperEntries || childCount < 2) {
    // Try alternative: just sum all immediately following entries until we find
    // another entry at the same level
    sum = 0;
    childCount = 0;
    for (let j = parentIndex + 1; j < entries.length; j++) {
      const childLevel = levels[j];
      if (childLevel <= parentLevel && j > parentIndex + 1) break;
      if (childLevel > parentLevel) {
        sum += Math.abs(entries[j].valor);
        childCount++;
      }
    }
  }

  if (childCount >= 2 && parentVal > 0) {
    const diff = Math.abs(sum - parentVal);
    const relDiff = diff / parentVal;
    if (relDiff <= tolerance) {
      return `Totalizador: valor ≈ soma de ${childCount} subcontas`;
    }
  }

  return null;
}

/**
 * Check if there are entries at a deeper indent level immediately following this entry.
 */
function hasChildrenBelow(levels: number[], index: number): boolean {
  if (index + 1 >= levels.length) return false;
  return levels[index + 1] > levels[index];
}

/**
 * Infer indent level from the account name when the actual indent level is not available.
 * Uses known accounting hierarchy patterns.
 */
function inferIndentLevel(conta: string): number {
  const norm = normalizeText(conta);

  // Level 0: Top-level groups
  if (KNOWN_SYNTHETIC_EXACT.has(norm)) return 0;

  // Level 1: Sub-groups
  if (GENERIC_GROUP_PATTERNS.some((p) => norm === p)) return 1;

  // Level 2: Most specific accounts
  return 2;
}

/**
 * Check if a name matches a known generic group name pattern.
 */
function isGenericGroupName(normalized: string): boolean {
  return GENERIC_GROUP_PATTERNS.some(
    (p) => normalized === p || normalized.startsWith(p)
  );
}

/**
 * Validation: Compare sum of analytic entries against the synthetic total.
 * Returns warnings if there's a significant discrepancy.
 */
export function validateAgainstSyntheticTotals<T extends SyntheticDetectionInput & SyntheticDetectionResult>(
  entries: T[],
  tolerance: number = 0.05
): string[] {
  const warnings: string[] = [];

  // Find the "ATIVO" total (synthetic)
  const ativoSynth = entries.find(
    (e) => normalizeText(e.conta) === "ATIVO" && e.natureza_conta === "sintetica"
  );

  if (ativoSynth) {
    const ativoAnalytics = entries.filter(
      (e) =>
        e.natureza_conta === "analitica" &&
        isAtivoEntry(normalizeText(e.conta))
    );
    const sumAnalytics = ativoAnalytics.reduce((s, e) => s + Math.abs(e.valor), 0);
    const synthVal = Math.abs(ativoSynth.valor);

    if (synthVal > 0 && Math.abs(sumAnalytics - synthVal) / synthVal > tolerance) {
      warnings.push(
        `⚠️ Divergência no Ativo: soma analítica (${sumAnalytics.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) ≠ total sintético (${synthVal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Verifique a classificação.`
      );
    }
  }

  return warnings;
}

function isAtivoEntry(norm: string): boolean {
  // Simple heuristic - this would be better with section tracking
  const ativoKeywords = [
    "CAIXA", "BANCO", "DISPONIBILIDADES", "APLICAC", "ESTOQUE",
    "CLIENTES", "CONTAS A RECEBER", "IMOBILIZADO", "INTANGIVEL",
    "INVESTIMENTO", "REALIZAVEL", "ATIVO",
  ];
  return ativoKeywords.some((k) => norm.includes(k));
}
