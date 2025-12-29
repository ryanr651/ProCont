import { supabase } from "@/integrations/supabase/client";
import {
  parseDREFileAuto,
  parseBalancoFileAuto,
  ParsedDREEntry,
  ParsedBalancoEntry,
  BalancoMetrics,
} from "./brazilianParser";

export interface UploadResult {
  success: boolean;
  inserted_dre: number;
  inserted_balanco: number;
  errors: string[];
  dre_entries?: ParsedDREEntry[];
  balanco_entries?: ParsedBalancoEntry[];
  balanco_metrics?: BalancoMetrics;
}

export async function uploadAndProcessFiles(dreFile: File, balancoFile: File, userId: string): Promise<UploadResult> {
  const errors: string[] = [];

  try {
    // Limpa dados anteriores
    await supabase.from("dre_entries").delete().eq("user_id", userId);
    await supabase.from("balanco_entries").delete().eq("user_id", userId);

    // ======================
    // PARSE DRE
    // ======================
    const dreResult = await parseDREFileAuto(dreFile);
    errors.push(...dreResult.errors);

    // ======================
    // PARSE BALANÇO
    // ======================
    const balancoResult = await parseBalancoFileAuto(balancoFile);
    errors.push(...balancoResult.errors);

    const hasAnyData = dreResult.entries.length > 0 || balancoResult.entries.length > 0;

    if (!hasAnyData) {
      return {
        success: false,
        inserted_dre: 0,
        inserted_balanco: 0,
        errors: ["Nenhum dado válido foi identificado nos arquivos enviados."],
      };
    }

    // ======================
    // INSERT DRE
    // ======================
    let insertedDre = 0;

    for (const batch of chunkArray(dreResult.entries, 500)) {
      const { error } = await supabase.from("dre_entries").insert(
        batch.map((entry) => ({
          user_id: userId,
          periodo: dreResult.periodo ?? "",
          descricao: entry.descricao,
          valor: entry.valor,
          valor_anterior: entry.valor_anterior,
          raw_row: entry.raw_row,
        })),
      );

      if (error) {
        errors.push(`Erro ao inserir DRE: ${error.message}`);
      } else {
        insertedDre += batch.length;
      }
    }

    // ======================
    // INSERT BALANÇO
    // ======================
    let insertedBalanco = 0;

    for (const batch of chunkArray(balancoResult.entries, 500)) {
      const { error } = await supabase.from("balanco_entries").insert(
        batch.map((entry) => ({
          user_id: userId,
          periodo: balancoResult.periodo ?? "",
          conta: entry.conta,
          tipo: entry.tipo,
          valor: entry.valor,
          valor_anterior: entry.valor_anterior,
          hierarchy: String(entry.hierarchy),
          raw_row: entry.raw_row,
        })),
      );

      if (error) {
        errors.push(`Erro ao inserir Balanço: ${error.message}`);
      } else {
        insertedBalanco += batch.length;
      }
    }

    return {
      success: true,
      inserted_dre: insertedDre,
      inserted_balanco: insertedBalanco,
      errors,
      dre_entries: dreResult.entries,
      balanco_entries: balancoResult.entries,
      balanco_metrics: balancoResult.metrics,
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

// ======================
// HELPERS
// ======================
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Download JSON utilitário
export function generateDownloadableJSON(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
