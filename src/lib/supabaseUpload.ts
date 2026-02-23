import { supabase } from "@/integrations/supabase/client";
import {
  parseDREFileAuto,
  parseBalancoFileAuto,
  ParsedDREEntry,
  ParsedBalancoEntry,
  BalancoMetrics,
  ValidationRow,
} from "./brazilianParser";

export interface UploadResult {
  success: boolean;
  inserted_dre: number;
  inserted_balanco: number;
  errors: string[];
  dre_entries?: ParsedDREEntry[];
  balanco_entries?: ParsedBalancoEntry[];
  balanco_metrics?: BalancoMetrics;
  balanco_validation?: ValidationRow[];
  ai_stats?: { total: number; from_cache: number; from_ai: number };
}

interface ClassificationResult {
  descricao: string;
  grupo: string;
  motivo: string;
}

/**
 * Call the AI classification edge function
 */
async function classifyWithAI(
  entries: { descricao: string; valor: number; valor_anterior?: number | null }[],
  contextoTipo: string
): Promise<{ classifications: ClassificationResult[]; stats: { total: number; from_cache: number; from_ai: number } } | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return null;

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/classify-accounts`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          entries: entries.map((e, i) => ({
            descricao: e.descricao,
            valor: e.valor,
            valor_anterior: e.valor_anterior,
            posicao_relativa: i,
          })),
          contexto_tipo: contextoTipo,
        }),
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error("AI classification error:", response.status, errData);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("AI classification failed:", error);
    return null;
  }
}

export async function uploadAndProcessFiles(
  dreFile: File,
  balancoFile: File,
  userId: string,
  empresaId?: string,
  onProgress?: (stage: string) => void
): Promise<UploadResult> {
  const errors: string[] = [];

  try {
    // Step 1: Clear previous entries
    onProgress?.("Limpando dados anteriores...");
    if (empresaId) {
      await supabase.from("dre_entries").delete().eq("user_id", userId).eq("empresa_id", empresaId);
      await supabase.from("balanco_entries").delete().eq("user_id", userId).eq("empresa_id", empresaId);
    } else {
      await supabase.from("dre_entries").delete().eq("user_id", userId);
      await supabase.from("balanco_entries").delete().eq("user_id", userId);
    }

    // Step 2: Parse files
    onProgress?.("Lendo arquivos contábeis...");
    const dreResult = await parseDREFileAuto(dreFile);
    errors.push(...dreResult.errors);

    const balancoResult = await parseBalancoFileAuto(balancoFile);
    errors.push(...balancoResult.errors);

    const dreParsed = !!dreResult.parsed;
    const balancoParsed = !!balancoResult.parsed;
    const dreHasNumeric = dreParsed === true;
    const balancoHasNumeric = balancoParsed === true || balancoResult.metrics?.ativoTotal !== 0;

    console.log("Resumo XLS:", {
      dre_entries: dreResult.entries.length,
      balanco_entries: balancoResult.entries.length,
      ativoTotal: balancoResult.metrics.ativoTotal,
      dreParsed,
      balancoParsed,
    });

    const hasAnyValidData =
      dreHasNumeric || balancoHasNumeric || dreResult.entries.length > 0 || balancoResult.entries.length > 0;

    if (!hasAnyValidData) {
      return {
        success: false,
        inserted_dre: 0,
        inserted_balanco: 0,
        errors: [
          "Não foi possível interpretar a estrutura dos arquivos enviados. Verifique se são arquivos válidos da contabilidade.",
        ],
      };
    }

    // Step 3: AI Classification for DRE entries
    let aiStats: { total: number; from_cache: number; from_ai: number } | undefined;

    if (dreResult.entries.length > 0) {
      onProgress?.("IA analisando estrutura contábil...");

      const aiResult = await classifyWithAI(
        dreResult.entries.map((e) => ({
          descricao: e.descricao,
          valor: e.valor,
          valor_anterior: e.valor_anterior,
        })),
        "dre"
      );

      if (aiResult && aiResult.classifications.length > 0) {
        // Apply AI classifications to entries
        for (let i = 0; i < dreResult.entries.length; i++) {
          const classification = aiResult.classifications[i];
          if (classification) {
            dreResult.entries[i].grupo = classification.grupo;
          }
        }
        aiStats = aiResult.stats;
        console.log("IA classificou:", aiStats);
      } else {
        // Fallback: keep parser classifications (regex-based)
        console.warn("AI classification failed, using parser fallback");
        errors.push("Classificação via IA falhou. Usando classificação local como fallback.");
      }
    }

    // Step 4: Insert DRE entries
    onProgress?.("Salvando dados da DRE...");
    let insertedDre = 0;
    const dreBatches = chunkArray(dreResult.entries, 500);
    for (const batch of dreBatches) {
      const { error } = await supabase.from("dre_entries").insert(
        batch.map((entry) => ({
          user_id: userId,
          empresa_id: empresaId || null,
          periodo: dreResult.periodo,
          descricao: entry.descricao,
          valor: entry.valor,
          valor_anterior: entry.valor_anterior,
          raw_row: entry.raw_row,
          grupo: entry.grupo,
        })),
      );
      if (error) {
        errors.push(`Erro ao inserir DRE: ${error.message}`);
      } else {
        insertedDre += batch.length;
      }
    }

    // Step 5: Insert Balanço entries
    onProgress?.("Salvando dados do Balanço...");
    let insertedBalanco = 0;
    const balancoBatches = chunkArray(balancoResult.entries, 500);
    for (const batch of balancoBatches) {
      const { error } = await supabase.from("balanco_entries").insert(
        batch.map((entry) => ({
          user_id: userId,
          empresa_id: empresaId || null,
          periodo: balancoResult.periodo,
          conta: entry.conta,
          tipo: entry.tipo,
          valor: entry.valor,
          valor_anterior: entry.valor_anterior,
          hierarchy: entry.hierarchy,
          raw_row: entry.raw_row,
        })),
      );
      if (error) {
        errors.push(`Erro ao inserir Balanço: ${error.message}`);
      } else {
        insertedBalanco += batch.length;
      }
    }

    if (dreParsed && insertedDre === 0) {
      errors.push("DRE foi lido, mas nenhuma linha foi materializada para persistência (entries=0).");
    }
    if (balancoParsed && insertedBalanco === 0) {
      errors.push("Balanço foi lido, mas nenhuma linha foi materializada para persistência (entries=0).");
    }

    // Save validation logs
    if (balancoResult.validationRows && balancoResult.validationRows.length > 0) {
      await supabase.from("xls_validation_logs").delete().eq("user_id", userId).eq("tipo", "balanco");
      await supabase.from("xls_validation_logs").insert([{
        user_id: userId,
        tipo: "balanco" as const,
        filename: balancoFile.name,
        validation_rows: JSON.parse(JSON.stringify(balancoResult.validationRows)),
      }]);
    }

    onProgress?.("Concluído!");

    return {
      success: dreParsed || balancoParsed,
      inserted_dre: insertedDre,
      inserted_balanco: insertedBalanco,
      errors,
      dre_entries: dreResult.entries,
      balanco_entries: balancoResult.entries,
      balanco_metrics: balancoResult.metrics,
      balanco_validation: balancoResult.validationRows,
      ai_stats: aiStats,
    };
  } catch (error) {
    return {
      success: false,
      inserted_dre: 0,
      inserted_balanco: 0,
      errors: [error instanceof Error ? error.message : "Erro desconhecido ao processar arquivos."],
    };
  }
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Generate downloadable JSON
export function generateDownloadableJSON(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
