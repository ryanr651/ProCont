/**
 * Synthetic vs Analytic Account Detector
 * 
 * Identifies which accounting entries are "synthetic" (group totals) vs "analytic" (leaf/detail accounts).
 * Only analytic (leaf) accounts should be summed in dashboard indicators to avoid double-counting.
 * 
 * Strategy: Pure mathematical sum-matching (does NOT depend on indentation or bold).
 * Multi-pass approach: each pass finds new synthetics, until stable.
 */

function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

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
 * Main entry point. Detects synthetic entries using multi-pass sum matching.
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

  // Pass 0: Mark known synthetic names
  for (let i = 0; i < results.length; i++) {
    const norm = normalizeText(results[i].conta);
    if (KNOWN_SYNTHETIC_EXACT.has(norm)) {
      results[i].natureza_conta = "sintetica";
      results[i].detection_motivo = "Totalizador de Grupo";
    }
  }

  // Multi-pass: detect sum-of-following-entries patterns
  // Each pass may reveal new synthetics; repeat until stable
  let changed = true;
  let passes = 0;
  const MAX_PASSES = 10;

  while (changed && passes < MAX_PASSES) {
    changed = false;
    passes++;

    for (let i = 0; i < results.length; i++) {
      if (results[i].natureza_conta === "sintetica") continue;

      const val = Math.abs(results[i].valor);
      if (val === 0) continue;

      // Strategy 1: Single-child match (next non-synthetic entry has same value)
      const nextAnalytic = findNextAnalytic(results, i + 1);
      if (nextAnalytic !== -1 && Math.abs(Math.abs(results[nextAnalytic].valor) - val) / val <= tolerance) {
        // Check that there isn't another entry after with a different value at the "same group"
        // i.e., the single child pattern: A=100 → B=100 (B is the leaf, A is synthetic)
        results[i].natureza_conta = "sintetica";
        results[i].detection_motivo = `Totalizador: valor igual à subconta "${results[nextAnalytic].conta}"`;
        changed = true;
        continue;
      }

      // Strategy 2: Sum of consecutive following non-synthetic entries
      const sumResult = checkSumOfFollowing(results, i, val, tolerance);
      if (sumResult) {
        results[i].natureza_conta = "sintetica";
        results[i].detection_motivo = sumResult;
        changed = true;
        continue;
      }
    }
  }

  console.log(`[Synthetic Detection] ${results.filter(r => r.natureza_conta === 'sintetica').length} sintéticas / ${results.length} total (${passes} passes)`);

  return results;
}

/**
 * Find the index of the next analytic entry starting from `start`.
 */
function findNextAnalytic<T extends SyntheticDetectionResult>(
  entries: T[],
  start: number
): number {
  for (let j = start; j < entries.length; j++) {
    if (entries[j].natureza_conta === "analitica") return j;
  }
  return -1;
}

/**
 * Check if entry[i]'s value ≈ sum of consecutive following non-synthetic entries.
 * 
 * We accumulate values of following non-synthetic entries. If at any point 
 * the running sum ≈ the parent value, it's a synthetic entry.
 * We stop if the sum exceeds the parent value significantly.
 */
function checkSumOfFollowing<T extends SyntheticDetectionInput & SyntheticDetectionResult>(
  entries: T[],
  parentIndex: number,
  parentVal: number,
  tolerance: number
): string | null {
  if (parentVal === 0) return null;

  let sum = 0;
  let childCount = 0;

  for (let j = parentIndex + 1; j < entries.length; j++) {
    // Skip already-detected synthetics (they are totals themselves)
    if (entries[j].natureza_conta === "sintetica") continue;

    const childVal = Math.abs(entries[j].valor);
    sum += childVal;
    childCount++;

    // Check if accumulated sum matches parent
    if (childCount >= 2) {
      const diff = Math.abs(sum - parentVal);
      const relDiff = diff / parentVal;
      if (relDiff <= tolerance) {
        return `Totalizador: valor ≈ soma de ${childCount} subcontas`;
      }
    }

    // If sum already exceeds parent by too much, stop looking
    if (sum > parentVal * (1 + tolerance * 2)) {
      break;
    }
  }

  return null;
}

/**
 * Validation: Compare sum of analytic entries against the synthetic total.
 */
export function validateAgainstSyntheticTotals<T extends SyntheticDetectionInput & SyntheticDetectionResult & { tipo?: string }>(
  entries: T[],
  tolerance: number = 0.05
): string[] {
  const warnings: string[] = [];

  const ativoSynth = entries.find(
    (e) => normalizeText(e.conta) === "ATIVO" && e.natureza_conta === "sintetica"
  );

  if (ativoSynth) {
    // Use tipo field to identify ativo entries (from balanco_entries)
    const ativoAnalytics = entries.filter(
      (e) =>
        e.natureza_conta === "analitica" &&
        (e as any).tipo?.startsWith("ATIVO")
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
